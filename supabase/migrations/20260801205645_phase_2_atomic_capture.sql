create or replace function public.capture_note_atomic(
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
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  captured_note public.notes%rowtype;
  user_timezone text;
  was_created boolean := false;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  select profile.timezone
  into user_timezone
  from public.profiles as profile
  where profile.user_id = caller_id;

  if user_timezone is null then
    raise foreign_key_violation using message = 'Authenticated profile is missing';
  end if;

  insert into public.notes (
    user_id,
    client_request_id,
    original_text,
    personal_context,
    note_type,
    summary,
    tags,
    recall_prompt,
    source_title,
    source_url,
    capture_channel,
    embedding
  ) values (
    caller_id,
    input_client_request_id,
    input_original_text,
    input_personal_context,
    input_note_type,
    input_summary,
    input_tags,
    input_recall_prompt,
    input_source_title,
    input_source_url,
    input_capture_channel,
    input_embedding
  )
  on conflict (user_id, client_request_id) do nothing
  returning * into captured_note;

  if captured_note.id is not null then
    was_created := true;
  else
    select note.*
    into strict captured_note
    from public.notes as note
    where
      note.user_id = caller_id
      and note.client_request_id = input_client_request_id;
  end if;

  insert into public.review_events (user_id, note_id, stage, due_on)
  select
    caller_id,
    captured_note.id,
    review_stage.stage,
    (captured_note.captured_at at time zone user_timezone)::date
      + review_stage.day_offset
  from (
    values
      (1::smallint, 1),
      (2::smallint, 2),
      (3::smallint, 3),
      (4::smallint, 7),
      (5::smallint, 21)
  ) as review_stage(stage, day_offset)
  on conflict on constraint review_events_note_stage_unique do nothing;

  return query
  select
    captured_note.id,
    captured_note.original_text,
    captured_note.note_type,
    captured_note.summary,
    captured_note.tags,
    min(review_event.due_on),
    was_created
  from public.review_events as review_event
  where
    review_event.user_id = caller_id
    and review_event.note_id = captured_note.id
  group by
    captured_note.id,
    captured_note.original_text,
    captured_note.note_type,
    captured_note.summary,
    captured_note.tags;
end;
$$;

revoke all on function public.capture_note_atomic(
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
) from public, anon;

grant execute on function public.capture_note_atomic(
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
) to authenticated;
