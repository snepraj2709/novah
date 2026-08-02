alter table public.review_events
add column delivery_claimed_at timestamptz;

create index review_events_unclaimed_due_idx
  on public.review_events (user_id, due_on)
  where status = 'pending' and delivery_claimed_at is null;

create or replace function public.notification_digest_notes(
  input_user_id uuid,
  input_digest_date date
)
returns table (
  note_id uuid,
  original_text text,
  personal_context text,
  summary text,
  recall_prompt text,
  source_title text,
  source_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  return query
  select
    note.id,
    note.original_text,
    note.personal_context,
    note.summary,
    note.recall_prompt,
    note.source_title,
    note.source_url
  from public.notes as note
  join public.profiles as profile on profile.user_id = note.user_id
  where
    note.user_id = input_user_id
    and (note.captured_at at time zone profile.timezone)::date = input_digest_date
  order by note.captured_at, note.id;
end;
$$;

revoke all on function public.notification_digest_notes(uuid, date)
from public, anon, authenticated;
grant execute on function public.notification_digest_notes(uuid, date)
to service_role;

create or replace function public.claim_daily_digest(
  input_user_id uuid,
  input_digest_date date,
  input_note_ids uuid[],
  input_content jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  exact_note_ids uuid[];
  claimed_digest_id uuid;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  select coalesce(
    pg_catalog.array_agg(evidence.note_id order by evidence.note_id),
    '{}'::uuid[]
  )
  into exact_note_ids
  from public.notification_digest_notes(
    input_user_id,
    input_digest_date
  ) as evidence;

  if
    pg_catalog.cardinality(exact_note_ids) = 0
    or (
      select pg_catalog.count(distinct supplied.note_id)
      from pg_catalog.unnest(input_note_ids) as supplied(note_id)
    ) <> pg_catalog.cardinality(exact_note_ids)
    or not exact_note_ids @> input_note_ids
    or not input_note_ids @> exact_note_ids
    or input_content is null
    or input_content->>'captureCount' <> pg_catalog.cardinality(exact_note_ids)::text
  then
    raise check_violation using message = 'Digest evidence does not match the local date';
  end if;

  insert into public.daily_digests (
    user_id,
    digest_date,
    note_ids,
    content
  ) values (
    input_user_id,
    input_digest_date,
    exact_note_ids,
    input_content
  )
  on conflict on constraint daily_digests_user_date_unique do nothing
  returning id into claimed_digest_id;

  return claimed_digest_id;
end;
$$;

revoke all on function public.claim_daily_digest(uuid, date, uuid[], jsonb)
from public, anon, authenticated;
grant execute on function public.claim_daily_digest(uuid, date, uuid[], jsonb)
to service_role;

create or replace function public.mark_daily_digest_sent(
  input_digest_id uuid,
  input_sent_at timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  update public.daily_digests as digest
  set sent_at = input_sent_at
  where digest.id = input_digest_id and digest.sent_at is null;

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

revoke all on function public.mark_daily_digest_sent(uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.mark_daily_digest_sent(uuid, timestamptz)
to service_role;

create or replace function public.claim_due_reviews(
  input_user_id uuid,
  input_local_date date,
  input_claimed_at timestamptz default statement_timestamp()
)
returns table (
  event_id uuid,
  note_id uuid,
  stage smallint,
  recall_prompt text,
  source_title text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  return query
  with due as (
    select review_event.id
    from public.review_events as review_event
    where
      review_event.user_id = input_user_id
      and review_event.status = 'pending'
      and review_event.delivery_claimed_at is null
      and review_event.due_on <= input_local_date
    order by review_event.due_on, review_event.stage, review_event.id
    for update skip locked
  ), claimed as (
    update public.review_events as review_event
    set delivery_claimed_at = input_claimed_at
    from due
    where review_event.id = due.id
    returning review_event.id, review_event.note_id, review_event.stage
  )
  select
    claimed.id,
    claimed.note_id,
    claimed.stage,
    note.recall_prompt,
    note.source_title
  from claimed
  join public.notes as note
    on note.id = claimed.note_id and note.user_id = input_user_id
  order by claimed.stage, claimed.id;
end;
$$;

revoke all on function public.claim_due_reviews(uuid, date, timestamptz)
from public, anon, authenticated;
grant execute on function public.claim_due_reviews(uuid, date, timestamptz)
to service_role;

create or replace function public.mark_review_packet_sent(
  input_event_ids uuid[],
  input_sent_at timestamptz default statement_timestamp()
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  update public.review_events as review_event
  set
    sent_at = coalesce(review_event.sent_at, input_sent_at),
    status = case
      when review_event.status = 'pending' then 'sent'::public.review_status
      else review_event.status
    end
  where
    review_event.id = any(input_event_ids)
    and review_event.delivery_claimed_at is not null;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

revoke all on function public.mark_review_packet_sent(uuid[], timestamptz)
from public, anon, authenticated;
grant execute on function public.mark_review_packet_sent(uuid[], timestamptz)
to service_role;

create or replace function public.reveal_review_for_user(
  input_user_id uuid,
  input_event_id uuid
)
returns table (
  original_text text,
  source_title text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  return query
  select note.original_text, note.source_title
  from public.review_events as review_event
  join public.notes as note
    on note.id = review_event.note_id and note.user_id = review_event.user_id
  where
    review_event.id = input_event_id
    and review_event.user_id = input_user_id
    and review_event.delivery_claimed_at is not null
    and review_event.status in (
      'pending'::public.review_status,
      'sent'::public.review_status
    );
end;
$$;

revoke all on function public.reveal_review_for_user(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.reveal_review_for_user(uuid, uuid)
to service_role;

create or replace function public.record_review_feedback_for_user(
  input_user_id uuid,
  input_event_id uuid,
  input_status public.review_status,
  input_answered_at timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  if input_status not in (
    'remembered'::public.review_status,
    'partial'::public.review_status,
    'missed'::public.review_status,
    'skipped'::public.review_status
  ) then
    raise check_violation using message = 'Invalid review feedback';
  end if;

  update public.review_events as review_event
  set status = input_status, answered_at = input_answered_at
  where
    review_event.id = input_event_id
    and review_event.user_id = input_user_id
    and review_event.delivery_claimed_at is not null
    and review_event.status in (
      'pending'::public.review_status,
      'sent'::public.review_status
    );

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

revoke all on function public.record_review_feedback_for_user(
  uuid,
  uuid,
  public.review_status,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.record_review_feedback_for_user(
  uuid,
  uuid,
  public.review_status,
  timestamptz
) to service_role;

create or replace function public.configure_notification_cron(
  input_cron_secret text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cron_job_name constant text := 'novah-process-notifications-10m';
  vault_secret_name constant text := 'novah_cron_secret';
  existing_secret_id uuid;
  scheduled_job_id bigint;
  job_command constant text := $command$
    select net.http_post(
      url := 'https://fqinppulljqefbvukcpg.supabase.co/functions/v1/process-notifications',
      body := '{}'::jsonb,
      headers := pg_catalog.jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select secret.decrypted_secret
          from vault.decrypted_secrets as secret
          where secret.name = 'novah_cron_secret'
        )
      ),
      timeout_milliseconds := 20000
    );
  $command$;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  if
    input_cron_secret is null
    or pg_catalog.char_length(input_cron_secret) < 32
    or pg_catalog.char_length(input_cron_secret) > 256
    or input_cron_secret ~ '[[:space:]]'
  then
    raise check_violation using message = 'Invalid Cron secret';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(cron_job_name, 0)
  );

  select secret.id
  into existing_secret_id
  from vault.secrets as secret
  where secret.name = vault_secret_name;

  if existing_secret_id is null then
    perform vault.create_secret(
      input_cron_secret,
      vault_secret_name,
      'Novah process-notifications Bearer secret',
      null
    );
  else
    perform vault.update_secret(
      existing_secret_id,
      input_cron_secret,
      vault_secret_name,
      'Novah process-notifications Bearer secret',
      null
    );
  end if;

  perform cron.unschedule(job.jobid)
  from cron.job as job
  where job.jobname = cron_job_name;

  select cron.schedule(
    cron_job_name,
    '*/10 * * * *',
    job_command
  ) into scheduled_job_id;

  return scheduled_job_id;
end;
$$;

revoke all on function public.configure_notification_cron(text)
from public, anon, authenticated;
grant execute on function public.configure_notification_cron(text)
to service_role;

create or replace function public.notification_cron_status()
returns table (
  job_id bigint,
  schedule text,
  active boolean,
  secret_exposed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  return query
  select
    job.jobid,
    job.schedule,
    job.active,
    coalesce(
      pg_catalog.strpos(
        job.command,
        (
          select secret.decrypted_secret
          from vault.decrypted_secrets as secret
          where secret.name = 'novah_cron_secret'
        )
      ) > 0,
      false
    )
  from cron.job as job
  where job.jobname = 'novah-process-notifications-10m';
end;
$$;

revoke all on function public.notification_cron_status()
from public, anon, authenticated;
grant execute on function public.notification_cron_status()
to service_role;

create or replace function public.notification_cron_last_run()
returns table (
  run_id bigint,
  status text,
  started_at timestamptz,
  ended_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  return query
  select
    run.runid,
    run.status,
    run.start_time,
    run.end_time
  from cron.job_run_details as run
  inner join cron.job as job on job.jobid = run.jobid
  where job.jobname = 'novah-process-notifications-10m'
  order by run.runid desc
  limit 1;
end;
$$;

revoke all on function public.notification_cron_last_run()
from public, anon, authenticated;
grant execute on function public.notification_cron_last_run()
to service_role;

create or replace function public.remove_notification_cron()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cron_job_id bigint;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('novah-process-notifications-10m', 0)
  );

  select job.jobid
  into cron_job_id
  from cron.job as job
  where job.jobname = 'novah-process-notifications-10m';

  if cron_job_id is null then
    return false;
  end if;

  return cron.unschedule(cron_job_id);
end;
$$;

revoke all on function public.remove_notification_cron()
from public, anon, authenticated;
grant execute on function public.remove_notification_cron()
to service_role;
