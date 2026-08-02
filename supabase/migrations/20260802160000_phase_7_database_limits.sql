-- Mirror the public capture/enrichment contracts at the storage boundary so
-- authenticated direct-table writes cannot bypass Edge Function limits.

create or replace function public.are_normalized_tags(input_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    input_tags is not null
    and pg_catalog.cardinality(input_tags) between 0 and 5
    and not exists (
      select 1
      from pg_catalog.unnest(input_tags) as tag(value)
      where
        value is null
        or value !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )
    and pg_catalog.cardinality(input_tags) = (
      select pg_catalog.count(distinct value)
      from pg_catalog.unnest(input_tags) as tag(value)
    );
$$;

alter table public.notes
  drop constraint notes_original_text_present,
  drop constraint notes_personal_context_length,
  drop constraint notes_summary_length,
  drop constraint notes_tags_normalized,
  drop constraint notes_source_url_http,
  add constraint notes_original_text_length check (
    pg_catalog.char_length(original_text) between 1 and 20000
  ),
  add constraint notes_personal_context_length check (
    personal_context is null
    or (
      pg_catalog.char_length(personal_context) between 1 and 2000
      and personal_context ~ '[^[:space:]]'
    )
  ),
  add constraint notes_summary_length check (
    pg_catalog.char_length(summary) between 1 and 500
    and summary ~ '[^[:space:]]'
  ),
  add constraint notes_recall_prompt_length check (
    pg_catalog.char_length(recall_prompt) between 1 and 500
    and recall_prompt ~ '[^[:space:]]'
  ),
  add constraint notes_source_title_length check (
    source_title is null
    or (
      pg_catalog.char_length(source_title) between 1 and 500
      and source_title ~ '[^[:space:]]'
    )
  ),
  add constraint notes_tags_normalized check (public.are_normalized_tags(tags)),
  add constraint notes_source_url_http check (
    source_url is null
    or (
      pg_catalog.char_length(source_url) <= 2048
      and public.is_http_url(source_url)
    )
  );

alter table public.telegram_link_codes
  drop constraint telegram_link_codes_hash_present,
  add constraint telegram_link_codes_hash_format check (
    code_hash ~ '^[0-9a-f]{64}$'
  );

-- A Telegram chat binding is server-managed. Authenticated clients retain the
-- locked own-profile insert/update contract for user-editable columns only.
revoke insert, update on table public.profiles from authenticated;
grant insert (user_id, timezone, digest_time, review_time)
on table public.profiles to authenticated;
grant update (timezone, digest_time, review_time)
on table public.profiles to authenticated;

create or replace function public.create_telegram_link_code(
  input_code_hash text
)
returns table (
  expires_at timestamptz,
  connected boolean
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  issued_at timestamptz := statement_timestamp();
  profile_connected boolean;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  if input_code_hash !~ '^[0-9a-f]{64}$' then
    raise check_violation using message = 'Invalid link-code hash';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text, 0)
  );

  select profile.telegram_chat_id is not null
  into profile_connected
  from public.profiles as profile
  where profile.user_id = caller_id;

  delete from public.telegram_link_codes as link_code
  where
    link_code.user_id = caller_id
    and link_code.consumed_at is null;

  if profile_connected then
    return query select issued_at + interval '10 minutes', true;
    return;
  end if;

  insert into public.telegram_link_codes (
    user_id,
    code_hash,
    created_at,
    expires_at
  ) values (
    caller_id,
    input_code_hash,
    issued_at,
    issued_at + interval '10 minutes'
  );

  return query select issued_at + interval '10 minutes', false;
end;
$$;

-- Keep each mutable claim result below the API row ceiling. Excess backlog
-- remains pending and is picked up by the next ten-minute invocation.
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
    limit 80
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
