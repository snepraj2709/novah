begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000a',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temporary table first_capture_result on commit drop as
select *
from public.capture_note_atomic(
  E'  Phase 2\nkeeps\tthe original wording.  ',
  'Synthetic personal context.',
  'quote',
  'Synthetic atomic capture summary.',
  array['atomic-capture', 'testing'],
  'What does atomic capture preserve?',
  'Synthetic source',
  'https://example.invalid/phase-2',
  'web',
  '60000000-0000-4000-8000-00000000000a',
  pg_catalog.array_prepend(
    1::real,
    pg_catalog.array_fill(0::real, array[1535])
  )::extensions.vector
);

select extensions.is(
  (select stored_original_text from first_capture_result),
  'Phase 2 keeps the original wording.',
  'atomic capture preserves text after whitespace normalization'
);

select extensions.is(
  (select created from first_capture_result),
  true,
  'the first atomic capture reports a newly created note'
);

select extensions.is(
  (
    select count(*)
    from public.review_events
    where note_id = (select note_id from first_capture_result)
  ),
  5::bigint,
  'atomic capture creates exactly five review events'
);

select extensions.results_eq(
  $$
    select
      review_event.stage::integer,
      review_event.due_on - (
        note.captured_at at time zone profile.timezone
      )::date as day_offset
    from public.review_events as review_event
    join public.notes as note on note.id = review_event.note_id
    join public.profiles as profile on profile.user_id = note.user_id
    where note.id = (select note_id from first_capture_result)
    order by review_event.stage
  $$,
  $$ values (1, 1), (2, 2), (3, 3), (4, 7), (5, 21) $$,
  'review events use the locked local-calendar offsets'
);

create temporary table duplicate_capture_result on commit drop as
select *
from public.capture_note_atomic(
  'This retry payload must not replace the first note.',
  null,
  'lesson',
  'Retry metadata must not replace stored metadata.',
  array['retry', 'testing'],
  'Which note wins?',
  null,
  null,
  'extension',
  '60000000-0000-4000-8000-00000000000a',
  pg_catalog.array_prepend(
    0::real,
    pg_catalog.array_prepend(
      1::real,
      pg_catalog.array_fill(0::real, array[1534])
    )
  )::extensions.vector
);

select extensions.is(
  (select note_id from duplicate_capture_result),
  (select note_id from first_capture_result),
  'an idempotent retry returns the original note ID'
);

select extensions.is(
  (select created from duplicate_capture_result),
  false,
  'an idempotent retry reports that no note was created'
);

select extensions.is(
  (
    select count(*)
    from public.notes
    where client_request_id = '60000000-0000-4000-8000-00000000000a'
  ),
  1::bigint,
  'an idempotent retry leaves exactly one note'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select extensions.throws_ok(
  $$
    select *
    from public.capture_note_atomic(
      'Anonymous capture.',
      null,
      'observation',
      'Anonymous capture.',
      array['anonymous', 'testing'],
      'Should this save?',
      null,
      null,
      'web',
      '60000000-0000-4000-8000-00000000000b',
      pg_catalog.array_fill(0::real, array[1536])::extensions.vector
    )
  $$,
  '42501',
  null,
  'anonymous callers cannot execute atomic capture'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000b',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select extensions.lives_ok(
  $$
    select *
    from public.capture_note_atomic(
      'Synthetic user B capture.',
      null,
      'observation',
      'Synthetic user B summary.',
      array['isolation', 'testing'],
      'Who owns this note?',
      null,
      null,
      'web',
      '60000000-0000-4000-8000-00000000000b',
      pg_catalog.array_fill(0::real, array[1536])::extensions.vector
    )
  $$,
  'user B can atomically capture an owned note'
);

select extensions.is(
  (
    select count(*)
    from public.notes
    where client_request_id = '60000000-0000-4000-8000-00000000000a'
  ),
  0::bigint,
  'user B cannot see user A atomic captures'
);

reset role;

create function pg_temp.reject_review_fixture()
returns trigger
language plpgsql
as $$
begin
  raise exception 'synthetic review failure';
end;
$$;

create trigger phase_2_reject_review_fixture
before insert on public.review_events
for each row execute function pg_temp.reject_review_fixture();

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000a',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select extensions.throws_ok(
  $$
    select *
    from public.capture_note_atomic(
      'This note must roll back.',
      null,
      'lesson',
      'Synthetic rollback summary.',
      array['rollback', 'testing'],
      'Did the note roll back?',
      null,
      null,
      'web',
      '60000000-0000-4000-8000-00000000000c',
      pg_catalog.array_fill(0::real, array[1536])::extensions.vector
    )
  $$,
  'P0001',
  'synthetic review failure',
  'a review insertion failure aborts atomic capture'
);

reset role;
drop trigger phase_2_reject_review_fixture on public.review_events;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000a',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select extensions.is(
  (
    select count(*)
    from public.notes
    where client_request_id = '60000000-0000-4000-8000-00000000000c'
  ),
  0::bigint,
  'a failed review insertion leaves no partial note row'
);

reset role;
select * from extensions.finish();
rollback;
