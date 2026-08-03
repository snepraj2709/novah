begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(33);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('40000000-0000-4000-8000-00000000000a', 'thread-a@example.invalid', '{}'::jsonb),
  ('40000000-0000-4000-8000-00000000000b', 'thread-b@example.invalid', '{}'::jsonb),
  ('40000000-0000-4000-8000-00000000000c', 'thread-c@example.invalid', '{}'::jsonb)
on conflict (id) do nothing;

update public.profiles
set timezone = 'UTC', telegram_chat_id = 800000000001
where user_id = '40000000-0000-4000-8000-00000000000a';

update public.profiles
set timezone = 'UTC', telegram_chat_id = 800000000002
where user_id = '40000000-0000-4000-8000-00000000000b';

update public.profiles
set timezone = 'UTC', telegram_chat_id = 800000000003
where user_id = '40000000-0000-4000-8000-00000000000c';

insert into public.notes (
  id, user_id, client_request_id, original_text, personal_context, note_type,
  summary, tags, recall_prompt, source_title, source_url, capture_channel
)
values
  ('41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000a', '42000000-0000-4000-8000-000000000001', 'Due thread note.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('41000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-00000000000a', '42000000-0000-4000-8000-000000000002', 'Upcoming thread note.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('41000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-00000000000a', '42000000-0000-4000-8000-000000000003', 'Cascade note.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('41000000-0000-4000-8000-00000000000b', '40000000-0000-4000-8000-00000000000b', '42000000-0000-4000-8000-00000000000b', 'Other owner thread note.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('41000000-0000-4000-8000-00000000000c', '40000000-0000-4000-8000-00000000000c', '42000000-0000-4000-8000-00000000000c', 'Account cascade note.', null, 'lesson', null, '{}', null, null, null, 'web');

select * from public.manage_practice_core(
  '40000000-0000-4000-8000-00000000000a', 'activate',
  '41000000-0000-4000-8000-000000000001', '2026-08-01T09:00:00Z'
);
select * from public.manage_practice_core(
  '40000000-0000-4000-8000-00000000000a', 'activate',
  '41000000-0000-4000-8000-000000000002', '2026-08-03T09:00:00Z'
);
select * from public.manage_practice_core(
  '40000000-0000-4000-8000-00000000000a', 'activate',
  '41000000-0000-4000-8000-000000000003', '2026-08-03T09:00:00Z'
);
select * from public.manage_practice_core(
  '40000000-0000-4000-8000-00000000000b', 'activate',
  '41000000-0000-4000-8000-00000000000b', '2026-08-03T09:00:00Z'
);
select * from public.manage_practice_core(
  '40000000-0000-4000-8000-00000000000c', 'activate',
  '41000000-0000-4000-8000-00000000000c', '2026-08-03T09:00:00Z'
);

create temporary table due_reflection on commit drop as
select * from public.add_practice_entry_core(
  '40000000-0000-4000-8000-00000000000a',
  '41000000-0000-4000-8000-000000000001',
  'reflection', E'  What I\n\tlearned.  ', 'web', '2026-08-02T10:00:00Z'
);

select extensions.is(
  (select entry_text from due_reflection),
  'What I learned.',
  'entry text uses the captured-text whitespace normalization rules'
);
select extensions.is(
  (select next_due_on from due_reflection),
  '2026-08-03'::date,
  'a due Reflection advances from the current local date'
);
select extensions.is(
  (select last_practised_at from due_reflection),
  '2026-08-02T10:00:00Z'::timestamptz,
  'a due Reflection completes the encounter'
);

create temporary table same_day_story on commit drop as
select * from public.add_practice_entry_core(
  '40000000-0000-4000-8000-00000000000a',
  '41000000-0000-4000-8000-000000000001',
  'story', 'A later story.', 'web', '2026-08-02T11:00:00Z'
);

select extensions.is(
  (select next_due_on from same_day_story),
  '2026-08-03'::date,
  'a second non-due entry does not advance the schedule twice'
);
select extensions.is(
  (select count(*) from public.practice_entries where note_id = '41000000-0000-4000-8000-000000000001'),
  2::bigint,
  'Reflection and Story entries append to one thread'
);
select extensions.results_eq(
  $$ select kind::text from public.practice_entries where note_id = '41000000-0000-4000-8000-000000000001' order by created_at, id $$,
  $$ values ('reflection'::text), ('story'::text) $$,
  'the thread is ordered chronologically by created_at then ID'
);

create temporary table upcoming_story on commit drop as
select * from public.add_practice_entry_core(
  '40000000-0000-4000-8000-00000000000a',
  '41000000-0000-4000-8000-000000000002',
  'story', 'Before it was due.', 'web', '2026-08-03T10:00:00Z'
);
select extensions.is(
  (select next_due_on from upcoming_story),
  '2026-08-04'::date,
  'an entry added before the due date preserves the schedule'
);

create temporary table due_story on commit drop as
select * from public.add_practice_entry_core(
  '40000000-0000-4000-8000-00000000000a',
  '41000000-0000-4000-8000-000000000002',
  'story', 'Now it is due.', 'web', '2026-08-04T10:00:00Z'
);
select extensions.is(
  (select next_due_on from due_story),
  '2026-08-05'::date,
  'a due Story also completes and advances its encounter'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-00000000000a', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.is(
  (select count(*) from public.practice_entries),
  4::bigint,
  'an owner can read their complete entry thread'
);
select extensions.lives_ok(
  $$ select * from public.add_practice_entry('41000000-0000-4000-8000-000000000002', 'reflection', 'Browser reflection.', '43000000-0000-4000-8000-000000000001') $$,
  'an owner can append through the browser RPC'
);
select extensions.is(
  (
    select entry_id
    from public.add_practice_entry(
      '41000000-0000-4000-8000-000000000002',
      'reflection',
      'Browser reflection.',
      '43000000-0000-4000-8000-000000000001'
    )
  ),
  '43000000-0000-4000-8000-000000000001'::uuid,
  'retrying a web entry with the same key returns the original entry'
);
select extensions.is(
  (
    select count(*)
    from public.practice_entries
    where id = '43000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'retrying a web entry does not append duplicate content'
);
select extensions.throws_ok(
  $$ select * from public.add_practice_entry('41000000-0000-4000-8000-000000000002', 'reflection', 'Different content.', '43000000-0000-4000-8000-000000000001') $$,
  '23514',
  'invalid_transition',
  'reusing an entry key for different content is rejected'
);
select extensions.throws_ok(
  $$ select * from public.add_practice_entry('41000000-0000-4000-8000-00000000000b', 'reflection', 'Cross-user entry.', '43000000-0000-4000-8000-000000000002') $$,
  'P0002',
  'practice_not_found',
  'an owner cannot append to another user note'
);
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-00000000000b', true);
select extensions.is(
  (select count(*) from public.practice_entries),
  0::bigint,
  'RLS hides another owner entry thread'
);
select extensions.throws_ok(
  $$ insert into public.practice_entries (user_id, note_id, kind, text, source_channel) values ('40000000-0000-4000-8000-00000000000b', '41000000-0000-4000-8000-00000000000b', 'reflection', 'Direct insert.', 'web') $$,
  '42501',
  'permission denied for table practice_entries',
  'browser clients cannot insert entries directly'
);
select extensions.throws_ok(
  $$ update public.practice_entries set text = 'Edited.' $$,
  '42501',
  'permission denied for table practice_entries',
  'entry updates are rejected'
);
select extensions.throws_ok(
  $$ delete from public.practice_entries $$,
  '42501',
  'permission denied for table practice_entries',
  'individual entry deletion is rejected'
);
reset role;

select extensions.throws_ok(
  $$ select 'unsupported'::public.practice_entry_kind $$,
  '22P02',
  'invalid input value for enum practice_entry_kind: "unsupported"',
  'unsupported entry kinds are rejected by Postgres'
);
select extensions.throws_ok(
  $$ select * from public.add_practice_entry_core('40000000-0000-4000-8000-00000000000a', '41000000-0000-4000-8000-000000000002', 'reflection', '   ', 'web', '2026-08-03T11:00:00Z') $$,
  '23514',
  'invalid_transition',
  'blank normalized entries are rejected'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select extensions.is(
  public.create_telegram_reply_prompt(
    '40000000-0000-4000-8000-00000000000a', 800000000001, 9001,
    '41000000-0000-4000-8000-000000000002', 'reflection',
    '2026-08-03T12:00:00Z'
  ),
  '2026-08-04T12:00:00Z'::timestamptz,
  'a Telegram reply prompt expires exactly 24 hours after creation'
);
select extensions.is(
  public.inspect_telegram_reply_prompt(
    '40000000-0000-4000-8000-00000000000a', 800000000001, 9001,
    '2026-08-04T11:59:59Z'
  )::text,
  'reflection',
  'an unexpired prompt can be inspected before voice transcription'
);

create temporary table consumed_reply on commit drop as
select * from public.consume_telegram_practice_reply(
  '40000000-0000-4000-8000-00000000000a', 800000000001, 9001,
  'Telegram reflection.', 'telegram_text', '2026-08-03T13:00:00Z'
);
select extensions.is(
  (select entry_kind::text from consumed_reply),
  'reflection',
  'a valid text reply is routed to its stored Reflection intent'
);
select extensions.is(
  (select consumed_at from public.telegram_reply_prompts where prompt_message_id = 9001),
  '2026-08-03T13:00:00Z'::timestamptz,
  'successful reply consumption marks the prompt used'
);
select extensions.throws_ok(
  $$ select * from public.consume_telegram_practice_reply('40000000-0000-4000-8000-00000000000a', 800000000001, 9001, 'Duplicate.', 'telegram_text', '2026-08-03T13:01:00Z') $$,
  'P0001',
  'reply_expired',
  'a consumed prompt is single-use'
);

select public.create_telegram_reply_prompt(
  '40000000-0000-4000-8000-00000000000a', 800000000001, 9002,
  '41000000-0000-4000-8000-000000000002', 'story',
  '2026-08-03T12:00:00Z'
);
select extensions.throws_ok(
  $$ select * from public.consume_telegram_practice_reply('40000000-0000-4000-8000-00000000000a', 800000000001, 9002, 'Too late.', 'telegram_voice', '2026-08-04T12:00:00Z') $$,
  'P0001',
  'reply_expired',
  'a prompt is expired at the 24-hour boundary'
);
select extensions.is(
  (select count(*) from public.practice_entries where text = 'Too late.'),
  0::bigint,
  'an expired reply never creates an entry'
);

select public.create_telegram_reply_prompt(
  '40000000-0000-4000-8000-00000000000a', 800000000001, 9003,
  '41000000-0000-4000-8000-000000000003', 'story',
  '2026-08-03T12:00:00Z'
);
select * from public.add_practice_entry_core(
  '40000000-0000-4000-8000-00000000000a',
  '41000000-0000-4000-8000-000000000003',
  'story', 'Delete with note.', 'web', '2026-08-03T13:00:00Z'
);
delete from public.notes where id = '41000000-0000-4000-8000-000000000003';
select extensions.is(
  (select count(*) from public.practice_entries where note_id = '41000000-0000-4000-8000-000000000003'),
  0::bigint,
  'deleting a parent note cascades its entries'
);
select extensions.is(
  (select count(*) from public.telegram_reply_prompts where prompt_message_id = 9003),
  0::bigint,
  'deleting a parent note cascades its reply prompts'
);

select public.create_telegram_reply_prompt(
  '40000000-0000-4000-8000-00000000000c', 800000000003, 9004,
  '41000000-0000-4000-8000-00000000000c', 'reflection',
  '2026-08-03T12:00:00Z'
);
select * from public.add_practice_entry_core(
  '40000000-0000-4000-8000-00000000000c',
  '41000000-0000-4000-8000-00000000000c',
  'reflection', 'Delete with account.', 'web', '2026-08-03T13:00:00Z'
);
delete from auth.users where id = '40000000-0000-4000-8000-00000000000c';
select extensions.is(
  (select count(*) from public.practice_entries where user_id = '40000000-0000-4000-8000-00000000000c'),
  0::bigint,
  'deleting an account cascades its entries'
);
select extensions.is(
  (select count(*) from public.telegram_reply_prompts where user_id = '40000000-0000-4000-8000-00000000000c'),
  0::bigint,
  'deleting an account cascades its reply prompts'
);

set local role service_role;
select extensions.throws_ok(
  $$ insert into public.practice_entries (user_id, note_id, kind, text, source_channel) values ('40000000-0000-4000-8000-00000000000a', '41000000-0000-4000-8000-000000000001', 'reflection', 'Service insert.', 'telegram_text') $$,
  '42501',
  'permission denied for table practice_entries',
  'service callers must append through the schedule-aware RPC'
);
select extensions.throws_ok(
  $$ update public.practice_entries set text = 'Service edit.' $$,
  '42501',
  'permission denied for table practice_entries',
  'service callers cannot bypass append-only entry updates'
);
reset role;

select * from extensions.finish();
rollback;
