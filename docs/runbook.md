# Novah Runbook

> Status: The existing Phase 8 production deployment, bounded smoke verification,
> rollback evidence and cleanup pass. The capture AI simplification is verified
> locally only and must not be deployed without a separate approved rollout.

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
manifest key produces extension ID `illdnfhcgdhkgbifepbejobplgikmmlp` so the
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

A successful capture shows **Saved to Novah** and the assigned Type; it does not
render a generated summary or tags. Recall cards show original text, optional
context, Type, source and similarity. Verify those fields with long text and
missing optional context/source at both side-panel and narrow mobile widths.

### Web dashboard

```bash
pnpm --filter web dev
pnpm --filter web test
pnpm --filter web build
```

The web app uses only the public Supabase URL and publishable key. Keep the
service-role, OpenAI, Telegram and Cron secrets out of every browser environment.
JSON exports use `novah-export` format version `2` and contain only the note ID,
original text, optional context, Type, provenance, capture channel and capture
timestamp. Markdown exports contain the same user-facing data in bounded
structure and omit legacy summary, tag and recall-prompt sections.

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

Real environment files remain untracked. Browser bundles receive only the public
Supabase URL and publishable key. Edge Functions hold provider, webhook, Cron and
service-role secrets. To rotate a secret, create the replacement locally, update
the intended hosted secret store only after explicit approval, verify the
affected signed endpoint, and then revoke the old value. Never print the value,
put it on a command line that will be retained, or copy it into evidence.

Run `pnpm test:security` against tracked files and current web and extension
build outputs before a release. It scans credential shapes, all six Edge
Function authorization modes, wildcard CORS and production application logging.

### Production placement

| Variable                        | Production placement                                     | Classification |
| ------------------------------- | -------------------------------------------------------- | -------------- |
| `VITE_SUPABASE_URL`             | Vercel Production and extension build environment        | Public         |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel Production and extension build environment        | Public         |
| `APP_URL`                       | Supabase Edge Function secret/config and Auth `site_url` | Public origin  |
| `ALLOWED_EXTENSION_IDS`         | Supabase Edge Function secret/config                     | Public IDs     |
| `OPENAI_API_KEY`                | Supabase Edge Function secrets only                      | Secret         |
| `TELEGRAM_BOT_TOKEN`            | Supabase Edge Function secrets only                      | Secret         |
| `TELEGRAM_WEBHOOK_SECRET`       | Supabase Edge Function secrets only                      | Secret         |
| `CRON_SECRET`                   | Supabase Edge Function secrets and Supabase Vault only   | Secret         |
| `SUPABASE_URL`                  | Supabase-managed Edge Function environment               | Managed        |
| `SUPABASE_ANON_KEY`             | Supabase-managed Edge Function environment               | Managed public |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase-managed Edge Function environment               | Managed secret |

Vercel must never receive any server-only provider, service-role, webhook or
Cron secret. The committed `vercel.json` builds the `web` workspace, publishes
`apps/web/dist`, applies the SPA fallback, and adds browser security headers.
Run the credential-free placement check before linking or deploying Vercel:

```bash
pnpm test:phase8:config
pnpm --filter web build
```

The production `APP_URL` is also substituted into `supabase/config.toml` for
Auth redirects. `supabase config push` is a hosted configuration write and must
not run until the exact Vercel production URL is known and approved.

## Provider and request safety

User JSON requests are limited to 64 KiB; Telegram updates are limited to 256
KiB. Notes are limited to 20,000 characters, source URLs to 2,048 characters and
HTTP(S), and voice messages to two minutes and 10 MiB. Limits apply to declared
and streamed bodies.

New captures classify only when Type is omitted. An explicit Type costs one
embedding operation; an omitted Type costs one classification plus one embedding.
Idempotent retries cost zero provider operations. The embedding input is a
deterministic JSON object containing normalized original text and optional context
and source title, never source URL or generated prose. New rows keep the legacy
database columns as `summary = NULL`, `tags = '{}'` and `recall_prompt = NULL`.

Search costs one query embedding and adds one grounded synthesis call only when
retrieval is strong. One-note and oversized-day digests are deterministic and
cost zero model calls; eligible bounded multi-note digests cost one generation
call. Telegram voice adds one transcription before the applicable capture calls.
Text-generation requests use `store: false`. Count logical operations separately
from retry attempts and obtain explicit approval before any paid or hosted probe.

OpenAI requests have a 30-second timeout and at most two attempts for transient
failures. Safe Telegram reads and acknowledgements have a 20-second timeout and
at most two attempts. Message sends retry only an explicit rate limit; network
or server failures have an uncertain delivery outcome and are not automatically
repeated.

Production function source emits no application logs. In particular, note text,
transcriptions, request bodies, authorization headers and secret values are not
logged. Hosting-platform metadata may still include request time, status and
function identity; inspect only those fields during an incident.

## Deployment and rollback

Phase 8 owns deployment and rollback. Before deploying, preserve the current
function versions, migration list, Cron status, Telegram webhook metadata and
Vercel project state. Apply only reviewed migrations, deploy all six functions,
run content-free authorization probes, and record the resulting identifiers.

Keep the deployment ledger at `.novah-private/phase-8-deployment.md`. That
directory is ignored by Git. Record no token, secret, authorization header,
personal identifier or note content. The ledger contains only timestamps,
project/deployment/function identifiers, public URLs, before/after versions,
smoke-test pass/fail labels and the applicable commands below.

After explicit approval naming project `fqinppulljqefbvukcpg`, run the migration
dry-run before any push. A dry-run that reports no pending migration is valid
parity evidence and must not be replaced by migration-history edits.

```bash
pnpm exec supabase db push --dry-run
pnpm exec supabase db push
pnpm exec supabase functions deploy --project-ref fqinppulljqefbvukcpg --use-api
```

The two public Vite variables belong in Vercel Production. Add them through
stdin so their values are not placed on a retained command line, build with the
production environment, deploy with `vercel deploy --prod`, and inspect the
assigned production alias before setting `APP_URL`.

Set `APP_URL` and `ALLOWED_EXTENSION_IDS` in the Edge Function environment only
after the final HTTPS production origin is known. Then push the reviewed Auth
configuration and redeploy the user-facing functions so their CORS environment
is current. Never pass provider or signing secrets to Vercel.

After deployment, run the sanitized production gate with the exact assigned
origin. It checks live SPA deep links and headers, the linked Vercel project,
Vercel env names, migration/function parity, exact web and extension CORS, Cron
and Telegram webhook state. It reads credentials only from authenticated CLIs
and the ignored `.env`, and prints no values:

```bash
NOVAH_PHASE8_WEB_URL=https://<assigned-novah-origin> pnpm test:phase8:production-status
```

The current stable production origin is `https://novah-ten.vercel.app`. Its
production gate passed with six browser security headers, exactly two public
Vercel variables, no checked server secret, migration and six-function parity,
strict web/extension CORS with hostile-origin denial, one healthy Cron job and a
healthy Telegram webhook. Deployment identifiers and rollback state remain only
in the ignored private ledger.

Telegram webhook configuration must use the hosted `telegram-webhook` URL, the
existing secret token and exactly the `message` and `callback_query` update
types. Inspect `getWebhookInfo` immediately afterward. Configuring the webhook
does not authorize sending a test message.

The production smoke account is disposable and its random credentials are
written with user-only permissions to the ignored
`.novah-private/phase-8-smoke.json` file. The lifecycle commands never print
credentials or identifiers:

```bash
NOVAH_APPROVE_PHASE8_ACCOUNT_WRITE=fqinppulljqefbvukcpg pnpm phase8:smoke:create
pnpm phase8:smoke:status
NOVAH_APPROVE_PHASE8_ACCOUNT_WRITE=fqinppulljqefbvukcpg pnpm phase8:smoke:cleanup
```

If the sole linked tester's Telegram chat must be used for the fresh smoke
account, obtain separate approval before temporarily moving that binding. The
prepare command persists the original binding before clearing it. Cleanup
refuses to finish without restoring it:

```bash
NOVAH_APPROVE_PHASE8_TELEGRAM_REBIND=fqinppulljqefbvukcpg pnpm phase8:smoke:telegram:prepare
NOVAH_APPROVE_PHASE8_TELEGRAM_REBIND=fqinppulljqefbvukcpg pnpm phase8:smoke:telegram:restore
```

After at least one smoke capture, a separate guarded helper may move exactly one
stage-one synthetic review to the test profile's current local date. It prints
no event or user identifier. Send `/review` only after this preparation, submit
one callback, and confirm `answeredReviewCount` through the status command:

```bash
NOVAH_APPROVE_PHASE8_REVIEW_WRITE=fqinppulljqefbvukcpg pnpm phase8:smoke:review:prepare
```

The account lifecycle itself makes zero OpenAI calls and sends zero Telegram
messages. Browser capture, search, Telegram text/voice, digest and review smoke
steps require a separately approved provider-call and message ceiling. Always
run cleanup in a `finally` path after the original Telegram binding is restored.

The first Phase 8 smoke account was cleaned after its empty-library extension
request exceeded the browser harness window. A revised approval raised the
ceiling to 16 logical OpenAI operations and 32 HTTP attempts, retained the
US$0.25 and Telegram limits, and allowed individual redeployment of
`search-notes` and `capture-note` without secret changes. The second account
completed the full journey. Sanitized direct and browser evidence showed the
empty-library response was valid; Chrome-for-Testing required the DevTools
response body to be consumed before its instrumented UI settled.

Final smoke evidence covers two extension captures, Telegram text and voice
capture, extension and Telegram weak retrieval, a digest, review reveal and
feedback, JSON and Markdown export, production note deletion and reauthenticated
account deletion. The live notification verifier used a one-note deterministic
fixture, sent one digest and one review packet, proved retry deduplication,
restored settings and removed its rows with zero model calls. Cleanup restored
the original Telegram binding, verified account cascades, deleted private
credentials and removed all temporary browser/download tooling. The conservative
provider ledger was exactly 16 logical operations and at most 31 HTTP attempts.
Sensitive deployment identifiers and rollback commands remain only in the
ignored private ledger.

The Cron rollback command removes the sole schedule and is destructive. Function
rollback uses the preserved source commit and redeploys the affected function;
database rollback requires a reviewed forward migration rather than editing
migration history. Vercel rollback promotes the preserved prior production
deployment. Telegram rollback restores the preserved webhook URL and allowed
updates. Every rollback action requires separate approval.

Migration `20260803004000` is forward-only and preserves historical metadata. A
code rollback to the prior function bundle can still write those nullable legacy
columns through the unchanged RPC signatures, but it resumes summary/tag/recall
generation and therefore requires an explicit product rollback decision. Do not
re-add `NOT NULL`, purge legacy metadata, edit migration history or backfill rows
during rollback; use a separately reviewed forward migration if schema reversal
is ever required.

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

For a failed extension or web capture, keep the local draft and its original
`clientRequestId`. Check endpoint health without note content, resolve the
provider or network problem, and retry the same request ID. The database
idempotency constraint prevents a second note if the first response was lost.

For duplicate webhook suspicion, inspect the Telegram update claim before doing
anything else. A claimed update is acknowledged without repeating capture,
search or callback side effects. Do not delete a claim to force replay.

For export problems, retry the client-side export; it reads only the signed-in
user's library and makes no server mutation. For note deletion, confirm the
target in the UI and then verify the row and its review events disappeared. For
account deletion, export first if needed, confirm the destructive action, and
verify sign-out after the privileged deletion returns success. Never treat a
client timeout as proof that account deletion failed; check account state before
repeating it.

## Retrieval evaluation

`pnpm test:retrieval:validate` checks the synthetic 15-note, 30-query fixture and
its expected note IDs without a provider call. A live measurement sends all 45
synthetic strings in one embeddings request only when the exact approval guard
and a locally held OpenAI key are present:

```bash
NOVAH_APPROVE_PHASE7_EVAL=one-openai-embedding-call pnpm test:retrieval:live
```

Record the top-five hit rate and classify every miss as note wording, embedding
quality, query ambiguity or an incorrect expected match. Do not lower the
similarity threshold to disguise misses. The search path continues to withhold
synthesis for weak retrieval and for any unsupported citation.
