begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(30);

-- Keep the local suite self-contained. Hosted Auth and REST verification uses
-- scripts/verify-phase-1-hosted.mjs because the linked CLI role cannot write
-- auth fixtures or install pgTAP on the managed project.
insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4000-8000-00000000000a',
    'novah-test-a@example.invalid',
    '{"fixture":"phase-1-user-a"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-00000000000b',
    'novah-test-b@example.invalid',
    '{"fixture":"phase-1-user-b"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.notes (
  id,
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
)
values
  (
    '10000000-0000-4000-8000-00000000000a',
    '00000000-0000-4000-8000-00000000000a',
    '20000000-0000-4000-8000-00000000000a',
    'A synthetic note owned by test user A.',
    'Used only to verify ownership isolation.',
    'observation',
    'Synthetic isolation fixture for user A.',
    array['isolation', 'testing'],
    'Which user owns fixture A?',
    'Novah Phase 1 fixture',
    'https://example.invalid/novah/fixture-a',
    'web',
    pg_catalog.array_prepend(
      1::real,
      pg_catalog.array_fill(0::real, array[1535])
    )::extensions.vector
  ),
  (
    '10000000-0000-4000-8000-00000000000b',
    '00000000-0000-4000-8000-00000000000b',
    '20000000-0000-4000-8000-00000000000b',
    'A synthetic note owned by test user B.',
    'Used only to verify ownership isolation.',
    'observation',
    'Synthetic isolation fixture for user B.',
    array['isolation', 'testing'],
    'Which user owns fixture B?',
    'Novah Phase 1 fixture',
    'https://example.invalid/novah/fixture-b',
    'web',
    pg_catalog.array_prepend(
      0::real,
      pg_catalog.array_prepend(
        1::real,
        pg_catalog.array_fill(0::real, array[1534])
      )
    )::extensions.vector
  )
on conflict (id) do nothing;

select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where
      namespace.nspname = 'public'
      and relation.relname in (
        'profiles',
        'notes',
        'review_events',
        'daily_digests',
        'telegram_link_codes',
        'processed_telegram_updates'
      )
      and relation.relrowsecurity
  ),
  6::bigint,
  'RLS is enabled on every Phase 1 table'
);

select extensions.is(
  (
    select count(*)
    from public.profiles
    where user_id in (
      '00000000-0000-4000-8000-00000000000a',
      '00000000-0000-4000-8000-00000000000b'
    )
  ),
  2::bigint,
  'the auth signup trigger created both seeded profiles'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000a',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select extensions.is(
  auth.uid(),
  '00000000-0000-4000-8000-00000000000a'::uuid,
  'the test session is authenticated as user A'
);

select extensions.lives_ok(
  $$
    insert into public.notes (
      id,
      user_id,
      client_request_id,
      original_text,
      note_type,
      summary,
      tags,
      recall_prompt,
      capture_channel
    ) values (
      '30000000-0000-4000-8000-00000000000a',
      '00000000-0000-4000-8000-00000000000a',
      '40000000-0000-4000-8000-00000000000a',
      E'  User A\ncan insert\tand read this note.  ',
      'lesson',
      'User A CRUD verification.',
      array['crud', 'testing'],
      'What can user A do?',
      'web'
    )
  $$,
  'user A can insert an owned note'
);

select extensions.is(
  (
    select original_text
    from public.notes
    where id = '30000000-0000-4000-8000-00000000000a'
  ),
  'User A can insert and read this note.',
  'owned notes are readable and whitespace-normalized'
);

select extensions.lives_ok(
  $$
    update public.notes
    set summary = 'User A updated this synthetic note.'
    where id = '30000000-0000-4000-8000-00000000000a'
  $$,
  'user A can update an owned note'
);

select extensions.is(
  (
    select summary
    from public.notes
    where id = '30000000-0000-4000-8000-00000000000a'
  ),
  'User A updated this synthetic note.',
  'user A reads the updated value'
);

select extensions.lives_ok(
  $$
    insert into public.review_events (user_id, note_id, stage, due_on)
    values (
      '00000000-0000-4000-8000-00000000000a',
      '30000000-0000-4000-8000-00000000000a',
      1,
      current_date + 1
    )
  $$,
  'user A can insert an owned review event'
);

select extensions.lives_ok(
  $$
    delete from public.notes
    where id = '30000000-0000-4000-8000-00000000000a'
  $$,
  'user A can delete an owned note'
);

select extensions.is(
  (
    select count(*)
    from public.review_events
    where note_id = '30000000-0000-4000-8000-00000000000a'
  ),
  0::bigint,
  'deleting a note cascades to its review events'
);

select extensions.throws_ok(
  $$
    insert into public.notes (
      id,
      user_id,
      client_request_id,
      original_text,
      note_type,
      summary,
      recall_prompt,
      capture_channel
    ) values (
      '30000000-0000-4000-8000-00000000000b',
      '00000000-0000-4000-8000-00000000000a',
      '20000000-0000-4000-8000-00000000000a',
      'Duplicate request fixture.',
      'lesson',
      'Duplicate request fixture.',
      'Which request is duplicated?',
      'web'
    )
  $$,
  '23505',
  null,
  'capture idempotency rejects a duplicate user/request pair'
);

select extensions.is(
  (
    select count(*)
    from public.notes
    where id = '10000000-0000-4000-8000-00000000000b'
  ),
  0::bigint,
  'user A cannot select user B note rows'
);

select extensions.results_eq(
  $$
    select note_id
    from public.match_notes(
      pg_catalog.array_prepend(
        1::real,
        pg_catalog.array_fill(0::real, array[1535])
      )::extensions.vector,
      20
    )
  $$,
  $$ values ('10000000-0000-4000-8000-00000000000a'::uuid) $$,
  'match_notes returns only user A notes'
);

select extensions.is_empty(
  $$
    update public.notes
    set summary = 'Cross-user update must not apply.'
    where id = '10000000-0000-4000-8000-00000000000b'
    returning id
  $$,
  'user A cannot update user B notes'
);

select extensions.throws_ok(
  $$ select * from public.processed_telegram_updates $$,
  '42501',
  null,
  'authenticated clients cannot access processed Telegram updates'
);

select extensions.lives_ok(
  $$
    insert into public.telegram_link_codes (
      id,
      user_id,
      code_hash,
      expires_at
    ) values (
      '50000000-0000-4000-8000-00000000000a',
      '00000000-0000-4000-8000-00000000000a',
      repeat('a', 64),
      now() + interval '10 minutes'
    )
  $$,
  'a unique link-code hash with a ten-minute expiry is accepted'
);

select extensions.throws_ok(
  $$
    insert into public.telegram_link_codes (
      id,
      user_id,
      code_hash,
      expires_at
    ) values (
      '50000000-0000-4000-8000-00000000000b',
      '00000000-0000-4000-8000-00000000000a',
      repeat('a', 64),
      now() + interval '10 minutes'
    )
  $$,
  '23505',
  null,
  'duplicate link-code hashes are rejected'
);

select extensions.throws_ok(
  $$
    insert into public.telegram_link_codes (
      id,
      user_id,
      code_hash,
      expires_at
    ) values (
      '50000000-0000-4000-8000-00000000000c',
      '00000000-0000-4000-8000-00000000000a',
      repeat('b', 64),
      now() + interval '11 minutes'
    )
  $$,
  '23514',
  null,
  'link codes cannot exceed the ten-minute expiry window'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000b',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select extensions.is(
  auth.uid(),
  '00000000-0000-4000-8000-00000000000b'::uuid,
  'the test session is authenticated as user B'
);

select extensions.is(
  (
    select count(*)
    from public.notes
    where id = '10000000-0000-4000-8000-00000000000a'
  ),
  0::bigint,
  'user B cannot select user A note rows'
);

select extensions.is(
  (
    select count(*)
    from public.notes
    where id = '10000000-0000-4000-8000-00000000000b'
  ),
  1::bigint,
  'user B can select its own note'
);

select extensions.results_eq(
  $$
    select note_id
    from public.match_notes(
      pg_catalog.array_prepend(
        1::real,
        pg_catalog.array_fill(0::real, array[1535])
      )::extensions.vector,
      20
    )
  $$,
  $$ values ('10000000-0000-4000-8000-00000000000b'::uuid) $$,
  'match_notes returns only user B notes even when user A vector is queried'
);

select extensions.is_empty(
  $$
    delete from public.notes
    where id = '10000000-0000-4000-8000-00000000000a'
    returning id
  $$,
  'user B cannot delete user A notes'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select extensions.throws_ok(
  $$ select * from public.notes $$,
  '42501',
  null,
  'anonymous table access is rejected'
);

select extensions.throws_ok(
  $$
    select *
    from public.match_notes(
      pg_catalog.array_prepend(
        1::real,
        pg_catalog.array_fill(0::real, array[1535])
      )::extensions.vector,
      8
    )
  $$,
  '42501',
  null,
  'anonymous vector search is rejected'
);

reset role;

select extensions.is(
  (
    select count(*)
    from (
      values
        ('profiles'),
        ('notes'),
        ('review_events'),
        ('daily_digests'),
        ('telegram_link_codes'),
        ('processed_telegram_updates')
    ) as required_table(name)
    where pg_catalog.has_table_privilege(
      'service_role',
      'public.' || required_table.name,
      'select,insert,update,delete'
    )
  ),
  6::bigint,
  'service_role can operate on every Phase 1 table'
);

select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where
      namespace.nspname = 'public'
      and procedure.proname in (
        'is_valid_timezone',
        'normalize_whitespace',
        'are_normalized_tags',
        'is_http_url'
      )
      and not pg_catalog.has_function_privilege('anon', procedure.oid, 'execute')
  ),
  4::bigint,
  'anonymous callers cannot execute public validation helpers'
);

select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where
      namespace.nspname = 'public'
      and procedure.proname in (
        'is_valid_timezone',
        'normalize_whitespace',
        'are_normalized_tags',
        'is_http_url'
      )
      and pg_catalog.has_function_privilege('authenticated', procedure.oid, 'execute')
  ),
  4::bigint,
  'authenticated writes retain validation-helper execution'
);

select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_constraint
    where conname = 'telegram_link_codes_hash_unique'
  ),
  1::bigint,
  'link-code hash uniqueness is enforced'
);

select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_constraint
    where conname = 'telegram_link_codes_ten_minute_expiry'
  ),
  1::bigint,
  'the ten-minute link-code expiry ceiling is enforced'
);

select * from extensions.finish();
rollback;
