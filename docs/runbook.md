# Novah Runbook

> Status: Phase 1 database procedures verified; later operational procedures remain pending their implementation phases.

## Local development

### Supabase

Prerequisites: Docker Desktop must be running. The Supabase CLI is installed as
a root workspace development dependency.

```bash
pnpm db:start
pnpm db:reset
pnpm db:test
```

`pnpm db:reset` targets only the local database, replays tracked migrations and
loads `supabase/seed.sql`. The seed creates two synthetic, non-login identities
for database isolation tests; it contains no password or production data.

Regenerate shared database types after a schema change:

```bash
pnpm db:types
```

The generated file is kept separate from `database.ts`, which corrects nullable
`match_notes` return fields that Supabase cannot infer from a PostgreSQL
`returns table` function.

### Hosted Phase 1 verification

Only after approval for hosted test-user creation and cleanup, provide these
test-only values to one process without writing them to an environment file:

```text
NOVAH_TEST_SUPABASE_URL
NOVAH_TEST_SUPABASE_PUBLISHABLE_KEY
NOVAH_TEST_SUPABASE_SERVICE_ROLE_KEY
```

Then run:

```bash
pnpm db:test:hosted
```

The verifier is pinned to the Novah project reference, creates two disposable
password-auth users and synthetic rows, tests hosted isolation and server-table
access, and removes all fixtures in a `finally` cleanup. Its output contains
only pass/fail labels. Never paste, print or commit the test credentials.

Apply a tracked migration only after naming the target project and obtaining
explicit approval:

```bash
pnpm exec supabase db push
```

### Chrome extension

The extension reads the public Supabase URL and publishable key from the
ignored root `.env`. It must not receive the service-role key or an OpenAI key.

```bash
pnpm --filter extension test
pnpm --filter extension typecheck
pnpm --filter extension build
```

The production build is written to
`apps/extension/.output/chrome-mv3`. Load that directory through
`chrome://extensions` with Developer mode enabled. The committed public
manifest key produces extension ID `mgjpgplhhbhlakjiaikaniaadapgofjd` so the
server can use an explicit CORS allowlist rather than a wildcard.

Before hosted extension verification, confirm `ALLOWED_EXTENSION_IDS` contains
that exact ID in the target Supabase project. Changing the hosted secret still
requires explicit approval. After loading or reloading the unpacked build,
select text on an ordinary article and use **Save to Novah**. Chrome should open
the side panel with the exact selected text, page title and HTTP(S) URL. Chrome
PDF or internal pages that do not expose a shareable URL show a manual URL
fallback while preserving the selected text and title.

Failed captures remain under the extension-local
`novah-capture-drafts` storage key and reuse the same `clientRequestId` when
retried. Supabase Auth uses the separate `novah-auth-session` key. Do not copy
either storage value into logs or test evidence.

The web development command will be documented when its feature phase is
implemented.

## Environment and secrets

Document variable placement and rotation procedures without recording secret values. Real environment files must remain untracked.

## Deployment and rollback

Document approved deployment steps, deployed identifiers and tested rollback commands when production deployment begins.

## Operations and recovery

Document recovery procedures for failed capture, Telegram outages and suspected duplicate notification jobs after those flows exist.
