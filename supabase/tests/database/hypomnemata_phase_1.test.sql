begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(26);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('30000000-0000-4000-8000-00000000000a', 'practice-a@example.invalid', '{}'::jsonb),
  ('30000000-0000-4000-8000-00000000000b', 'practice-b@example.invalid', '{}'::jsonb)
on conflict (id) do nothing;

update public.profiles
set timezone = 'Pacific/Kiritimati'
where user_id = '30000000-0000-4000-8000-00000000000a';

insert into public.notes (
  id, user_id, client_request_id, original_text, personal_context, note_type,
  summary, tags, recall_prompt, source_title, source_url, capture_channel
)
values
  ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-000000000001', 'Practice note one.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-000000000002', 'Practice note two.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('31000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-000000000003', 'Practice note three.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('31000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-000000000004', 'Practice note four.', null, 'lesson', null, '{}', null, null, null, 'web'),
  ('31000000-0000-4000-8000-00000000000b', '30000000-0000-4000-8000-00000000000b', '32000000-0000-4000-8000-00000000000b', 'Other owner note.', null, 'lesson', null, '{}', null, null, null, 'web');

select extensions.is(
  (
    select count(*) from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('note_practices', 'practice_entries', 'practice_events', 'telegram_reply_prompts')
      and relation.relrowsecurity
  ),
  4::bigint,
  'RLS is enabled on every final Practice table'
);

select extensions.is(
  (select count(*) from public.note_practices),
  0::bigint,
  'existing notes remain saved-only after migration'
);

create temporary table activated on commit drop as
select * from public.manage_practice_core(
  '30000000-0000-4000-8000-00000000000a',
  'activate',
  '31000000-0000-4000-8000-000000000001',
  '2026-08-03T10:30:00Z'
);

select extensions.is((select status::text from activated), 'active', 'activation creates active Practice');
select extensions.is((select next_due_on from activated), '2026-08-05'::date, 'first due is the next user-local calendar day');
select extensions.is((select interval_days::integer from activated), 1, 'first activation uses the one-day default');
select extensions.is((select count(*) from public.practice_events where event_kind = 'activation'), 1::bigint, 'activation records one content-free event');

select * from public.manage_practice_core(
  '30000000-0000-4000-8000-00000000000a', 'activate',
  '31000000-0000-4000-8000-000000000001', '2026-08-03T10:31:00Z'
);
select extensions.is((select count(*) from public.practice_events where event_kind = 'activation'), 1::bigint, 'duplicate activation is idempotent');

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-00000000000a', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.throws_ok(
  $$ select * from public.manage_practice('activate', '31000000-0000-4000-8000-00000000000b') $$,
  'P0002',
  'practice_not_found',
  'an owner cannot activate another user note'
);
reset role;

select extensions.lives_ok(
  $$ select * from public.manage_practice_core('30000000-0000-4000-8000-00000000000a', 'activate', '31000000-0000-4000-8000-000000000002', '2026-08-03T10:30:00Z') $$,
  'a second active slot can be filled'
);
select extensions.lives_ok(
  $$ select * from public.manage_practice_core('30000000-0000-4000-8000-00000000000a', 'activate', '31000000-0000-4000-8000-000000000003', '2026-08-03T10:30:00Z') $$,
  'a third active slot can be filled'
);
select extensions.throws_ok(
  $$ select * from public.manage_practice_core('30000000-0000-4000-8000-00000000000a', 'activate', '31000000-0000-4000-8000-000000000004', '2026-08-03T10:30:00Z') $$,
  '54000',
  'practice_slots_full',
  'a fourth active Practice is rejected'
);
select extensions.is((select count(*) from public.note_practices where status = 'active'), 3::bigint, 'slot enforcement leaves exactly three active rows');

select extensions.is((select next_due_on from public.note_practices where note_id = '31000000-0000-4000-8000-000000000001'), '2026-08-05'::date, 'ignored Practice remains due without advancing');

create temporary table reread_result on commit drop as
select * from public.manage_practice_core(
  '30000000-0000-4000-8000-00000000000a', 'reread',
  '31000000-0000-4000-8000-000000000001', '2026-08-04T10:30:00Z'
);
select extensions.is((select next_due_on from reread_result), '2026-08-06'::date, 'Reread advances from the current local date');
select extensions.is((select last_practised_at from reread_result), '2026-08-04T10:30:00Z'::timestamptz, 'Reread records its completion time');

create temporary table duplicate_reread on commit drop as
select * from public.manage_practice_core(
  '30000000-0000-4000-8000-00000000000a', 'reread',
  '31000000-0000-4000-8000-000000000001', '2026-08-04T10:31:00Z'
);
select extensions.is((select next_due_on from duplicate_reread), '2026-08-06'::date, 'duplicate Reread does not advance twice');
select extensions.is((select count(*) from public.practice_events where event_kind = 'reread'), 1::bigint, 'duplicate Reread creates one event');

select extensions.is(
  (select count(*) from public.claim_due_practices('30000000-0000-4000-8000-00000000000a', '2026-08-05', '2026-08-05T00:00:00Z')),
  2::bigint,
  'due active Practices are claimed separately from a still-upcoming Practice'
);
select extensions.is(
  (select count(*) from public.claim_due_practices('30000000-0000-4000-8000-00000000000a', '2026-08-05', '2026-08-05T00:01:00Z')),
  0::bigint,
  'duplicate worker execution cannot reclaim the same local-day messages'
);
select extensions.is(
  public.mark_practice_notification_sent(
    '30000000-0000-4000-8000-00000000000a',
    '31000000-0000-4000-8000-000000000002',
    '2026-08-05',
    '2026-08-05T00:00:00Z'
  ),
  true,
  'a claimed Practice can be marked sent for the user-local day'
);
select extensions.is(
  (
    select count(*)
    from public.claim_due_practices(
      '30000000-0000-4000-8000-00000000000a',
      '2026-08-05',
      '2026-08-05T00:15:01Z'
    )
  ),
  1::bigint,
  'an expired active notification claim can be retried'
);
select extensions.is(
  public.mark_practice_notification_sent(
    '30000000-0000-4000-8000-00000000000a',
    '31000000-0000-4000-8000-000000000003',
    '2026-08-05',
    '2026-08-05T00:00:00Z'
  ),
  false,
  'a stale worker cannot clear a newer active notification lease'
);
select extensions.is(
  public.mark_practice_notification_sent(
    '30000000-0000-4000-8000-00000000000a',
    '31000000-0000-4000-8000-000000000003',
    '2026-08-05',
    '2026-08-05T00:15:01Z'
  ),
  true,
  'the current active notification lease can be marked sent'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-00000000000a', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.throws_ok(
  $$ insert into public.note_practices (note_id, user_id, status, next_due_on) values ('31000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-00000000000a', 'active', '2026-08-05') $$,
  '42501',
  'permission denied for table note_practices',
  'browser clients cannot directly insert Practice state'
);
select extensions.is((select count(*) from public.note_practices), 3::bigint, 'an owner can select all three owned Practice rows');
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-00000000000b', true);
select extensions.is((select count(*) from public.note_practices), 0::bigint, 'RLS hides another owner Practice rows');
reset role;

select * from extensions.finish();
rollback;
