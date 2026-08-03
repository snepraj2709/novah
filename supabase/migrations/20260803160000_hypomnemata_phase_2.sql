-- Idea 2: Living Reflection Thread mutations and Telegram reply routing.

create or replace function public.normalize_practice_entry_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.text = public.normalize_whitespace(new.text);
  return new;
end;
$$;

create trigger practice_entries_normalize_text
before insert on public.practice_entries
for each row execute function public.normalize_practice_entry_text();

revoke all on function public.normalize_practice_entry_text()
from public, anon, authenticated, service_role;

-- Application callers can append through RPCs and read their thread. They
-- cannot update or delete individual entries; parent cascades remain intact.
revoke update, delete, truncate on table public.practice_entries
from service_role;
revoke all on table public.telegram_reply_prompts from service_role;

create or replace function public.add_practice_entry_core(
  input_user_id uuid,
  input_note_id uuid,
  input_kind public.practice_entry_kind,
  input_text text,
  input_source_channel public.practice_source_channel,
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
  last_practised_at timestamptz,
  entry_id uuid,
  entry_kind public.practice_entry_kind,
  entry_text text,
  entry_source_channel public.practice_source_channel,
  entry_created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  local_today date;
  normalized_text text;
  current_practice public.note_practices%rowtype;
  new_entry public.practice_entries%rowtype;
begin
  normalized_text := public.normalize_whitespace(input_text);
  if normalized_text is null or pg_catalog.char_length(normalized_text) = 0 then
    raise check_violation using message = 'invalid_transition';
  end if;
  if pg_catalog.char_length(normalized_text) > 5000 then
    raise string_data_right_truncation using message = 'entry_too_long';
  end if;

  select (input_now at time zone profile.timezone)::date
  into local_today
  from public.profiles as profile
  where profile.user_id = input_user_id;

  if local_today is null then
    raise no_data_found using message = 'practice_not_found';
  end if;

  select practice.* into current_practice
  from public.note_practices as practice
  where practice.note_id = input_note_id
    and practice.user_id = input_user_id
  for update;

  if current_practice.note_id is null then
    raise no_data_found using message = 'practice_not_found';
  end if;

  insert into public.practice_entries (
    user_id,
    note_id,
    kind,
    text,
    source_channel,
    created_at
  ) values (
    input_user_id,
    input_note_id,
    input_kind,
    normalized_text,
    input_source_channel,
    input_now
  ) returning * into new_entry;

  if current_practice.status = 'active'
    and current_practice.next_due_on <= local_today then
    update public.note_practices as practice
    set
      next_due_on = local_today + practice.interval_days,
      last_practised_at = input_now,
      active_notification_claimed_at = null
    where practice.note_id = input_note_id
      and practice.user_id = input_user_id
    returning * into current_practice;
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
    current_practice.last_practised_at,
    new_entry.id,
    new_entry.kind,
    new_entry.text,
    new_entry.source_channel,
    new_entry.created_at;
end;
$$;

revoke all on function public.add_practice_entry_core(
  uuid, uuid, public.practice_entry_kind, text,
  public.practice_source_channel, timestamptz
) from public, anon, authenticated;
grant execute on function public.add_practice_entry_core(
  uuid, uuid, public.practice_entry_kind, text,
  public.practice_source_channel, timestamptz
) to service_role;

create or replace function public.add_practice_entry(
  input_note_id uuid,
  input_kind public.practice_entry_kind,
  input_text text
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
  last_practised_at timestamptz,
  entry_id uuid,
  entry_kind public.practice_entry_kind,
  entry_text text,
  entry_source_channel public.practice_source_channel,
  entry_created_at timestamptz
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
  return query select * from public.add_practice_entry_core(
    caller_id,
    input_note_id,
    input_kind,
    input_text,
    'web',
    statement_timestamp()
  );
end;
$$;

revoke all on function public.add_practice_entry(
  uuid, public.practice_entry_kind, text
) from public, anon;
grant execute on function public.add_practice_entry(
  uuid, public.practice_entry_kind, text
) to authenticated;

create or replace function public.add_practice_entry_for_user(
  input_user_id uuid,
  input_note_id uuid,
  input_kind public.practice_entry_kind,
  input_text text,
  input_source_channel public.practice_source_channel
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
  last_practised_at timestamptz,
  entry_id uuid,
  entry_kind public.practice_entry_kind,
  entry_text text,
  entry_source_channel public.practice_source_channel,
  entry_created_at timestamptz
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
  if input_source_channel not in ('telegram_text', 'telegram_voice') then
    raise check_violation using message = 'invalid_transition';
  end if;
  return query select * from public.add_practice_entry_core(
    input_user_id,
    input_note_id,
    input_kind,
    input_text,
    input_source_channel,
    statement_timestamp()
  );
end;
$$;

revoke all on function public.add_practice_entry_for_user(
  uuid, uuid, public.practice_entry_kind, text,
  public.practice_source_channel
) from public, anon, authenticated;
grant execute on function public.add_practice_entry_for_user(
  uuid, uuid, public.practice_entry_kind, text,
  public.practice_source_channel
) to service_role;

create or replace function public.create_telegram_reply_prompt(
  input_user_id uuid,
  input_chat_id bigint,
  input_prompt_message_id bigint,
  input_note_id uuid,
  input_intent public.telegram_reply_intent,
  input_now timestamptz default statement_timestamp()
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  prompt_expires_at timestamptz := input_now + interval '24 hours';
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;
  if input_intent not in ('reflection', 'story') then
    raise check_violation using message = 'invalid_transition';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.user_id = input_user_id
      and profile.telegram_chat_id = input_chat_id
  ) or not exists (
    select 1 from public.note_practices as practice
    where practice.user_id = input_user_id
      and practice.note_id = input_note_id
  ) then
    raise no_data_found using message = 'practice_not_found';
  end if;

  insert into public.telegram_reply_prompts (
    chat_id,
    prompt_message_id,
    user_id,
    note_id,
    intent,
    expires_at,
    created_at
  ) values (
    input_chat_id,
    input_prompt_message_id,
    input_user_id,
    input_note_id,
    input_intent,
    prompt_expires_at,
    input_now
  );
  return prompt_expires_at;
end;
$$;

revoke all on function public.create_telegram_reply_prompt(
  uuid, bigint, bigint, uuid, public.telegram_reply_intent, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_telegram_reply_prompt(
  uuid, bigint, bigint, uuid, public.telegram_reply_intent, timestamptz
) to service_role;

create or replace function public.inspect_telegram_reply_prompt(
  input_user_id uuid,
  input_chat_id bigint,
  input_prompt_message_id bigint,
  input_now timestamptz default statement_timestamp()
)
returns public.telegram_reply_intent
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_prompt public.telegram_reply_prompts%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;
  select prompt.* into current_prompt
  from public.telegram_reply_prompts as prompt
  where prompt.user_id = input_user_id
    and prompt.chat_id = input_chat_id
    and prompt.prompt_message_id = input_prompt_message_id;

  if current_prompt.id is null
    or current_prompt.consumed_at is not null
    or current_prompt.expires_at <= input_now then
    raise raise_exception using message = 'reply_expired';
  end if;
  return current_prompt.intent;
end;
$$;

revoke all on function public.inspect_telegram_reply_prompt(
  uuid, bigint, bigint, timestamptz
) from public, anon, authenticated;
grant execute on function public.inspect_telegram_reply_prompt(
  uuid, bigint, bigint, timestamptz
) to service_role;

create or replace function public.consume_telegram_practice_reply(
  input_user_id uuid,
  input_chat_id bigint,
  input_prompt_message_id bigint,
  input_text text,
  input_source_channel public.practice_source_channel,
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
  last_practised_at timestamptz,
  entry_id uuid,
  entry_kind public.practice_entry_kind,
  entry_text text,
  entry_source_channel public.practice_source_channel,
  entry_created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_prompt public.telegram_reply_prompts%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;
  if input_source_channel not in ('telegram_text', 'telegram_voice') then
    raise check_violation using message = 'invalid_transition';
  end if;

  select prompt.* into current_prompt
  from public.telegram_reply_prompts as prompt
  where prompt.user_id = input_user_id
    and prompt.chat_id = input_chat_id
    and prompt.prompt_message_id = input_prompt_message_id
  for update;

  if current_prompt.id is null
    or current_prompt.consumed_at is not null
    or current_prompt.expires_at <= input_now then
    raise raise_exception using message = 'reply_expired';
  end if;
  if current_prompt.intent = 'interval' then
    raise check_violation using message = 'invalid_transition';
  end if;

  update public.telegram_reply_prompts as prompt
  set consumed_at = input_now
  where prompt.id = current_prompt.id;

  return query select * from public.add_practice_entry_core(
    input_user_id,
    current_prompt.note_id,
    current_prompt.intent::text::public.practice_entry_kind,
    input_text,
    input_source_channel,
    input_now
  );
end;
$$;

revoke all on function public.consume_telegram_practice_reply(
  uuid, bigint, bigint, text, public.practice_source_channel, timestamptz
) from public, anon, authenticated;
grant execute on function public.consume_telegram_practice_reply(
  uuid, bigint, bigint, text, public.practice_source_channel, timestamptz
) to service_role;
