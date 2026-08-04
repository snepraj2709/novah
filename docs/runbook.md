# Novah runbook

> Status: Ideas 1–3 are complete locally and pass the frozen phase gates.
> Deployment, hosted
> data changes, Cron or webhook changes, paid provider calls, and destructive
> cleanup each require separate explicit approval.

## Local development

Docker Desktop and the workspace-pinned Supabase CLI are required.

```bash
pnpm db:start
pnpm db:reset
pnpm db:types
pnpm db:test
pnpm test:functions
pnpm --filter web test
pnpm --filter extension test
pnpm typecheck
```

`pnpm db:reset` targets only the local database, replays forward migrations,
and loads synthetic seed identities. It does not contact the hosted project.
Regenerate `packages/shared/src/types/database.generated.ts` only after a clean
local replay. The handwritten `database.ts` layer corrects nullable
`returns table` columns that the generator cannot infer.

The complete pre-review gate is:

```bash
pnpm test:practice:upgrade
pnpm db:reset
pnpm db:types
pnpm db:test
pnpm test:functions
pnpm --filter web test
pnpm --filter extension test
pnpm --filter extension typecheck
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter web build
pnpm --filter extension build
pnpm test:security
git diff --check
```

## Practice lifecycle

Practice state is authoritative in Postgres. Browser mutations use the
JWT-protected `manage-practice` Edge Function; Telegram uses service-only RPC
wrappers that execute the same transition rules. Application roles do not
directly insert, update, or delete Practice rows or append-only events.

Activation and resume lock the profile row before counting active Practices.
Three active rows are allowed; a fourth returns `practice_slots_full` without
changing another row. Paused and Integrated rows do not consume slots.

Intervals are whole days from 1 through 30. Activation and resume first become
due on the next account-local day. Reread and due entry completion schedule from
the current account-local date, so overdue Practices never create catch-up
encounters.

A dated pause is reconciled during the account's Practice window. It resumes
automatically when a slot exists. If all slots are occupied, it stays paused as
Ready to resume and receives one notification. Indefinite pauses wait for a
manual resume.

Integrated items schedule a check-in 30 account-local days later. Due items are
sent in one Telegram packet. A successful packet is not sent again during that
cycle. Still integrated schedules another 30-day cycle, Resume practice uses an
active slot, and Stop check-ins clears the future check-in while preserving the
Integrated state.

## Notification worker

`process-notifications` accepts only `POST` with `CRON_SECRET` as a Bearer
token. It uses `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`TELEGRAM_BOT_TOKEN`, and `CRON_SECRET`. It constructs no text-model provider
and has no `OPENAI_API_KEY` dependency.

The ten-minute worker window is calculated in each account timezone. During an
eligible window it:

1. reconciles expired dated pauses, including accounts without Telegram;
2. sends each due active Practice separately;
3. sends each newly Ready to resume notice once; and
4. groups all due Integrated check-ins for an account into one packet.

Claims use row locks and expire after 15 minutes so a crashed process can retry.
Successful active delivery is deduplicated by account-local day. Successful
check-in delivery remains suppressed until the user starts a new cycle. A
failed Telegram send does not mark delivery or advance any schedule.

Do not clear a live claim merely to force a resend. First establish whether the
original Telegram outcome is known. Hosted inspection and schedule changes
remain approval-gated.

## Telegram

Linked private chats support ordinary text and voice capture plus:

- `/find QUERY`
- `/practice`
- `/settings`
- `/start` and `/help`

Unknown or retired commands return current help. Practice messages use bounded
callback payloads containing only action codes and note IDs. Reflection, Story,
and interval actions create 24-hour ForceReply prompts. Reflection and Story
accept text or bounded voice; interval replies accept one text integer from 1
through 30. Invalid interval text leaves the prompt open. Expired or consumed
prompts never fall through to ordinary capture.

Voice input is limited to two minutes and 10 MiB. The raw buffer is cleared
after transcription and is not stored durably.

The webhook handler requires `TELEGRAM_WEBHOOK_SECRET`, and Telegram API calls
use `TELEGRAM_BOT_TOKEN`; both remain server-only. Webhook configuration,
secret rotation, callback forwarding tests, and any message sent to a real chat
require explicit approval. Never print or commit bot tokens, webhook secrets,
chat IDs, prompt IDs, or note content.

## Web and extension

```bash
pnpm --filter web dev
pnpm --filter web test
pnpm --filter web build

pnpm --filter extension test
pnpm --filter extension typecheck
pnpm --filter extension build
```

The web app uses only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. `/practice` is the authenticated landing
route; `/collection`, `/settings`, and `/privacy` are the other supported
screens. Old screen paths are unsupported, not aliases.

The Collection supports Saved, Practising, Paused, and Integrated filters.
Exports remain note-only JSON version 2 or Markdown. Reflection and Story
entries are intentionally excluded and are erased only through parent-note or
account deletion.

The extension contains Capture and Find only. Optional provenance stays under
Add details. A successful capture offers Done and Keep this with me. Slot-full
activation leaves the note saved and directs the user to web Practice.

Browser bundles must never receive a service-role key, OpenAI key, Telegram
token, webhook secret, or Cron secret.

## Provider and request safety

AI is limited to optional note Type classification, original-note embeddings,
grounded Find synthesis, and Telegram voice transcription. The Practice worker,
prompt bank, lifecycle decisions, and integration state use no AI.

User JSON requests are limited to 64 KiB; Telegram updates to 256 KiB; notes to
20,000 characters; source URLs to 2,048 HTTP(S) characters; and Practice entries
to 5,000 characters. Text-generation requests use `store: false`.

Any provider-backed live test needs explicit approval naming the target,
maximum calls, cost ceiling, mutations, and cleanup. Local mocked tests make no
provider call.

## Deployment and cleanup boundary

Do not deploy from this runbook without separate authorization. Before a future
rollout, preserve current function versions, migration state, Cron status,
webhook metadata, and web deployment state in the ignored private ledger at
`.novah-private/phase-8-deployment.md`. Never record credentials or personal
content.

The final destructive database cleanup is separate from Idea 3. It requires a
verified backup, paused production scheduling, explicit approval, a reviewed
forward migration, regenerated types, and the complete gate. Do not edit
migration history or remove hosted legacy records during an additive Idea 3
rollout.

## Security and recovery

Run `pnpm test:security` against tracked files and current build outputs. It
checks credential shapes, Edge Function authorization boundaries, wildcard
CORS, retired command routing, Practice worker provider isolation, and
production logging.

For a failed capture, retain the local draft and original `clientRequestId`,
resolve the provider or network issue, and retry that same ID. For duplicate
webhook suspicion, inspect the processed-update claim and never delete it to
force replay. For account deletion, export first if needed and verify account
state before repeating a timed-out request.
