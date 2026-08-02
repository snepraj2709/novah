begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(19);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '00000000-0000-4000-8000-00000000007a',
  'novah-phase7-limits@example.invalid',
  '{"fixture":"phase-7-database-limits"}'::jsonb
)
on conflict (id) do nothing;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000007a',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select extensions.throws_ok(
  $$
    insert into public.notes (
      user_id, client_request_id, original_text, note_type, summary, tags,
      recall_prompt, capture_channel
    ) values (
      '00000000-0000-4000-8000-00000000007a', gen_random_uuid(),
      repeat('x', 20001), 'lesson', 'Summary', array['safe-tag'],
      'Recall?', 'web'
    )
  $$,
  '23514', null,
  'direct writes cannot exceed the note-text limit'
);

select extensions.throws_ok(
  $$
    insert into public.notes (
      user_id, client_request_id, original_text, personal_context, note_type,
      summary, tags, recall_prompt, capture_channel
    ) values (
      '00000000-0000-4000-8000-00000000007a', gen_random_uuid(),
      'Note', repeat('x', 2001), 'lesson', 'Summary', array['safe-tag'],
      'Recall?', 'web'
    )
  $$,
  '23514', null,
  'direct writes cannot exceed the personal-context limit'
);

select extensions.throws_ok(
  $$
    insert into public.notes (
      user_id, client_request_id, original_text, note_type, summary, tags,
      recall_prompt, capture_channel
    ) values (
      '00000000-0000-4000-8000-00000000007a', gen_random_uuid(),
      'Note', 'lesson', repeat('x', 501), array['safe-tag'], 'Recall?', 'web'
    )
  $$,
  '23514', null,
  'direct writes cannot exceed the summary limit'
);

select extensions.throws_ok(
  $$
    insert into public.notes (
      user_id, client_request_id, original_text, note_type, summary, tags,
      recall_prompt, capture_channel
    ) values (
      '00000000-0000-4000-8000-00000000007a', gen_random_uuid(),
      'Note', 'lesson', 'Summary', array['safe-tag'], repeat('x', 501), 'web'
    )
  $$,
  '23514', null,
  'direct writes cannot exceed the recall-prompt limit'
);

select extensions.throws_ok(
  $$
    insert into public.notes (
      user_id, client_request_id, original_text, note_type, summary, tags,
      recall_prompt, capture_channel
    ) values (
      '00000000-0000-4000-8000-00000000007a', gen_random_uuid(),
      'Note', 'lesson', '   ', '{}'::text[], null, 'web'
    )
  $$,
  '23514', null,
  'nullable legacy summary still rejects a non-null blank value'
);

select extensions.throws_ok(
  $$
    insert into public.notes (
      user_id, client_request_id, original_text, note_type, summary, tags,
      recall_prompt, capture_channel
    ) values (
      '00000000-0000-4000-8000-00000000007a', gen_random_uuid(),
      'Note', 'lesson', null, '{}'::text[], E'\n\t', 'web'
    )
  $$,
  '23514', null,
  'nullable legacy recall prompt still rejects a non-null blank value'
);

select extensions.throws_ok(
  $$
    insert into public.notes (
      user_id, client_request_id, original_text, note_type, summary, tags,
      recall_prompt, capture_channel
    ) values (
      '00000000-0000-4000-8000-00000000007a', gen_random_uuid(),
      'Note', 'lesson', null, null, null, 'web'
    )
  $$,
  '23502', null,
  'metadata-free direct writes cannot bypass the non-null tag array'
);

select extensions.throws_ok(
  $$
    insert into public.notes (
      user_id, client_request_id, original_text, note_type, summary, tags,
      recall_prompt, source_title, capture_channel
    ) values (
      '00000000-0000-4000-8000-00000000007a', gen_random_uuid(),
      'Note', 'lesson', 'Summary', array['safe-tag'], 'Recall?',
      repeat('x', 501), 'web'
    )
  $$,
  '23514', null,
  'direct writes cannot exceed the source-title limit'
);

select extensions.throws_ok(
  $$
    insert into public.notes (
      user_id, client_request_id, original_text, note_type, summary, tags,
      recall_prompt, source_url, capture_channel
    ) values (
      '00000000-0000-4000-8000-00000000007a', gen_random_uuid(),
      'Note', 'lesson', 'Summary', array['safe-tag'], 'Recall?',
      'https://example.invalid/' || repeat('x', 2025), 'web'
    )
  $$,
  '23514', null,
  'direct writes cannot exceed the source-URL limit'
);

select extensions.throws_ok(
  $$
    insert into public.notes (
      user_id, client_request_id, original_text, note_type, summary, tags,
      recall_prompt, capture_channel
    ) values (
      '00000000-0000-4000-8000-00000000007a', gen_random_uuid(),
      'Note', 'lesson', 'Summary', array['not valid'], 'Recall?', 'web'
    )
  $$,
  '23514', null,
  'direct writes cannot store malformed tags'
);

select extensions.throws_ok(
  $$
    insert into public.telegram_link_codes (
      user_id, code_hash, expires_at
    ) values (
      '00000000-0000-4000-8000-00000000007a',
      'not-a-sha-256-hash', now() + interval '5 minutes'
    )
  $$,
  '23514', null,
  'link codes must store a lowercase SHA-256 hash'
);

select extensions.lives_ok(
  $$
    update public.profiles
    set timezone = 'UTC'
    where user_id = '00000000-0000-4000-8000-00000000007a'
  $$,
  'authenticated users can update user-editable profile settings'
);

select extensions.throws_ok(
  $$
    update public.profiles
    set telegram_chat_id = 700000000007
    where user_id = '00000000-0000-4000-8000-00000000007a'
  $$,
  '42501', null,
  'authenticated users cannot bypass link verification by setting a chat ID'
);

select extensions.is(
  (
    select telegram_chat_id
    from public.profiles
    where user_id = '00000000-0000-4000-8000-00000000007a'
  ),
  null::bigint,
  'a rejected direct chat binding leaves the profile unlinked'
);

reset role;
set local role service_role;
update public.profiles
set telegram_chat_id = 700000000007
where user_id = '00000000-0000-4000-8000-00000000007a';

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000007a',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select extensions.is(
  (
    select connected
    from public.create_telegram_link_code(repeat('c', 64))
  ),
  true,
  'link-code generation reports an already-connected profile'
);

select extensions.is(
  (
    select count(*)
    from public.telegram_link_codes
    where
      user_id = '00000000-0000-4000-8000-00000000007a'
      and consumed_at is null
  ),
  0::bigint,
  'an already-connected profile never receives an invisible active code'
);

select extensions.lives_ok(
  $$
    insert into public.notes (
      user_id, client_request_id, original_text, personal_context, note_type,
      summary, tags, recall_prompt, source_title, source_url, capture_channel
    ) values (
      '00000000-0000-4000-8000-00000000007a', gen_random_uuid(),
      repeat('x', 20000), repeat('x', 2000), 'lesson', repeat('x', 500),
      array['safe-tag', 'limit-2'], repeat('x', 500), repeat('x', 500),
      'https://example.invalid/' || repeat('x', 2024), 'web'
    )
  $$,
  'all exact public-contract limits remain accepted'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.notes (
  id, user_id, client_request_id, original_text, note_type, summary, tags,
  recall_prompt, capture_channel
)
select
  md5('phase-7-review-note-' || fixture.index)::uuid,
  '00000000-0000-4000-8000-00000000007a',
  md5('phase-7-review-request-' || fixture.index)::uuid,
  'Synthetic review backlog note ' || fixture.index,
  'lesson',
  'Synthetic review backlog summary.',
  array['review-backlog'],
  'What belongs in this synthetic review?',
  'web'
from generate_series(1, 17) as fixture(index);

insert into public.review_events (user_id, note_id, stage, due_on)
select
  '00000000-0000-4000-8000-00000000007a',
  md5('phase-7-review-note-' || fixture.index)::uuid,
  stage.value,
  current_date
from generate_series(1, 17) as fixture(index)
cross join generate_series(1, 5) as stage(value);

create temporary table claimed_review_backlog on commit drop as
select *
from public.claim_due_reviews(
  '00000000-0000-4000-8000-00000000007a',
  current_date,
  statement_timestamp()
);

select extensions.is(
  (select count(*) from claimed_review_backlog),
  80::bigint,
  'one review claim stays below the mutable API result ceiling'
);

select extensions.is(
  (
    select count(*)
    from public.review_events
    where
      user_id = '00000000-0000-4000-8000-00000000007a'
      and status = 'pending'
      and delivery_claimed_at is null
      and due_on <= current_date
  ),
  5::bigint,
  'excess review backlog remains unclaimed for the next invocation'
);

select * from extensions.finish();
rollback;
