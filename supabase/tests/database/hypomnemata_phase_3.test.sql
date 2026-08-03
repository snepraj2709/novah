begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(63);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('50000000-0000-4000-8000-00000000000a', 'lifecycle-a@example.invalid', '{}'::jsonb),
  ('50000000-0000-4000-8000-00000000000b', 'lifecycle-b@example.invalid', '{}'::jsonb),
  ('50000000-0000-4000-8000-00000000000c', 'lifecycle-c@example.invalid', '{}'::jsonb)
on conflict (id) do nothing;

update public.profiles
set timezone = 'Pacific/Kiritimati', telegram_chat_id = 850000000001
where user_id = '50000000-0000-4000-8000-00000000000a';

update public.profiles
set timezone = 'UTC', telegram_chat_id = 850000000002
where user_id = '50000000-0000-4000-8000-00000000000b';

update public.profiles
set timezone = 'UTC', telegram_chat_id = 850000000003
where user_id = '50000000-0000-4000-8000-00000000000c';

insert into public.notes (
  id, user_id, client_request_id, original_text, personal_context, note_type,
  summary, tags, recall_prompt, source_title, source_url, capture_channel
)
values
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-000000000001', 'Interval note.', null, 'lesson', null, '{}', null, 'Source one', null, 'web'),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-000000000002', 'Remembered interval note.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('51000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-000000000003', 'Third active note.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('51000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-000000000004', 'Fourth active note.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('51000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-000000000005', 'Cascade note.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('51000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-000000000006', 'Constraint note.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('51000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-000000000007', 'Second constraint note.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('51000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-00000000000b', '52000000-0000-4000-8000-00000000000b', 'Other owner note.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('51000000-0000-4000-8000-00000000000c', '50000000-0000-4000-8000-00000000000c', '52000000-0000-4000-8000-00000000000c', 'Account cascade note.', null, 'lesson', null, '{}', null, null, null, 'web');

select extensions.is(
  (select count(*) from public.note_practices where user_id = '50000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'existing notes are not automatically converted into Practices'
);

select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'activate',
  '51000000-0000-4000-8000-000000000001', '2026-08-03T10:30:00Z'
);

create temporary table interval_changed on commit drop as
select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'setInterval',
  '51000000-0000-4000-8000-000000000001', '2026-08-03T10:30:00Z', 7::smallint, null
);

select extensions.is((select interval_days::integer from interval_changed), 7, 'an active Practice accepts a custom interval');
select extensions.is((select next_due_on from interval_changed), '2026-08-11'::date, 'interval changes schedule from the current user-local date');
select extensions.is(
  (select last_practice_interval_days::integer from public.profiles where user_id = '50000000-0000-4000-8000-00000000000a'),
  7,
  'the profile remembers the last selected interval'
);
select extensions.is(
  (select metadata from public.practice_events where note_id = '51000000-0000-4000-8000-000000000001' and event_kind = 'interval_change'),
  '{"newIntervalDays": 7, "previousIntervalDays": 1}'::jsonb,
  'the interval event stores scheduling metadata without note content'
);

select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'setInterval',
  '51000000-0000-4000-8000-000000000001', '2026-08-03T10:31:00Z', 7::smallint, null
);
select extensions.is(
  (select count(*) from public.practice_events where note_id = '51000000-0000-4000-8000-000000000001' and event_kind = 'interval_change'),
  1::bigint,
  'retrying the same interval does not append another event'
);
select extensions.throws_ok(
  $$ select * from public.manage_practice_core('50000000-0000-4000-8000-00000000000a', 'setInterval', '51000000-0000-4000-8000-000000000001', '2026-08-03T10:30:00Z', 0::smallint, null) $$,
  '23514', 'invalid_transition', 'interval zero is rejected'
);
select extensions.throws_ok(
  $$ select * from public.manage_practice_core('50000000-0000-4000-8000-00000000000a', 'setInterval', '51000000-0000-4000-8000-000000000001', '2026-08-03T10:30:00Z', 31::smallint, null) $$,
  '23514', 'invalid_transition', 'intervals above thirty are rejected'
);

create temporary table remembered_activation on commit drop as
select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'activate',
  '51000000-0000-4000-8000-000000000002', '2026-08-03T10:30:00Z'
);
select extensions.is((select interval_days::integer from remembered_activation), 7, 'later activations use the remembered interval');
select extensions.is((select next_due_on from remembered_activation), '2026-08-05'::date, 'a later activation is first due on the next local day');

create temporary table local_reread on commit drop as
select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'reread',
  '51000000-0000-4000-8000-000000000002', '2026-08-04T10:30:00Z'
);
select extensions.is((select next_due_on from local_reread), '2026-08-12'::date, 'completion advances by the interval from the current local date');

create temporary table dated_pause on commit drop as
select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'pause',
  '51000000-0000-4000-8000-000000000001', '2026-08-03T10:30:00Z', null, '2026-08-06'
);
select extensions.is((select status::text from dated_pause), 'paused', 'a dated pause changes lifecycle state');
select extensions.is((select paused_until from dated_pause), '2026-08-06'::date, 'a dated pause remembers its resume date');
select extensions.is((select next_due_on from dated_pause), null::date, 'a paused Practice is not due');

select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'activate',
  '51000000-0000-4000-8000-000000000003', '2026-08-03T10:30:00Z'
);
select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'activate',
  '51000000-0000-4000-8000-000000000004', '2026-08-03T10:30:00Z'
);

select set_config('request.jwt.claim.role', 'service_role', true);
create temporary table first_reconcile on commit drop as
select * from public.reconcile_due_pauses(
  '50000000-0000-4000-8000-00000000000a', '2026-08-06', '2026-08-05T10:30:00Z'
);
select extensions.is((select ready_count from first_reconcile), 1, 'an expired pause becomes ready when all slots are occupied');
select extensions.is(
  (select ready_to_resume from public.note_practices where note_id = '51000000-0000-4000-8000-000000000001'),
  true,
  'the full-slot pause remains paused and visibly ready'
);
select extensions.is(
  (select count(*) from public.note_practices where user_id = '50000000-0000-4000-8000-00000000000a' and status = 'active'),
  3::bigint,
  'ready-to-resume does not displace an active Practice'
);
select extensions.is(
  (select ready_count from public.reconcile_due_pauses('50000000-0000-4000-8000-00000000000a', '2026-08-06', '2026-08-05T10:31:00Z')),
  0,
  'reconciling an already-ready pause is idempotent'
);
select extensions.is(
  (select count(*) from public.practice_events where note_id = '51000000-0000-4000-8000-000000000001' and event_kind = 'ready_to_resume'),
  1::bigint,
  'ready-to-resume is recorded once'
);

select extensions.throws_ok(
  $$ select * from public.manage_practice_core('50000000-0000-4000-8000-00000000000a', 'resume', '51000000-0000-4000-8000-000000000001', '2026-08-05T10:32:00Z') $$,
  '54000', 'practice_slots_full', 'manual resume fails while all slots are occupied'
);
select extensions.results_eq(
  $$ select note_id from public.note_practices where user_id = '50000000-0000-4000-8000-00000000000a' and status = 'active' order by note_id $$,
  $$ values ('51000000-0000-4000-8000-000000000002'::uuid), ('51000000-0000-4000-8000-000000000003'::uuid), ('51000000-0000-4000-8000-000000000004'::uuid) $$,
  'a failed resume leaves every other active row unchanged'
);

select extensions.is(
  (select count(*) from public.claim_ready_practices('50000000-0000-4000-8000-00000000000a', '2026-08-05T10:33:00Z')),
  1::bigint,
  'a newly ready Practice is claimable for notification'
);
select extensions.is(
  (select count(*) from public.claim_ready_practices('50000000-0000-4000-8000-00000000000a', '2026-08-05T10:34:00Z')),
  0::bigint,
  'a live ready notification claim cannot be duplicated'
);
select extensions.is(
  (select count(*) from public.claim_ready_practices('50000000-0000-4000-8000-00000000000a', '2026-08-05T10:49:01Z')),
  1::bigint,
  'an expired ready notification claim can be retried'
);
select extensions.is(
  public.mark_ready_practice_sent(
    '50000000-0000-4000-8000-00000000000a',
    '51000000-0000-4000-8000-000000000001',
    '2026-08-06',
    '2026-08-05T10:33:00Z'
  ),
  false,
  'a stale worker cannot clear a newer ready-notification lease'
);
select extensions.is(
  public.mark_ready_practice_sent(
    '50000000-0000-4000-8000-00000000000a',
    '51000000-0000-4000-8000-000000000001',
    '2026-08-06',
    '2026-08-05T10:49:01Z'
  ),
  true,
  'a claimed ready notification can be marked sent'
);
select extensions.is(
  (select count(*) from public.claim_ready_practices('50000000-0000-4000-8000-00000000000a', '2026-08-06T10:50:00Z')),
  0::bigint,
  'a sent ready notification is never repeated for that ready state'
);

create temporary table indefinite_pause on commit drop as
select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'pause',
  '51000000-0000-4000-8000-000000000004', '2026-08-05T10:50:00Z'
);
select extensions.ok(
  (select status = 'paused' and paused_until is null from indefinite_pause),
  'an omitted date creates an indefinite pause and frees its slot'
);

create temporary table second_reconcile on commit drop as
select * from public.reconcile_due_pauses(
  '50000000-0000-4000-8000-00000000000a', '2026-08-06', '2026-08-05T10:51:00Z'
);
select extensions.is((select resumed_count from second_reconcile), 1, 'an expired dated pause auto-resumes once a slot is free');
select extensions.is(
  (select next_due_on from public.note_practices where note_id = '51000000-0000-4000-8000-000000000001'),
  '2026-08-07'::date,
  'an automatic resume is first due on the next local day'
);
select extensions.is(
  (select (metadata->>'automatic')::boolean from public.practice_events where note_id = '51000000-0000-4000-8000-000000000001' and event_kind = 'resume'),
  true,
  'the automatic resume event is distinguishable without content'
);

create temporary table integrated_three on commit drop as
select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'integrate',
  '51000000-0000-4000-8000-000000000003', '2026-08-05T10:52:00Z'
);
select extensions.is((select next_check_in_on from integrated_three), '2026-09-05'::date, 'integration schedules a check-in thirty local calendar days later');

select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'integrate',
  '51000000-0000-4000-8000-000000000001', '2026-08-05T10:52:00Z'
);
select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'integrate',
  '51000000-0000-4000-8000-000000000004', '2026-08-05T10:52:00Z'
);
select extensions.is(
  (select count(*) from public.note_practices where user_id = '50000000-0000-4000-8000-00000000000a' and status = 'active'),
  1::bigint,
  'integrated check-ins consume no active slots'
);

select extensions.is(
  (select count(*) from public.claim_due_check_ins('50000000-0000-4000-8000-00000000000a', '2026-09-05', '2026-09-04T10:30:00Z')),
  3::bigint,
  'all due integrated items are claimed as one user packet'
);
select extensions.is(
  (select count(*) from public.claim_due_check_ins('50000000-0000-4000-8000-00000000000a', '2026-09-05', '2026-09-04T10:31:00Z')),
  0::bigint,
  'duplicate grouped check-in claims are suppressed'
);
select extensions.is(
  (select count(*) from public.claim_due_check_ins('50000000-0000-4000-8000-00000000000a', '2026-09-05', '2026-09-04T10:46:01Z')),
  3::bigint,
  'expired grouped check-in claims can be retried'
);
select extensions.is(
  public.mark_check_ins_sent(
    '50000000-0000-4000-8000-00000000000a',
    array['51000000-0000-4000-8000-000000000001'::uuid, '51000000-0000-4000-8000-000000000006'::uuid],
    '2026-09-05',
    '2026-09-04T10:46:01Z'
  ),
  false,
  'a partial or unclaimed grouped packet is rejected atomically'
);
select extensions.is(
  (select count(*) from public.note_practices where user_id = '50000000-0000-4000-8000-00000000000a' and check_in_notification_sent_on is not null),
  0::bigint,
  'a rejected grouped packet marks no item sent'
);
create temporary table confirmed_before_mark on commit drop as
select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'confirmIntegrated',
  '51000000-0000-4000-8000-000000000003', '2026-09-04T10:47:00Z'
);
select extensions.is(
  (select next_check_in_on from confirmed_before_mark),
  '2026-10-05'::date,
  'a check-in callback may complete while the delivered group is being marked'
);
select extensions.is(
  public.mark_check_ins_sent(
    '50000000-0000-4000-8000-00000000000a',
    array[
      '51000000-0000-4000-8000-000000000001'::uuid,
      '51000000-0000-4000-8000-000000000003'::uuid,
      '51000000-0000-4000-8000-000000000004'::uuid
    ],
    '2026-09-05',
    '2026-09-04T10:46:01Z'
  ),
  true,
  'one successful grouped delivery marks remaining items after a callback race'
);
select extensions.is(
  (
    select count(*)
    from public.note_practices
    where user_id = '50000000-0000-4000-8000-00000000000a'
      and check_in_notification_sent_on = '2026-09-05'
  ),
  2::bigint,
  'callback-completed and ignored check-ins retain their distinct delivery state'
);
select extensions.is(
  (select count(*) from public.claim_due_check_ins('50000000-0000-4000-8000-00000000000a', '2026-09-06', '2026-09-05T10:30:00Z')),
  0::bigint,
  'an ignored due check-in remains waiting without repeat Telegram delivery'
);

create temporary table confirmed on commit drop as
select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'confirmIntegrated',
  '51000000-0000-4000-8000-000000000001', '2026-09-04T10:30:00Z'
);
select extensions.is((select next_check_in_on from confirmed), '2026-10-05'::date, 'Still integrated schedules thirty days from the current local date');
select extensions.throws_ok(
  $$ select * from public.manage_practice_core('50000000-0000-4000-8000-00000000000a', 'confirmIntegrated', '51000000-0000-4000-8000-000000000001', '2026-09-04T10:31:00Z') $$,
  'P0001', 'stale_action', 'a duplicate Still integrated callback is stale and does not advance twice'
);

create temporary table resumed_integrated on commit drop as
select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'resume',
  '51000000-0000-4000-8000-000000000003', '2026-09-04T10:30:00Z'
);
select extensions.is((select next_due_on from resumed_integrated), '2026-09-06'::date, 'resuming an integrated Practice is due on the next local day');
select extensions.throws_ok(
  $$ select * from public.manage_practice_core('50000000-0000-4000-8000-00000000000a', 'resume', '51000000-0000-4000-8000-000000000003', '2026-09-04T10:31:00Z') $$,
  'P0001', 'stale_action', 'a duplicate Resume practice callback is stale'
);

create temporary table stopped on commit drop as
select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'stopCheckIns',
  '51000000-0000-4000-8000-000000000004', '2026-09-04T10:30:00Z'
);
select extensions.ok(
  (select status = 'integrated' and check_ins_enabled = false and next_check_in_on is null from stopped),
  'Stop check-ins preserves Integrated state and clears the schedule'
);
select extensions.throws_ok(
  $$ select * from public.manage_practice_core('50000000-0000-4000-8000-00000000000a', 'stopCheckIns', '51000000-0000-4000-8000-000000000004', '2026-09-04T10:31:00Z') $$,
  'P0001', 'stale_action', 'a duplicate Stop check-ins callback is stale'
);

select extensions.is(
  public.create_telegram_reply_prompt(
    '50000000-0000-4000-8000-00000000000a', 850000000001, 9901,
    '51000000-0000-4000-8000-000000000003', 'interval', '2026-09-04T11:00:00Z'
  ),
  '2026-09-05T11:00:00Z'::timestamptz,
  'an interval ForceReply prompt expires after twenty-four hours'
);
select extensions.throws_ok(
  $$ select * from public.consume_telegram_interval_reply('50000000-0000-4000-8000-00000000000a', 850000000001, 9901, 31::smallint, '2026-09-04T11:01:00Z') $$,
  '23514', 'invalid_transition', 'invalid interval reply text does not mutate Practice state'
);
select extensions.is(
  (select consumed_at from public.telegram_reply_prompts where prompt_message_id = 9901),
  null::timestamptz,
  'an invalid interval keeps its prompt usable'
);
create temporary table consumed_interval on commit drop as
select * from public.consume_telegram_interval_reply(
  '50000000-0000-4000-8000-00000000000a', 850000000001, 9901, 5::smallint,
  '2026-09-04T11:02:00Z'
);
select extensions.is((select interval_days::integer from consumed_interval), 5, 'a valid interval reply updates the active Practice');
select extensions.is(
  (select consumed_at from public.telegram_reply_prompts where prompt_message_id = 9901),
  '2026-09-04T11:02:00Z'::timestamptz,
  'a successful interval reply consumes its prompt exactly once'
);
select extensions.throws_ok(
  $$ select * from public.consume_telegram_interval_reply('50000000-0000-4000-8000-00000000000a', 850000000001, 9901, 5::smallint, '2026-09-04T11:03:00Z') $$,
  'P0001', 'reply_expired', 'a consumed interval reply cannot be replayed'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-00000000000a', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.lives_ok(
  $$ select * from public.manage_practice('pause', '51000000-0000-4000-8000-000000000002', null, null) $$,
  'an owner can use the browser lifecycle RPC'
);
select extensions.throws_ok(
  $$ select * from public.manage_practice('activate', '51000000-0000-4000-8000-00000000000b', null, null) $$,
  'P0002', 'practice_not_found', 'the browser lifecycle RPC cannot mutate another owner note'
);
select extensions.throws_ok(
  $$ select * from public.manage_practice_for_user('50000000-0000-4000-8000-00000000000a', 'pause', '51000000-0000-4000-8000-000000000002', null, null) $$,
  '42501', 'permission denied for function manage_practice_for_user', 'authenticated clients cannot invoke the Telegram lifecycle wrapper'
);
reset role;

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select extensions.throws_ok(
  $$ update public.note_practices set interval_days = 2 where note_id = '51000000-0000-4000-8000-000000000001' $$,
  '42501', 'permission denied for table note_practices', 'service clients cannot update Practice state directly'
);
select extensions.throws_ok(
  $$ update public.practice_events set metadata = '{}'::jsonb where note_id = '51000000-0000-4000-8000-000000000001' $$,
  '42501', 'permission denied for table practice_events', 'Practice events are append-only to application roles'
);
reset role;

select extensions.throws_ok(
  $$ insert into public.note_practices (note_id, user_id, status, interval_days) values ('51000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-00000000000a', 'active', 1) $$,
  '23514',
  'new row for relation "note_practices" violates check constraint "note_practices_state_valid"',
  'state constraints reject an active Practice without a due date'
);
select extensions.throws_ok(
  $$ insert into public.note_practices (note_id, user_id, status, interval_days, integrated_at, check_ins_enabled, next_check_in_on) values ('51000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-00000000000a', 'integrated', 1, now(), false, '2026-09-05') $$,
  '23514',
  'new row for relation "note_practices" violates check constraint "note_practices_state_valid"',
  'state constraints reject a disabled check-in with a schedule'
);

select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000a', 'activate',
  '51000000-0000-4000-8000-000000000005', '2026-09-04T12:00:00Z'
);
select public.create_telegram_reply_prompt(
  '50000000-0000-4000-8000-00000000000a', 850000000001, 9902,
  '51000000-0000-4000-8000-000000000005', 'interval', '2026-09-04T12:01:00Z'
);
delete from public.notes where id = '51000000-0000-4000-8000-000000000005';
select extensions.is(
  (select count(*) from public.note_practices where note_id = '51000000-0000-4000-8000-000000000005')
  + (select count(*) from public.practice_events where note_id = '51000000-0000-4000-8000-000000000005')
  + (select count(*) from public.telegram_reply_prompts where note_id = '51000000-0000-4000-8000-000000000005'),
  0::bigint,
  'parent-note deletion cascades all Idea 3 lifecycle state'
);

select * from public.manage_practice_core(
  '50000000-0000-4000-8000-00000000000c', 'activate',
  '51000000-0000-4000-8000-00000000000c', '2026-09-04T12:00:00Z'
);
delete from auth.users where id = '50000000-0000-4000-8000-00000000000c';
select extensions.is(
  (select count(*) from public.note_practices where user_id = '50000000-0000-4000-8000-00000000000c')
  + (select count(*) from public.practice_events where user_id = '50000000-0000-4000-8000-00000000000c'),
  0::bigint,
  'account deletion cascades all owned lifecycle state'
);

select * from extensions.finish();
rollback;
