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

  delete from public.telegram_link_codes as link_code
  where
    link_code.user_id = caller_id
    and link_code.consumed_at is null;

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

  return query
  select
    issued_at + interval '10 minutes',
    profile.telegram_chat_id is not null
  from public.profiles as profile
  where profile.user_id = caller_id;
end;
$$;

revoke all on function public.create_telegram_link_code(text)
from public, anon;
grant execute on function public.create_telegram_link_code(text)
to authenticated;

create or replace function public.consume_telegram_link_code(
  input_code_hash text,
  input_chat_id bigint
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  link_code public.telegram_link_codes%rowtype;
  linked_user_id uuid;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  if
    input_chat_id is null
    or input_chat_id <= 0
    or input_code_hash !~ '^[0-9a-f]{64}$'
  then
    return null;
  end if;

  select candidate.*
  into link_code
  from public.telegram_link_codes as candidate
  where candidate.code_hash = input_code_hash
  for update;

  if
    link_code.id is null
    or link_code.consumed_at is not null
    or link_code.expires_at <= statement_timestamp()
  then
    return null;
  end if;

  if exists (
    select 1
    from public.profiles as profile
    where
      profile.telegram_chat_id = input_chat_id
      and profile.user_id <> link_code.user_id
  ) then
    return null;
  end if;

  update public.profiles as profile
  set telegram_chat_id = input_chat_id
  where profile.user_id = link_code.user_id
  returning profile.user_id into linked_user_id;

  if linked_user_id is null then
    return null;
  end if;

  update public.telegram_link_codes as consumed
  set consumed_at = statement_timestamp()
  where consumed.id = link_code.id;

  return linked_user_id;
end;
$$;

revoke all on function public.consume_telegram_link_code(text, bigint)
from public, anon, authenticated;
grant execute on function public.consume_telegram_link_code(text, bigint)
to service_role;

create or replace function public.capture_note_atomic_for_user(
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
  first_review_date date,
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
    select 1
    from public.profiles as profile
    where profile.user_id = input_user_id
  ) then
    raise foreign_key_violation using message = 'Profile is missing';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    input_user_id::text,
    true
  );

  return query
  select *
  from public.capture_note_atomic(
    input_original_text,
    input_personal_context,
    input_note_type,
    input_summary,
    input_tags,
    input_recall_prompt,
    input_source_title,
    input_source_url,
    input_capture_channel,
    input_client_request_id,
    input_embedding
  );
end;
$$;

revoke all on function public.capture_note_atomic_for_user(
  uuid,
  text,
  text,
  public.note_type,
  text,
  text[],
  text,
  text,
  text,
  public.capture_channel,
  uuid,
  extensions.vector
) from public, anon, authenticated;

grant execute on function public.capture_note_atomic_for_user(
  uuid,
  text,
  text,
  public.note_type,
  text,
  text[],
  text,
  text,
  text,
  public.capture_channel,
  uuid,
  extensions.vector
) to service_role;

create or replace function public.match_notes_for_user(
  input_user_id uuid,
  query_embedding extensions.vector(1536),
  match_count integer default 8
)
returns table (
  note_id uuid,
  original_text text,
  personal_context text,
  note_type public.note_type,
  summary text,
  tags text[],
  recall_prompt text,
  source_title text,
  source_url text,
  captured_at timestamptz,
  similarity double precision
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

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    input_user_id::text,
    true
  );

  return query
  select *
  from public.match_notes(query_embedding, match_count);
end;
$$;

revoke all on function public.match_notes_for_user(
  uuid,
  extensions.vector,
  integer
) from public, anon, authenticated;

grant execute on function public.match_notes_for_user(
  uuid,
  extensions.vector,
  integer
) to service_role;
