import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseContainer = 'supabase_db_novah';
const prePracticeVersion = '20260803004000';
const userId = '00000000-0000-4000-8000-00000000000a';
const noteId = '10000000-0000-4000-8000-00000000000a';
const reviewId = '30000000-0000-4000-8000-00000000000a';
const digestId = '40000000-0000-4000-8000-00000000000a';

function pnpm(args) {
  execFileSync('pnpm', args, { cwd: root, stdio: 'inherit' });
}

function psql(sql) {
  return execFileSync(
    'docker',
    [
      'exec',
      databaseContainer,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-c',
      sql,
    ],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  ).trim();
}

function restoreCurrentDatabase() {
  pnpm(['db:reset']);
  pnpm(['db:types']);
}

let simulationStarted = false;
let failure;

try {
  pnpm([
    'exec',
    'supabase',
    'db',
    'reset',
    '--local',
    '--version',
    prePracticeVersion,
  ]);
  simulationStarted = true;

  psql(`
    insert into public.review_events (
      id, user_id, note_id, stage, due_on, status
    ) values (
      '${reviewId}', '${userId}', '${noteId}', 1, '2026-08-05', 'pending'
    );

    insert into public.daily_digests (
      id, user_id, digest_date, note_ids, content
    ) values (
      '${digestId}',
      '${userId}',
      '2026-08-04',
      array['${noteId}'::uuid],
      '{"captureCount":1,"items":[]}'::jsonb
    );
  `);

  pnpm(['exec', 'supabase', 'migration', 'up', '--local']);

  const evidence = JSON.parse(
    psql(`
      select pg_catalog.json_build_object(
        'preservedReviews', (
          select pg_catalog.count(*)
          from public.review_events
          where id = '${reviewId}'
        ),
        'preservedDigests', (
          select pg_catalog.count(*)
          from public.daily_digests
          where id = '${digestId}'
        ),
        'convertedPractices', (
          select pg_catalog.count(*)
          from public.note_practices
          where user_id = '${userId}'
        ),
        'practiceTime', (
          select practice_time::text
          from public.profiles
          where user_id = '${userId}'
        ),
        'oldReviewTimeExists', exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'profiles'
            and column_name = 'review_time'
        ),
        'cleanupDeferred', exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'profiles'
            and column_name = 'digest_time'
        ),
        'practiceMigrations', (
          select pg_catalog.count(*)
          from supabase_migrations.schema_migrations
          where version in (
            '20260803090000',
            '20260803160000',
            '20260804100000'
          )
        )
      )::text;
    `),
  );

  assert.deepEqual(evidence, {
    preservedReviews: 1,
    preservedDigests: 1,
    convertedPractices: 0,
    practiceTime: '09:00:00',
    oldReviewTimeExists: false,
    cleanupDeferred: true,
    practiceMigrations: 3,
  });

  console.log(
    JSON.stringify({
      localOnly: true,
      prePracticeVersion,
      migrationsApplied: evidence.practiceMigrations,
      legacyRowsPreserved: 2,
      existingNotesAutoActivated: false,
      reviewTimePreservedAsPracticeTime: true,
    }),
  );
} catch (error) {
  failure = error;
} finally {
  if (simulationStarted) {
    try {
      restoreCurrentDatabase();
    } catch (restoreError) {
      if (failure) {
        console.error(
          'The upgrade check failed and local restoration also failed.',
        );
        console.error(restoreError);
      } else {
        failure = restoreError;
      }
    }
  }
}

if (failure) throw failure;
