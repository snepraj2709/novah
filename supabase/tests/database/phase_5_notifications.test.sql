begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(30);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000a',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select extensions.throws_ok(
  $$
    select * from public.notification_digest_notes(
      '00000000-0000-4000-8000-00000000000a',
      '2026-08-02'
    )
  $$,
  '42501',
  null,
  'authenticated callers cannot use the notification evidence function'
);

select extensions.throws_ok(
  $$
    select * from public.claim_due_reviews(
      '00000000-0000-4000-8000-00000000000a',
      '2026-08-03'
    )
  $$,
  '42501',
  null,
  'authenticated callers cannot claim review delivery'
);

select extensions.throws_ok(
  $$ select public.configure_notification_cron(pg_catalog.repeat('a', 32)) $$,
  '42501',
  null,
  'authenticated callers cannot configure the notification Cron job'
);

select extensions.throws_ok(
  $$ select * from public.notification_cron_last_run() $$,
  '42501',
  null,
  'authenticated callers cannot inspect notification Cron runs'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);

update public.profiles
set timezone = 'Asia/Kolkata', telegram_chat_id = 700000000011
where user_id = '00000000-0000-4000-8000-00000000000a';

insert into public.notes (
  id,
  user_id,
  client_request_id,
  original_text,
  note_type,
  summary,
  tags,
  recall_prompt,
  source_title,
  capture_channel,
  captured_at
) values
  (
    '51000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-00000000000a',
    '52000000-0000-4000-8000-000000000001',
    'Phase five local-date note one.',
    'lesson',
    'Local-date summary one.',
    array['phase-five', 'testing'],
    'What belongs to the local date?',
    'Source one',
    'web',
    '2026-08-02 18:45:00+00'
  ),
  (
    '51000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-00000000000a',
    '52000000-0000-4000-8000-000000000002',
    'Phase five adjacent-date note.',
    'lesson',
    'Adjacent-date summary.',
    array['phase-five', 'testing'],
    'Which date contains this note?',
    'Source two',
    'web',
    '2026-08-02 18:20:00+00'
  );

select extensions.results_eq(
  $$
    select note_id
    from public.notification_digest_notes(
      '00000000-0000-4000-8000-00000000000a',
      '2026-08-03'
    )
  $$,
  $$ values ('51000000-0000-4000-8000-000000000001'::uuid) $$,
  'digest evidence contains only notes from the requested local calendar date'
);

create temporary table first_digest_claim on commit drop as
select public.claim_daily_digest(
  '00000000-0000-4000-8000-00000000000a',
  '2026-08-03',
  array['51000000-0000-4000-8000-000000000001'::uuid],
  '{"captureCount":1,"sourceCount":1,"themes":[],"connection":null,"reflectionQuestion":"What belongs to the local date?"}'::jsonb
) as digest_id;

select extensions.isnt(
  (select digest_id from first_digest_claim),
  null::uuid,
  'the exact evidence set is persisted before delivery'
);

select extensions.results_eq(
  $$
    select note_ids
    from public.daily_digests
    where id = (select digest_id from first_digest_claim)
  $$,
  $$ values (array['51000000-0000-4000-8000-000000000001'::uuid]) $$,
  'the stored digest retains its exact note evidence'
);

select extensions.is(
  public.claim_daily_digest(
    '00000000-0000-4000-8000-00000000000a',
    '2026-08-03',
    array['51000000-0000-4000-8000-000000000001'::uuid],
    '{"captureCount":1,"sourceCount":1,"themes":[],"connection":null,"reflectionQuestion":"Duplicate"}'::jsonb
  ),
  null::uuid,
  'a repeated digest claim cannot create a duplicate delivery'
);

select extensions.throws_ok(
  $$
    select public.claim_daily_digest(
      '00000000-0000-4000-8000-00000000000a',
      '2026-08-02',
      array['51000000-0000-4000-8000-000000000001'::uuid],
      '{"captureCount":1}'::jsonb
    )
  $$,
  '23514',
  null,
  'a digest cannot be persisted with evidence from another local date'
);

select extensions.is(
  public.mark_daily_digest_sent((select digest_id from first_digest_claim)),
  true,
  'the first successful digest delivery is marked sent'
);

select extensions.is(
  public.mark_daily_digest_sent((select digest_id from first_digest_claim)),
  false,
  'a digest cannot be marked sent twice'
);

insert into public.review_events (
  id,
  user_id,
  note_id,
  stage,
  due_on
) values
  (
    '53000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-00000000000a',
    '51000000-0000-4000-8000-000000000001',
    1,
    '2026-08-03'
  ),
  (
    '53000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-00000000000a',
    '51000000-0000-4000-8000-000000000001',
    2,
    '2026-08-04'
  );

create temporary table claimed_reviews on commit drop as
select * from public.claim_due_reviews(
  '00000000-0000-4000-8000-00000000000a',
  '2026-08-03',
  '2026-08-03 03:30:00+00'
);

select extensions.results_eq(
  $$ select event_id from claimed_reviews $$,
  $$ values ('53000000-0000-4000-8000-000000000001'::uuid) $$,
  'only reviews due on or before the local review date are claimed'
);

select extensions.is(
  (
    select count(*)
    from public.claim_due_reviews(
      '00000000-0000-4000-8000-00000000000a',
      '2026-08-03'
    )
  ),
  0::bigint,
  'a repeated review processor cannot reclaim the same event'
);

select extensions.is(
  public.mark_review_packet_sent(
    array['53000000-0000-4000-8000-000000000001'::uuid]
  ),
  1,
  'one grouped packet marks its one claimed event sent'
);

select extensions.is(
  (
    select status::text
    from public.review_events
    where id = '53000000-0000-4000-8000-000000000001'
  ),
  'sent',
  'the claimed review transitions to sent after delivery'
);

select extensions.results_eq(
  $$
    select original_text
    from public.reveal_review_for_user(
      '00000000-0000-4000-8000-00000000000a',
      '53000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values ('Phase five local-date note one.'::text) $$,
  'reveal returns the original text for the owning user and event'
);

select extensions.is(
  (
    select count(*)
    from public.reveal_review_for_user(
      '00000000-0000-4000-8000-00000000000b',
      '53000000-0000-4000-8000-000000000001'
    )
  ),
  0::bigint,
  'another user cannot reveal the event'
);

select extensions.is(
  public.record_review_feedback_for_user(
    '00000000-0000-4000-8000-00000000000a',
    '53000000-0000-4000-8000-000000000001',
    'partial'
  ),
  true,
  'recall feedback updates the exact owning event'
);

select extensions.results_eq(
  $$
    select status::text, answered_at is not null
    from public.review_events
    where id = '53000000-0000-4000-8000-000000000001'
  $$,
  $$ values ('partial'::text, true) $$,
  'recall quality and answer time are stored together'
);

select extensions.is(
  public.record_review_feedback_for_user(
    '00000000-0000-4000-8000-00000000000a',
    '53000000-0000-4000-8000-000000000001',
    'missed'
  ),
  false,
  'an answered review cannot be overwritten by a repeated callback'
);

create temporary table configured_cron on commit drop as
select public.configure_notification_cron(
  pg_catalog.repeat('a', 32)
) as job_id;

select extensions.isnt(
  (select job_id from configured_cron),
  null::bigint,
  'the service role can configure the notification Cron job'
);

select extensions.results_eq(
  $$ select schedule, active from public.notification_cron_status() $$,
  $$ values ('*/10 * * * *'::text, true) $$,
  'the configured job is the one active ten-minute schedule'
);

select extensions.is(
  (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'novah_cron_secret'
  ),
  pg_catalog.repeat('a', 32),
  'the Cron Bearer value is stored in Vault rather than the job command'
);

select extensions.is(
  (
    select secret_exposed
    from public.notification_cron_status()
  ),
  false,
  'the scheduled command does not contain the Cron secret value'
);

select extensions.is(
  (
    select pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(
        'public.configure_notification_cron(text)'::regprocedure
      ),
      'timeout_milliseconds := 120000'
    ) > 0
  ),
  true,
  'the Cron request timeout exceeds the notification provider timeouts'
);

select extensions.is(
  (select count(*) from public.notification_cron_last_run()),
  0::bigint,
  'a newly configured job has no fabricated run history'
);

select public.configure_notification_cron(pg_catalog.repeat('b', 32));

select extensions.is(
  (
    select count(*)
    from public.notification_cron_status()
  ),
  1::bigint,
  'reconfiguration replaces the existing job instead of duplicating it'
);

select extensions.is(
  (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'novah_cron_secret'
  ),
  pg_catalog.repeat('b', 32),
  'reconfiguration rotates the Vault secret used by the job'
);

select extensions.is(
  public.remove_notification_cron(),
  true,
  'the service role can remove the notification schedule during rollback'
);

select extensions.is(
  (select count(*) from public.notification_cron_status()),
  0::bigint,
  'rollback leaves no notification Cron job'
);

select * from extensions.finish();
rollback;
