begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(20);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000a',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temporary table first_link_code on commit drop as
select *
from public.create_telegram_link_code(
  pg_catalog.repeat('a', 64)
);

select extensions.is(
  extract(
    epoch from (
      (select expires_at from first_link_code) - statement_timestamp()
    )
  )::integer,
  600,
  'link codes expire exactly ten minutes after issue'
);

select extensions.is(
  (select connected from first_link_code),
  false,
  'link-code response reports an unlinked profile'
);

select extensions.is(
  (
    select count(*)
    from public.telegram_link_codes
    where
      user_id = '00000000-0000-4000-8000-00000000000a'
      and consumed_at is null
  ),
  1::bigint,
  'one active link code is stored for the caller'
);

select *
from public.create_telegram_link_code(
  pg_catalog.repeat('b', 64)
);

select extensions.results_eq(
  $$
    select code_hash
    from public.telegram_link_codes
    where
      user_id = '00000000-0000-4000-8000-00000000000a'
      and consumed_at is null
  $$,
  $$ values (pg_catalog.repeat('b', 64)) $$,
  'a newly generated code replaces the previous unconsumed code'
);

select extensions.throws_ok(
  $$
    select public.consume_telegram_link_code(
      pg_catalog.repeat('b', 64),
      700000000001
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot consume Telegram link codes'
);

select extensions.throws_ok(
  $$
    select *
    from public.capture_note_atomic_for_user(
      '00000000-0000-4000-8000-00000000000a',
      'Unauthorized internal capture.',
      null,
      'observation',
      'Unauthorized internal capture.',
      array['authorization', 'testing'],
      'Should this internal call succeed?',
      null,
      null,
      'telegram_text',
      '70000000-0000-4000-8000-00000000000a',
      pg_catalog.array_fill(0::real, array[1536])::extensions.vector
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot invoke service capture'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

select extensions.is(
  public.consume_telegram_link_code(
    pg_catalog.repeat('b', 64),
    700000000001
  ),
  '00000000-0000-4000-8000-00000000000a'::uuid,
  'a valid code links one private chat to its owning user'
);

select extensions.is(
  (
    select telegram_chat_id
    from public.profiles
    where user_id = '00000000-0000-4000-8000-00000000000a'
  ),
  700000000001::bigint,
  'the linked chat is stored on the expected profile'
);

select extensions.is(
  public.consume_telegram_link_code(
    pg_catalog.repeat('b', 64),
    700000000001
  ),
  null::uuid,
  'a consumed code cannot be reused'
);

insert into public.telegram_link_codes (
  user_id,
  code_hash,
  created_at,
  expires_at
) values (
  '00000000-0000-4000-8000-00000000000b',
  pg_catalog.repeat('c', 64),
  statement_timestamp() - interval '11 minutes',
  statement_timestamp() - interval '1 minute'
);

select extensions.is(
  public.consume_telegram_link_code(
    pg_catalog.repeat('c', 64),
    700000000002
  ),
  null::uuid,
  'an expired code cannot link a chat'
);

insert into public.telegram_link_codes (
  user_id,
  code_hash,
  created_at,
  expires_at
) values (
  '00000000-0000-4000-8000-00000000000b',
  pg_catalog.repeat('d', 64),
  statement_timestamp(),
  statement_timestamp() + interval '10 minutes'
);

select extensions.is(
  public.consume_telegram_link_code(
    pg_catalog.repeat('d', 64),
    700000000001
  ),
  null::uuid,
  'a chat already owned by another profile cannot be relinked'
);

select extensions.is(
  (
    select telegram_chat_id
    from public.profiles
    where user_id = '00000000-0000-4000-8000-00000000000b'
  ),
  null::bigint,
  'a failed chat collision leaves the second profile unlinked'
);

select extensions.lives_ok(
  $$
    insert into public.processed_telegram_updates (update_id)
    values (800000000001)
  $$,
  'the service role can claim a Telegram update'
);

select extensions.throws_ok(
  $$
    insert into public.processed_telegram_updates (update_id)
    values (800000000001)
  $$,
  '23505',
  null,
  'a replayed Telegram update is rejected by its primary key'
);

create temporary table telegram_capture on commit drop as
select *
from public.capture_note_atomic_for_user(
  '00000000-0000-4000-8000-00000000000a',
  E'  Telegram\nkeeps\tthe original wording.  ',
  null,
  'lesson',
  null,
  '{}'::text[],
  null,
  'Forwarded Telegram message',
  null,
  'telegram_text',
  '70000000-0000-4000-8000-00000000000b',
  pg_catalog.array_prepend(
    1::real,
    pg_catalog.array_fill(0::real, array[1535])
  )::extensions.vector
);

select extensions.is(
  (select stored_original_text from telegram_capture),
  'Telegram keeps the original wording.',
  'service capture preserves normalized Telegram text'
);

select extensions.is(
  (
    select count(*)
    from public.review_events
    where note_id = (select note_id from telegram_capture)
  ),
  5::bigint,
  'service capture creates exactly five review events'
);

select extensions.is(
  (
    select user_id
    from public.notes
    where id = (select note_id from telegram_capture)
  ),
  '00000000-0000-4000-8000-00000000000a'::uuid,
  'Telegram service capture stores the note only for its explicit user'
);

select extensions.results_eq(
  $$
    select note_id
    from public.match_notes_for_user(
      '00000000-0000-4000-8000-00000000000a',
      pg_catalog.array_prepend(
        1::real,
        pg_catalog.array_fill(0::real, array[1535])
      )::extensions.vector,
      20
    )
  $$,
  $$
    select id
    from public.notes
    where user_id = '00000000-0000-4000-8000-00000000000a'
    order by embedding operator(extensions.<=>) pg_catalog.array_prepend(
      1::real,
      pg_catalog.array_fill(0::real, array[1535])
    )::extensions.vector
    limit 20
  $$,
  'service search returns only the explicitly authorized user notes'
);

select extensions.is_empty(
  $$
    select note_id
    from public.match_notes_for_user(
      '00000000-0000-4000-8000-00000000000b',
      pg_catalog.array_prepend(
        1::real,
        pg_catalog.array_fill(0::real, array[1535])
      )::extensions.vector,
      20
    )
    where note_id = (select note_id from telegram_capture)
  $$,
  'service search cannot return another user Telegram capture'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);

select extensions.throws_ok(
  $$
    select *
    from public.create_telegram_link_code(pg_catalog.repeat('e', 64))
  $$,
  '42501',
  null,
  'anonymous callers cannot create Telegram link codes'
);

reset role;
select * from extensions.finish();
rollback;
