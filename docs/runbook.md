# Novah Runbook

> Status: Phase 5 review fixes are verified locally; corrected hosted verification is pending.

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

### Phase 5 notifications

`process-notifications` accepts only `POST` requests bearing `CRON_SECRET` as a
Bearer token. It checks each linked profile against a timezone-local ten-minute
window, returns operational counts only, and never returns note content. The
function needs server-side `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `CRON_SECRET`,
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; never place those values in a
browser application or tracked file.

The delivery path persists a unique daily digest before its Telegram call.
Review events receive an atomic delivery claim before one grouped packet is
sent. This deliberately favors at-most-once notification attempts: an uncertain
Telegram outcome is not retried automatically because doing so could duplicate
a message. A successful call records `sent_at`; a claimed row without `sent_at`
must be investigated manually without clearing its claim until Telegram delivery
is known.

Local verification is credential-free:

```bash
pnpm db:reset
pnpm db:test
pnpm test:functions
pnpm typecheck
```

Both Phase 5 migrations, corrected `process-notifications`, corrected
`telegram-webhook` and the single ten-minute Cron job are hosted on Novah.
Telegram forwards exactly `message` and `callback_query` while preserving signed
delivery. Hosted contracts, corrected live delivery, immediate retry
deduplication, settings restoration and independent cleanup pass. Do not rerun
live delivery, rotate its secret, replace the job or change Telegram's webhook
without separate explicit approval.

Before configuring Cron, set the Edge Function's `CRON_SECRET` to the same value
held in the local process. The guarded command sends that value only to an
authenticated, side-effect-free probe; it changes nothing in Vault unless the
deployed function accepts the exact secret. After the probe passes, it stores the
value in Supabase Vault and atomically replaces any existing Novah schedule with
exactly one `*/10 * * * *` job. The approval guard must equal the exact project
reference:

```bash
NOVAH_APPROVE_PHASE5_CRON_WRITE=fqinppulljqefbvukcpg pnpm phase5:cron:configure
pnpm phase5:cron:status
```

The job command contains only a Vault lookup, never the secret value. Forward
migration `20260802120000` configures a 120-second HTTP timeout so the request can
outlive the bounded OpenAI and Telegram provider calls. The guarded Cron
configuration was rerun after deployment; repeat it only after a future approved
secret or command change. The status command's `lastDispatch` is pg_cron's SQL
dispatch result; it does not claim that the asynchronous HTTP response succeeded.
Use the authenticated probe and processor response for endpoint health. Rollback
is also guarded and requires separate destructive approval:

```bash
NOVAH_APPROVE_PHASE5_CRON_REMOVAL=fqinppulljqefbvukcpg pnpm phase5:cron:remove
```

Never interpolate or record the Cron secret in migration output, shell history,
documentation or evidence.

After the migrations and both functions are deployed, the hosted contract verifier
can create one disposable Auth user, exercise concurrent digest/review claims and
owner-scoped callbacks, then cascade-delete and confirm removal of every fixture.
It makes no OpenAI or Telegram call. Running it is still a hosted write and needs
explicit approval plus the exact-project guard:

```bash
NOVAH_APPROVE_PHASE5_HOSTED_FIXTURES=fqinppulljqefbvukcpg pnpm test:notifications:hosted
```

The bounded live verifier requires a sole linked tester, selects a clean local
date, sends one synthetic digest and one review packet, immediately checks retry
deduplication, then restores settings and deletes its rows. It makes no model call
for its one-note digest. Run the zero-write preflight first; it evaluates existing
capture timestamps in every candidate timezone. After fixture insertion, the live
path independently refuses delivery unless exactly one synthetic note and one
synthetic due review are eligible. Treat the delivery command as a real Telegram
write and obtain separate approval before use:

```bash
NOVAH_APPROVE_PHASE5_LIVE_DELIVERY=fqinppulljqefbvukcpg pnpm test:notifications:live:preflight
NOVAH_APPROVE_PHASE5_LIVE_DELIVERY=fqinppulljqefbvukcpg pnpm test:notifications:live
NOVAH_APPROVE_PHASE5_LIVE_DELIVERY=fqinppulljqefbvukcpg pnpm test:notifications:live:cleanup
```

Live digest/review delivery, signed callback forwarding and a succeeded Cron run
are recorded separately from the hosted contract verifier. Owner-scoped hosted
contracts cover reveal, skip and recall-quality event isolation.

## Environment and secrets

Document variable placement and rotation procedures without recording secret values. Real environment files must remain untracked.

## Deployment and rollback

Document approved deployment steps, deployed identifiers and tested rollback commands when production deployment begins.

## Operations and recovery

For a suspected duplicate notification job, inspect Cron schedules and disable
the extra schedule before invoking the processor again. A duplicate digest row
for one user and date is prevented by the database constraint; claimed review
events cannot be reclaimed. Do not clear claims or resend until the original
Telegram outcome is known. Hosted inspection and schedule changes require
explicit approval.

Telegram outages can leave a persisted digest or review claim without `sent_at`.
Preserve that evidence, resolve the outage, and decide manually whether a resend
is safe. Automatic retry is intentionally disabled for claimed deliveries.
