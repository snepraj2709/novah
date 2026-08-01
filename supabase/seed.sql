-- Local-only identities for database and Row Level Security verification.
-- They intentionally have no password and cannot sign in. Create login-capable
-- users through the local Auth API or Studio when client testing begins.
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
