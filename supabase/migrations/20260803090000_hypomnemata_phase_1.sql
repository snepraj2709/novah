-- Idea 1: additive Active Practice foundation.

create type public.practice_status as enum ('active', 'paused', 'integrated');
create type public.practice_entry_kind as enum ('reflection', 'story');
create type public.practice_source_channel as enum (
  'web',
  'telegram_text',
  'telegram_voice'
);
create type public.practice_event_kind as enum (
  'activation',
  'reread',
  'interval_change',
  'pause',
  'ready_to_resume',
  'resume',
  'integration',
  'integration_confirmation',
  'stopped_check_ins'
);
create type public.telegram_reply_intent as enum (
  'reflection',
  'story',
  'interval'
);

alter table public.profiles
  rename column review_time to practice_time;

alter table public.profiles
  add column last_practice_interval_days smallint not null default 1,
  add constraint profiles_practice_interval_range check (
    last_practice_interval_days between 1 and 30
  );

create table public.note_practices (
  note_id uuid primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  status public.practice_status not null,
  interval_days smallint not null default 1,
  next_due_on date,
  paused_until date,
  ready_to_resume boolean not null default false,
  integrated_at timestamptz,
  check_ins_enabled boolean not null default false,
  next_check_in_on date,
  last_practised_at timestamptz,
  active_notification_claimed_at timestamptz,
  active_notification_sent_on date,
  check_in_notification_claimed_at timestamptz,
  check_in_notification_sent_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_practices_owned_note_fk
    foreign key (note_id, user_id)
    references public.notes(id, user_id)
    on delete cascade,
  constraint note_practices_interval_range check (interval_days between 1 and 30),
  constraint note_practices_state_valid check (
    (
      status = 'active'
      and next_due_on is not null
      and paused_until is null
      and ready_to_resume = false
      and integrated_at is null
      and check_ins_enabled = false
      and next_check_in_on is null
    )
    or (
      status = 'paused'
      and next_due_on is null
      and integrated_at is null
      and check_ins_enabled = false
      and next_check_in_on is null
    )
    or (
      status = 'integrated'
      and next_due_on is null
      and paused_until is null
      and ready_to_resume = false
      and integrated_at is not null
      and (check_ins_enabled or next_check_in_on is null)
      and (check_ins_enabled or check_in_notification_sent_on is null)
    )
  )
);

create table public.practice_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  note_id uuid not null,
  kind public.practice_entry_kind not null,
  text text not null,
  source_channel public.practice_source_channel not null,
  created_at timestamptz not null default now(),
  constraint practice_entries_owned_note_fk
    foreign key (note_id, user_id)
    references public.notes(id, user_id)
    on delete cascade,
  constraint practice_entries_text_valid check (
    pg_catalog.char_length(pg_catalog.btrim(text)) between 1 and 5000
  )
);

create table public.practice_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  note_id uuid not null,
  event_kind public.practice_event_kind not null,
  occurred_at timestamptz not null default now(),
  local_date date not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint practice_events_owned_note_fk
    foreign key (note_id, user_id)
    references public.notes(id, user_id)
    on delete cascade,
  constraint practice_events_metadata_object check (
    jsonb_typeof(metadata) = 'object'
    and pg_catalog.octet_length(metadata::text) <= 512
  )
);

create unique index practice_events_single_activation_idx
  on public.practice_events (note_id)
  where event_kind = 'activation';
create unique index practice_events_daily_reread_idx
  on public.practice_events (note_id, local_date)
  where event_kind = 'reread';

create table public.telegram_reply_prompts (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  prompt_message_id bigint not null,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  note_id uuid not null,
  intent public.telegram_reply_intent not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint telegram_reply_prompts_owned_note_fk
    foreign key (note_id, user_id)
    references public.notes(id, user_id)
    on delete cascade,
  constraint telegram_reply_prompts_message_unique unique (
    chat_id,
    prompt_message_id
  ),
  constraint telegram_reply_prompts_expiry_valid check (expires_at > created_at)
);

create index note_practices_active_due_idx
  on public.note_practices (user_id, next_due_on)
  where status = 'active';
create index practice_entries_thread_idx
  on public.practice_entries (note_id, created_at, id);
create index practice_events_user_time_idx
  on public.practice_events (user_id, occurred_at desc, id);
create index telegram_reply_prompts_pending_idx
  on public.telegram_reply_prompts (chat_id, prompt_message_id, expires_at)
  where consumed_at is null;

create trigger note_practices_set_updated_at
before update on public.note_practices
for each row execute function public.set_updated_at();

alter table public.note_practices enable row level security;
alter table public.practice_entries enable row level security;
alter table public.practice_events enable row level security;
alter table public.telegram_reply_prompts enable row level security;

create policy note_practices_select_own
on public.note_practices for select to authenticated
using ((select auth.uid()) = user_id);
create policy practice_entries_select_own
on public.practice_entries for select to authenticated
using ((select auth.uid()) = user_id);
create policy practice_events_select_own
on public.practice_events for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.note_practices from public, anon, authenticated;
revoke all on table public.practice_entries from public, anon, authenticated;
revoke all on table public.practice_events from public, anon, authenticated;
revoke all on table public.telegram_reply_prompts from public, anon, authenticated;
grant select on table public.note_practices to authenticated;
grant select on table public.practice_entries to authenticated;
grant select on table public.practice_events to authenticated;
grant all on table public.note_practices to service_role;
grant all on table public.practice_entries to service_role;
grant all on table public.practice_events to service_role;
grant all on table public.telegram_reply_prompts to service_role;

grant usage on type public.practice_status to authenticated, service_role;
grant usage on type public.practice_entry_kind to authenticated, service_role;
grant usage on type public.practice_source_channel to authenticated, service_role;
grant usage on type public.practice_event_kind to authenticated, service_role;
grant usage on type public.telegram_reply_intent to authenticated, service_role;

create or replace function public.practice_local_date(
  input_user_id uuid,
  input_now timestamptz default statement_timestamp()
)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (input_now at time zone profile.timezone)::date
  from public.profiles as profile
  where profile.user_id = input_user_id;
$$;

revoke all on function public.practice_local_date(uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.practice_local_date(uuid, timestamptz)
to service_role;

create or replace function public.manage_practice_core(
  input_user_id uuid,
  input_action text,
  input_note_id uuid,
  input_now timestamptz default statement_timestamp()
)
returns table (
  note_id uuid,
  status public.practice_status,
  interval_days smallint,
  next_due_on date,
  paused_until date,
  ready_to_resume boolean,
  integrated_at timestamptz,
  check_ins_enabled boolean,
  next_check_in_on date,
  last_practised_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  local_today date;
  current_practice public.note_practices%rowtype;
  inserted_count integer := 0;
begin
  if input_action not in ('activate', 'reread') then
    raise check_violation using message = 'invalid_transition';
  end if;

  select (input_now at time zone profile.timezone)::date
  into local_today
  from public.profiles as profile
  where profile.user_id = input_user_id
  for update;

  if local_today is null then
    raise foreign_key_violation using message = 'practice_not_found';
  end if;

  if not exists (
    select 1 from public.notes as note
    where note.id = input_note_id and note.user_id = input_user_id
  ) then
    raise no_data_found using message = 'practice_not_found';
  end if;

  select practice.* into current_practice
  from public.note_practices as practice
  where practice.note_id = input_note_id and practice.user_id = input_user_id
  for update;

  if input_action = 'activate' then
    if current_practice.note_id is null then
      if (
        select count(*)
        from public.note_practices as active_practice
        where active_practice.user_id = input_user_id
          and active_practice.status = 'active'
      ) >= 3 then
        raise program_limit_exceeded using message = 'practice_slots_full';
      end if;

      insert into public.note_practices (
        note_id,
        user_id,
        status,
        interval_days,
        next_due_on
      )
      select
        input_note_id,
        input_user_id,
        'active',
        profile.last_practice_interval_days,
        local_today + 1
      from public.profiles as profile
      where profile.user_id = input_user_id
      returning * into current_practice;

      insert into public.practice_events (
        user_id,
        note_id,
        event_kind,
        occurred_at,
        local_date
      ) values (
        input_user_id,
        input_note_id,
        'activation',
        input_now,
        local_today
      ) on conflict do nothing;
    elsif current_practice.status <> 'active' then
      raise check_violation using message = 'invalid_transition';
    end if;
  else
    if current_practice.note_id is null then
      raise no_data_found using message = 'practice_not_found';
    end if;
    if current_practice.status <> 'active' then
      raise check_violation using message = 'invalid_transition';
    end if;

    if current_practice.next_due_on <= local_today then
      insert into public.practice_events (
        user_id,
        note_id,
        event_kind,
        occurred_at,
        local_date
      ) values (
        input_user_id,
        input_note_id,
        'reread',
        input_now,
        local_today
      ) on conflict do nothing;
      get diagnostics inserted_count = row_count;

      if inserted_count = 1 then
        update public.note_practices as practice
        set
          next_due_on = local_today + practice.interval_days,
          last_practised_at = input_now,
          active_notification_claimed_at = null
        where practice.note_id = input_note_id
          and practice.user_id = input_user_id
        returning * into current_practice;
      end if;
    end if;
  end if;

  return query select
    current_practice.note_id,
    current_practice.status,
    current_practice.interval_days,
    current_practice.next_due_on,
    current_practice.paused_until,
    current_practice.ready_to_resume,
    current_practice.integrated_at,
    current_practice.check_ins_enabled,
    current_practice.next_check_in_on,
    current_practice.last_practised_at;
end;
$$;

revoke all on function public.manage_practice_core(uuid, text, uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.manage_practice_core(uuid, text, uuid, timestamptz)
to service_role;

create or replace function public.manage_practice(
  input_action text,
  input_note_id uuid
)
returns table (
  note_id uuid,
  status public.practice_status,
  interval_days smallint,
  next_due_on date,
  paused_until date,
  ready_to_resume boolean,
  integrated_at timestamptz,
  check_ins_enabled boolean,
  next_check_in_on date,
  last_practised_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  return query select * from public.manage_practice_core(
    caller_id,
    input_action,
    input_note_id,
    statement_timestamp()
  );
end;
$$;

revoke all on function public.manage_practice(text, uuid) from public, anon;
grant execute on function public.manage_practice(text, uuid) to authenticated;

create or replace function public.manage_practice_for_user(
  input_user_id uuid,
  input_action text,
  input_note_id uuid
)
returns table (
  note_id uuid,
  status public.practice_status,
  interval_days smallint,
  next_due_on date,
  paused_until date,
  ready_to_resume boolean,
  integrated_at timestamptz,
  check_ins_enabled boolean,
  next_check_in_on date,
  last_practised_at timestamptz
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
  return query select * from public.manage_practice_core(
    input_user_id,
    input_action,
    input_note_id,
    statement_timestamp()
  );
end;
$$;

revoke all on function public.manage_practice_for_user(uuid, text, uuid)
from public, anon, authenticated;
grant execute on function public.manage_practice_for_user(uuid, text, uuid)
to service_role;

create or replace function public.claim_due_practices(
  input_user_id uuid,
  input_local_date date,
  input_claimed_at timestamptz
)
returns table (
  note_id uuid,
  original_text text,
  source_title text,
  next_due_on date
)
language sql
volatile
security definer
set search_path = ''
as $$
  with claimed as (
    select practice.note_id
    from public.note_practices as practice
    where practice.user_id = input_user_id
      and practice.status = 'active'
      and practice.next_due_on <= input_local_date
      and (
        practice.active_notification_sent_on is null
        or practice.active_notification_sent_on < input_local_date
      )
      and (
        practice.active_notification_claimed_at is null
        or practice.active_notification_claimed_at < input_claimed_at - interval '15 minutes'
      )
    order by practice.next_due_on, practice.note_id
    for update skip locked
  ), updated as (
    update public.note_practices as practice
    set active_notification_claimed_at = input_claimed_at
    from claimed
    where practice.note_id = claimed.note_id
    returning practice.note_id, practice.next_due_on
  )
  select updated.note_id, note.original_text, note.source_title, updated.next_due_on
  from updated
  join public.notes as note on note.id = updated.note_id
  order by updated.next_due_on, updated.note_id;
$$;

revoke all on function public.claim_due_practices(uuid, date, timestamptz)
from public, anon, authenticated;
grant execute on function public.claim_due_practices(uuid, date, timestamptz)
to service_role;

create or replace function public.mark_practice_notification_sent(
  input_user_id uuid,
  input_note_id uuid,
  input_local_date date,
  input_sent_at timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.note_practices as practice
  set
    active_notification_sent_on = input_local_date,
    active_notification_claimed_at = null
  where practice.user_id = input_user_id
    and practice.note_id = input_note_id
    and practice.active_notification_claimed_at is not null
    and practice.status = 'active';
  return found;
end;
$$;

revoke all on function public.mark_practice_notification_sent(uuid, uuid, date, timestamptz)
from public, anon, authenticated;
grant execute on function public.mark_practice_notification_sent(uuid, uuid, date, timestamptz)
to service_role;

-- Capture stays atomic but no longer creates Review rows or returns a review date.
drop function public.capture_note_atomic_for_user(
  uuid, text, text, public.note_type, text, text[], text, text, text,
  public.capture_channel, uuid, extensions.vector
);
drop function public.capture_note_atomic(
  text, text, public.note_type, text, text[], text, text, text,
  public.capture_channel, uuid, extensions.vector
);

create function public.capture_note_atomic(
  input_original_text text,
  input_personal_context text,
  input_note_type public.note_type,
  input_summary text,
  input_tags text[],
  input_recall_prompt text,
  input_source_title text,
  input_source_url text,
  input_capture_channel public.capture_channel,
  input_client_request_id uuid,
  input_embedding extensions.vector(1536)
)
returns table (
  note_id uuid,
  stored_original_text text,
  stored_note_type public.note_type,
  stored_summary text,
  stored_tags text[],
  created boolean
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  captured_note public.notes%rowtype;
  was_created boolean := false;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  insert into public.notes (
    user_id, client_request_id, original_text, personal_context, note_type,
    summary, tags, recall_prompt, source_title, source_url, capture_channel,
    embedding
  ) values (
    caller_id, input_client_request_id, input_original_text,
    input_personal_context, input_note_type, input_summary, input_tags,
    input_recall_prompt, input_source_title, input_source_url,
    input_capture_channel, input_embedding
  )
  on conflict (user_id, client_request_id) do nothing
  returning * into captured_note;

  if captured_note.id is not null then
    was_created := true;
  else
    select note.* into strict captured_note
    from public.notes as note
    where note.user_id = caller_id
      and note.client_request_id = input_client_request_id;
  end if;

  return query select
    captured_note.id,
    captured_note.original_text,
    captured_note.note_type,
    captured_note.summary,
    captured_note.tags,
    was_created;
end;
$$;

revoke all on function public.capture_note_atomic(
  text, text, public.note_type, text, text[], text, text, text,
  public.capture_channel, uuid, extensions.vector
) from public, anon;
grant execute on function public.capture_note_atomic(
  text, text, public.note_type, text, text[], text, text, text,
  public.capture_channel, uuid, extensions.vector
) to authenticated;

create function public.capture_note_atomic_for_user(
  input_user_id uuid,
  input_original_text text,
  input_personal_context text,
  input_note_type public.note_type,
  input_summary text,
  input_tags text[],
  input_recall_prompt text,
  input_source_title text,
  input_source_url text,
  input_capture_channel public.capture_channel,
  input_client_request_id uuid,
  input_embedding extensions.vector(1536)
)
returns table (
  note_id uuid,
  stored_original_text text,
  stored_note_type public.note_type,
  stored_summary text,
  stored_tags text[],
  created boolean
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
  if not exists (
    select 1 from public.profiles where user_id = input_user_id
  ) then
    raise foreign_key_violation using message = 'Profile is missing';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', input_user_id::text, true);
  return query select * from public.capture_note_atomic(
    input_original_text, input_personal_context, input_note_type,
    input_summary, input_tags, input_recall_prompt, input_source_title,
    input_source_url, input_capture_channel, input_client_request_id,
    input_embedding
  );
end;
$$;

revoke all on function public.capture_note_atomic_for_user(
  uuid, text, text, public.note_type, text, text[], text, text, text,
  public.capture_channel, uuid, extensions.vector
) from public, anon, authenticated;
grant execute on function public.capture_note_atomic_for_user(
  uuid, text, text, public.note_type, text, text[], text, text, text,
  public.capture_channel, uuid, extensions.vector
) to service_role;

-- Preserve the renamed preference while preventing direct mutation of Practice state.
revoke insert (user_id, timezone, digest_time, practice_time)
on table public.profiles from authenticated;
revoke update (timezone, digest_time, practice_time)
on table public.profiles from authenticated;
grant insert (user_id, timezone, digest_time, practice_time, last_practice_interval_days)
on table public.profiles to authenticated;
grant update (timezone, practice_time)
on table public.profiles to authenticated;
