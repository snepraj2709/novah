# Hypomnēmata Practice implementation

> Status: Frozen implementation contract. Documentation only.
>
> Authority: This document defines the approved redesign from semantic recall
> and fixed review stages to deliberate Practice. Ideas 1–3 must be implemented
> sequentially and must pass their phase gates. Ideas 4–5 are future work and
> must not be implemented until Ideas 1–3 are complete and approved.
>
> Safety boundary: Creating or editing this document does not authorize code
> changes, migrations, commits, pushes, deployments, hosted data changes, Cron
> or webhook reconfiguration, Telegram messages, or paid provider calls. Each
> external action requires Sneha's explicit approval for that exact action.

## 1. Purpose

Novah currently uses **Recall** for semantic search and a separate five-stage
**Review** flow for memory testing. The new product goal is different: help a
person repeatedly encounter a chosen quotation, principle, or note until they
decide it has become part of how they think or act.

The product vocabulary becomes:

- **Find**: retrieve original notes by meaning. This is the renamed existing
  semantic-search capability.
- **Practice**: deliberately reread selected notes and optionally add a
  Reflection or Story.
- **Integrated**: a user-declared state. Novah must never infer or declare that
  a quality has been integrated.

The intended loop is:

```text
Capture → Done or Keep this with me → Reread → Optionally reflect or add a story
                                             ↓
                              Continue · Pause · Integrated
```

Rereading is a complete encounter. Writing is always optional.

## 2. Current repository anchors

Implementation must begin by reopening these current sources rather than
assuming this document describes their exact future contents:

- `packages/shared/src/contracts/schemas.ts`: capture/search contracts,
  including the current mandatory `firstReviewDate` and digest schemas.
- `supabase/functions/process-notifications/index.ts` and its shared handler,
  repository, environment, and tests: the current digest and fixed-review
  notification path.
- `apps/web/src/components/NoteDetailDrawer.tsx`: the existing NoteCard drawer,
  which currently renders the original note, personal context, and provenance.

Also trace all consumers of `review_events`, `daily_digests`, `review_status`,
`digest_time`, `review_time`, `firstReviewDate`, the old web routes, and the old
Telegram commands before removing them. Generated database types are outputs,
not the source of truth.

## 3. Locked product decisions

### 3.1 Naming and navigation

- Rename semantic **Recall** to **Find**.
- Rename **Review** to **Practice**.
- Rename **Library** to **Collection**.
- Make `/practice` the authenticated web landing route.
- Use `/collection` for the collection.
- Remove the old `/today`, `/library`, and `/review` routes. Do not add aliases
  or redirects for them.
- Replace Telegram `/search` with `/find` and `/review` with `/practice`.
- Remove Telegram `/today`.
- Unknown and retired Telegram commands return the current help text. They do
  not silently invoke a replacement command.

### 3.2 Capture

- Capture remains one-step and preserves the original note.
- The extension shows **Note** and **Save** by default.
- Personal context, Type, source title, and source URL remain editable under a
  collapsed **Add details** disclosure.
- After a successful capture, show **Done** and **Keep this with me**.
- Activation is explicit. A saved-only note has no Practice row.
- The extension contains Capture and Find only. It may activate the newly saved
  note, but it does not implement the full Practice or reflection interface.
- Remove `firstReviewDate` from the capture response in one coordinated breaking
  cutover across shared contracts, Edge Functions, web, extension, Telegram,
  tests, and generated database types.

### 3.3 Active Practice

- A user may have at most three active practices.
- Enforce the limit transactionally in Postgres, not only in clients.
- Paused and integrated practices do not consume active slots.
- The first activation uses a one-day interval.
- The profile remembers the last selected interval. Later activations use that
  value without opening an interval picker.
- Intervals are whole calendar days from `1` through `30`.
- All practices use the account timezone and one account-level Practice time.
- A newly activated or resumed practice first becomes due on the next local
  calendar day.
- When an encounter is completed, calculate the next due date from the current
  user-local date, not from an overdue date. Do not create catch-up encounters.
- A due encounter stays due until the user acts.
- Telegram may notify once per local day while an active practice remains due.
- An ignored day does not create a missed event or advance the schedule.
- The exact original note is visible during Practice. Do not hide it behind a
  reveal step or ask the user to grade their memory.
- **Reread** completes a due encounter without requiring text.

### 3.4 Reflection and Story

- Reflection and Story are distinct user-selected entry types.
- Both types are append-only.
- Entries cannot be edited or individually deleted.
- Deleting the parent note or account cascades entries.
- Practice cards never render prompts, entry inputs, or entry content.
- The NoteCard drawer exclusively owns prompts, Reflection/Story inputs, and the
  complete chronological entry thread.
- Web supports text entries only.
- Telegram supports text and voice replies.
- Telegram voice keeps the existing maximum duration of two minutes and maximum
  size of 10 MiB. Raw audio is cleared after transcription and is never stored
  durably.
- Adding an entry while its practice is due completes that encounter.
- Adding an entry when the practice is not due leaves its schedule unchanged.
- Find searches and synthesizes from original notes only. Practice entries are
  not embedded, searched, or supplied to grounded Find synthesis in this
  version.

### 3.5 AI boundary

AI is permitted only for:

- classifying a capture when Type is omitted;
- embedding the original note for Find;
- grounded Find synthesis from retrieved original notes; and
- transcribing Telegram voice.

Do not use AI to generate or classify reflections, choose prompts, judge
progress, infer character, decide integration, or create a personal-growth
narrative.

The drawer exposes **Give me a prompt**. It reveals one prompt from this fixed
bank:

1. “What feels most relevant in this today?”
2. “Where did this show up in your life recently?”
3. “Where did you forget or resist this?”
4. “What would living this look like today?”
5. “Has your understanding of this changed?”

Choose the prompt deterministically from the note ID and current Practice-entry
count. Reopening the same unchanged drawer must show the same prompt and must not
make a provider call.

### 3.6 Pause, resume, and integration

- Pause supports either a selected resume date or an indefinite pause.
- A paused practice frees its active slot.
- When a dated pause expires and a slot is free, automatically return it to
  active status with its first due date on the next local day.
- When a dated pause expires and all three active slots are occupied, keep it
  paused with a **Ready to resume** state. Notify once; do not displace another
  practice.
- Manual resume also requires a free slot and otherwise returns
  `practice_slots_full`.
- Marking a practice Integrated frees its active slot and schedules an
  integration check-in 30 calendar days later.
- Integrated check-ins do not consume active slots.
- Group all integrated check-ins due for a user into one Telegram packet.
- Each item offers **Still integrated**, **Resume practice**, and
  **Stop check-ins**.
- **Still integrated** schedules the next check-in 30 days from the user's
  current local date.
- **Resume practice** requires a free active slot and first becomes due on the
  next local day.
- **Stop check-ins** keeps the practice integrated and clears its next check-in.
- An ignored integrated check-in remains waiting on web but receives no repeat
  Telegram message for that check-in cycle.

### 3.7 Export and privacy

- Preserve the existing JSON and Markdown note-only export wire formats.
- Do not add Practice status, lifecycle events, Reflections, or Stories to
  exports.
- The Collection export UI and Privacy page must explicitly disclose that
  Reflection and Story entries are not included in exports.
- This exclusion is intentional even though entries are append-only.
- Account and parent-note deletion remain the supported way to erase Practice
  writing.

### 3.8 Removed product behavior

Remove the daily digest completely:

- stored digest data and table;
- digest profile setting;
- digest generation and validation schemas;
- OpenAI digest model path;
- notification repository and handler branches;
- Today-page digest UI;
- tests, runbook instructions, and privacy/product copy that claim it exists.

Remove the old five-stage Review system completely:

- `review_events` rows and table;
- `review_status` and fixed stage/offset constants;
- review claim, reveal, feedback, and delivery RPCs;
- remembered, partial, missed, and skipped scoring;
- Review page, settings, Telegram callbacks, commands, copy, and tests;
- automatic review-event creation during capture.

Existing notes stay saved-only. Do not convert them into active practices.
Review and digest deletion requires a verified backup before hosted cleanup.

## 4. Final storage contract

Use forward-only migrations. The authoritative schema is Postgres; regenerate
TypeScript types only after the local migration replay succeeds.

### 4.1 Profile changes

Replace the current notification settings with:

| Column                        | Type       | Required | Rule                         |
| ----------------------------- | ---------- | -------- | ---------------------------- |
| `timezone`                    | `text`     | Yes      | Existing valid IANA timezone |
| `practice_time`               | `time`     | Yes      | Default `09:00`              |
| `last_practice_interval_days` | `smallint` | Yes      | Default `1`; range `1..30`   |

- Rename `review_time` to `practice_time` so the existing 09:00 preference is
  preserved.
- Drop `digest_time` only in the destructive cleanup migration.

### 4.2 `note_practices`

One row exists for each note that has ever been activated.

Required fields:

- `note_id` as the primary key;
- `user_id`, with an owned-note composite foreign key and cascade delete;
- `status`: `active`, `paused`, or `integrated`;
- `interval_days`, constrained to `1..30`;
- `next_due_on`, nullable outside active scheduling;
- `paused_until`, nullable; `NULL` means an indefinite pause when paused;
- `ready_to_resume`, default false;
- `integrated_at`, nullable;
- `check_ins_enabled`, default true only after integration;
- `next_check_in_on`, nullable;
- `last_practised_at`, nullable;
- active and check-in notification claim/sent markers;
- `created_at` and `updated_at`.

State constraints must reject contradictory rows. Examples: an active row must
have `next_due_on`; a paused row must not be due; an integrated row must have
`integrated_at`; a disabled check-in must not have `next_check_in_on`.

### 4.3 `practice_entries`

Required fields:

- UUID primary key;
- owner and parent note with cascade delete;
- kind: `reflection` or `story`;
- nonblank bounded text;
- source channel: `web`, `telegram_text`, or `telegram_voice`;
- `created_at`.

Order a note's thread by `created_at`, then ID. Do not add update or individual
delete operations.

### 4.4 `practice_events`

Record append-only, content-free events for:

- activation;
- reread;
- interval change;
- pause;
- ready to resume;
- resume;
- integration;
- integration confirmation; and
- stopped check-ins.

Store owner, note, event kind, occurred-at timestamp, and the relevant local
date. Metadata may contain only bounded scheduling values such as the previous
and new interval or pause date; it must not contain note or reflection text.

### 4.5 `telegram_reply_prompts`

Store:

- chat and bot prompt message IDs;
- owner and note;
- intent: `reflection`, `story`, or `interval`;
- expiry at 24 hours;
- consumed timestamp; and
- creation timestamp.

The `(chat_id, prompt_message_id)` pair is unique. Consumption is atomic and
single-use. An expired or consumed reply returns `reply_expired`; it must not be
silently converted into a new capture.

### 4.6 RLS and mutation boundary

- Authenticated browser clients may select only their owned Practice rows,
  entries, and user-visible events.
- Revoke direct insert, update, and delete access for Practice state.
- Mutations go through owner-scoped security-definer RPCs that derive the owner
  from `auth.uid()`.
- Telegram uses service-role-only wrappers that require an explicit user ID and
  execute the same state-transition rules.
- Activation and resume lock the owner's profile row before counting active
  practices. Concurrent requests must never create a fourth active practice.
- Parent-note and account deletion cascade all Practice rows, entries, events,
  notification claims, and reply prompts.

## 5. Shared HTTP contract

Add a JWT-protected Edge Function:

```text
POST /functions/v1/manage-practice
```

Add `[functions.manage-practice] verify_jwt = true` to Supabase configuration.
The handler uses strict shared Zod schemas and the existing authenticated HTTP,
CORS, timeout, and error-envelope conventions.

### 5.1 Request union

Use `action` as the discriminator.

```ts
type ManagePracticeRequest =
  | { action: 'activate'; noteId: string }
  | { action: 'reread'; noteId: string }
  | { action: 'setInterval'; noteId: string; intervalDays: number }
  | { action: 'pause'; noteId: string; resumeOn?: string }
  | { action: 'resume'; noteId: string }
  | { action: 'integrate'; noteId: string }
  | { action: 'confirmIntegrated'; noteId: string }
  | { action: 'stopCheckIns'; noteId: string }
  | {
      action: 'addEntry';
      noteId: string;
      entryKind: 'reflection' | 'story';
      text: string;
    };
```

- `noteId` is a UUID.
- `intervalDays` is an integer from 1 through 30.
- `resumeOn` is an ISO calendar date. Omission means indefinite pause.
- Entry text is normalized with the existing captured-text rules and must be
  bounded by a named shared constant.
- Reject unknown fields.

### 5.2 Response

Return the current state after mutation:

```ts
interface ManagePracticeResponse {
  practice: {
    noteId: string;
    status: 'active' | 'paused' | 'integrated';
    intervalDays: number;
    nextDueOn: string | null;
    pausedUntil: string | null;
    readyToResume: boolean;
    integratedAt: string | null;
    checkInsEnabled: boolean;
    nextCheckInOn: string | null;
    lastPractisedAt: string | null;
  };
  entry?: {
    id: string;
    kind: 'reflection' | 'story';
    text: string;
    sourceChannel: 'web' | 'telegram_text' | 'telegram_voice';
    createdAt: string;
  };
}
```

The browser request derives `sourceChannel: 'web'`. Telegram supplies its
trusted server-side channel through its service-only repository path.

### 5.3 Standard errors

Use the existing JSON error envelope and add:

| Code                  | Meaning                                              |
| --------------------- | ---------------------------------------------------- |
| `practice_slots_full` | Activation or resume would exceed three active rows. |
| `practice_not_found`  | No owned Practice row exists for the note.           |
| `invalid_transition`  | The action is invalid for the current state.         |
| `entry_too_long`      | Reflection or Story exceeds the shared limit.        |
| `reply_expired`       | Telegram prompt is expired or already consumed.      |
| `stale_action`        | A duplicate callback targets an already changed due. |

Mutations and Telegram callbacks are idempotent. Retrying the same completed
action must not duplicate an event, entry, or schedule advancement.

## 6. Scheduling and Telegram contract

### 6.1 Notification worker

Retain the `process-notifications` endpoint and ten-minute Cron frequency, but
repurpose it for Practice only.

- Remove the OpenAI provider and `OPENAI_API_KEY` dependency from the worker.
- Select profiles whose local Practice window is eligible.
- Claim due active practices with `FOR UPDATE SKIP LOCKED`.
- Claims expire so a crashed worker can retry safely.
- Send each active due practice as a separate message.
- Mark a successful active notification for that user-local day.
- An overdue active practice may be notified again on the next local day, but
  never more than once on the same local day.
- Claim all due integrated check-ins for the user and send them as one grouped
  packet.
- A successfully sent integrated check-in is not sent again until the user
  confirms it and a new 30-day cycle becomes due.
- Failed sends release or expire claims without advancing schedules.
- Duplicate Cron runs cannot duplicate sent messages or state transitions.

### 6.2 Active Practice message

Show the exact original note and optional source title. Provide:

- **Reread**;
- **Reflect**;
- **Add story**;
- **Pause**;
- **Integrated**; and
- **Change interval**.

The callback payload must remain within Telegram's 64-byte limit and contain no
note text.

### 6.3 Telegram replies

- **Reflect**, **Add story**, and **Change interval** send a ForceReply prompt.
- Extend Telegram parsing to preserve `reply_to_message.message_id`.
- Record the returned bot message ID in `telegram_reply_prompts`.
- A valid reply is routed by chat ID and replied-to message ID.
- A Reflection/Story reply may be text or voice.
- An interval reply must be text containing one integer from 1 through 30.
- Invalid interval text keeps the prompt usable and asks again.
- Successful processing consumes the prompt exactly once.
- A non-reply ordinary text or voice message remains a new capture.
- A reply to an expired/consumed Practice prompt reports expiry and does not
  become a capture.

### 6.4 Telegram commands

The supported linked-user commands become:

- `/find QUERY`;
- `/practice`;
- `/settings`;
- `/start` and `/help`.

Linking and ordinary capture remain supported. Remove `/search`, `/today`, and
`/review` from parsing, help, tests, and product copy.

## 7. Web and extension contract

### 7.1 Practice page

`/practice` is the default signed-in page and shows:

- active-slot usage out of three;
- due active practices;
- active practices not yet due and their next dates;
- paused practices that are ready to resume;
- integrated check-ins waiting for action.

A Practice card shows the exact note, source, status/due information, and
lifecycle actions. **Reflect** and **Add story** open the NoteCard drawer; entry
content never renders on the card.

### 7.2 Collection page

`/collection` replaces Library and provides status filters:

- Saved;
- Practising;
- Paused;
- Integrated.

Find remains available but secondary to browsing. Type filtering and export may
remain behind secondary controls. Existing notes have Saved status until the
user activates them.

### 7.3 NoteCard drawer

Extend the existing accessible dialog rather than creating a second modal. It
must retain focus trapping, Escape/backdrop close behavior, opener focus
restoration, full original text, personal context, and provenance.

Add:

- Practice state and interval;
- activate, reread, interval, pause, resume, integrate, confirm, and stop-check
  controls as valid for the current state;
- **Give me a prompt** with deterministic fixed-bank output;
- separate Reflection and Story text inputs;
- an ordered, labeled, timestamped thread.

Entries have no edit or delete controls.

### 7.4 Extension

- Rename the Recall tab and copy to Find without changing the grounded search
  request or response semantics.
- Collapse optional capture fields under **Add details**.
- Replace the post-capture first-review implication with **Done** and
  **Keep this with me**.
- `Keep this with me` calls `manage-practice` with `activate`.
- If all slots are occupied, keep the note saved, show a clear slot-full error,
  and direct the user to web Practice. Do not auto-pause another note.

### 7.5 Settings and removed screens

- Settings retains timezone, Practice time, and Telegram connection controls.
- Remove digest time and review time language.
- Remove Today and Review pages and their navigation items.
- Do not show digest or fixed-review counts anywhere.

## 8. Sequential implementation phases

Implement one phase at a time. After its gate passes, record evidence in this
document and stop for Sneha's review. Do not start the next phase or create a
phase commit without explicit approval.

### Phase 1 — Idea 1: Active Practice foundation

Implement:

- additive final Practice schema and owner/service mutation foundations;
- capture response cutover without `firstReviewDate`;
- explicit activation and maximum-three enforcement;
- one-day default, next-local-day first due, and Reread advancement;
- `/practice`, initial Practice page, active-slot display, and activation from
  Collection and extension;
- basic separate-message Telegram Practice delivery;
- Find/Practice/Collection naming and new routes/commands needed by this phase.

Gate:

- fresh local migration replay and regenerated types pass;
- ownership and cross-user isolation pass;
- concurrent activation cannot create a fourth active practice;
- capture is atomic and creates no Review row;
- first due date respects the user's timezone;
- Reread advances once and duplicate requests do not advance twice;
- an ignored due remains due and sends no more than once per local day;
- coordinated shared, function, web, extension, and Telegram contract tests pass.

### Phase 2 — Idea 2: Living reflection thread

Implement:

- append-only Reflection/Story entries;
- drawer-only prompt, inputs, and chronological thread;
- deterministic prompt selection with zero provider calls;
- Telegram ForceReply storage, parsing, text/voice routing, and expiry;
- due-entry completion and non-due-entry schedule preservation.

Gate:

- users cannot read or append entries on another user's note;
- direct update/delete and unsupported entry kinds are rejected;
- note and account deletion cascade entries and prompts;
- reply prompts are single-use and expire after 24 hours;
- expired Practice replies never become new captures;
- ordinary non-reply Telegram text/voice still captures notes;
- voice limits, transcription, and raw-buffer clearing pass;
- due Reflection/Story advances once; non-due entries do not advance;
- entry content and prompt controls appear only in the drawer.

### Phase 3 — Idea 3: Bandwidth-aware lifecycle

Implement:

- remembered custom intervals from 1 through 30 days;
- dated and indefinite pause;
- ready-to-resume behavior when a pause expires into a full active set;
- manual resume without displacement;
- integration, grouped monthly check-ins, confirmation, resume, and stop;
- final Practice settings and Telegram interval-reply flow;
- complete removal of digest and fixed-Review runtime consumers.

Gate:

- interval bounds and remembered-default behavior pass;
- interval changes and completions use user-local calendar dates;
- dated pause resumes only when a slot exists;
- full-slot resume returns `practice_slots_full` without changing other rows;
- integrated check-ins do not consume active slots;
- grouped check-ins send once per cycle and each callback is idempotent;
- ignored integrated checks stay on web without Telegram repeats;
- the notification worker constructs no text-model provider and performs zero
  digest-generation calls;
- removed Review/digest behavior is absent from runtime searches and UI.

### Final cutover and cleanup

The final cleanup is separate from the three additive implementation phases.

1. Obtain approval and create a verified database backup covering profiles,
   notes, `review_events`, and `daily_digests`.
2. Pause the production notification Cron.
3. Apply the additive Practice migration.
4. Deploy the coordinated shared contract, capture/manage-practice functions,
   Telegram webhook, notification worker, web app, and extension package.
5. Require private-beta users to reload the new extension before capture.
6. Run an approved, bounded smoke journey and clean its fixtures.
7. Apply a distinct destructive cleanup migration that drops legacy rows,
   tables, type, RPCs, profile column, indexes, grants, and policies.
8. Regenerate types and rerun the complete gate.
9. Reconfigure the ten-minute Cron and prove duplicate execution safety.

After destructive cleanup, application rollback is forward-only unless the
backup is restored. Do not claim rollback safety without proving the restore
path.

## 9. Deferred versions

### Idea 4 — Ready-at-hand situational rehearsal

Document only. Do not implement in Ideas 1–3.

Future work may add user-authored if-then intentions, calendar-aware prompts,
browser-context triggers, meeting reminders, and grounded suggestions. It must
remain opt-in. Do not add autonomous context monitoring, inferred life advice,
or unapproved third-party integrations.

Entry criteria:

- Ideas 1–3 are complete and approved;
- active Practice and notification load are measured;
- the user chooses the first supported context source and permission model; and
- privacy, failure, and disconnect behavior are documented first.

### Idea 5 — Personal canon and integration ceremony

Document only. Do not implement in Ideas 1–3.

The first release contains only the Integrated state and minimal monthly
check-in. Future work may add an optional “What changed?” story, Personal Canon
view, long-term embodiment timeline, reflection embeddings, semantic
connections across threads, and periodic personal-growth review.

AI must never decide that a quality is integrated or manufacture evidence of
personal change.

Entry criteria:

- Idea 4 is separately approved or explicitly skipped;
- enough real integrated-practice history exists to validate the experience;
- the user decides whether Practice writing may enter Find or exports; and
- any new model calls receive a separate data, cost, and cleanup approval.

## 10. Verification matrix

### Database and pgTAP

- owner-only reads and mutations for every new table and RPC;
- cross-user note/practice/entry isolation;
- maximum three active rows under concurrent activation/resume;
- state-dependent constraints and interval bounds;
- user-local due-date and integration-check calculations;
- append-only entry/event enforcement;
- notification claim expiry, deduplication, and retry;
- idempotent lifecycle actions;
- note/account cascades;
- no automatic conversion of existing notes;
- legacy Review/digest objects absent after cleanup.

### Edge Function tests

- strict request and response schemas;
- authentication, CORS, size limits, and normalized errors;
- every valid and invalid state transition;
- stale/duplicate action behavior;
- Telegram command/callback/reply parsing;
- ForceReply expiry and atomic consumption;
- text versus voice entry routing;
- unchanged ordinary Telegram capture;
- voice limits and raw-buffer clearing;
- active notification and grouped check-in delivery;
- duplicate worker execution;
- no digest generator or digest model request.

### Web tests

- `/practice` is the signed-in landing route;
- old routes are unsupported rather than aliased;
- Practice states, due actions, active-slot errors, and schedules;
- Collection status filters and original-note Find;
- NoteCard drawer accessibility remains intact;
- prompts, inputs, and entry history appear only in the drawer;
- deterministic prompt stability;
- append-only thread presentation;
- simplified settings and absence of digest/Review UI;
- note-only export remains format-compatible and discloses exclusions.

### Extension tests

- Capture and Find are the only tabs;
- optional details are collapsed without losing captured provenance;
- the new capture response validates without `firstReviewDate`;
- **Done** clears the success state;
- **Keep this with me** activates once;
- slot-full leaves the note saved and does not activate or pause anything;
- grounded Find behavior remains unchanged apart from naming.

### End-to-end journey

With isolated user A and user B:

1. Capture a note and leave it saved-only.
2. Activate it and confirm next-local-day scheduling.
3. Activate two more and reject the fourth.
4. Reread one due note.
5. Add web Reflection and Story entries.
6. Add Telegram text and voice entries by replying to the correct prompts.
7. Confirm unrelated Telegram messages remain captures.
8. Change interval, pause, and resume.
9. Exercise ready-to-resume with all slots full.
10. Integrate notes and receive one grouped monthly check-in.
11. Confirm, resume, and stop check-ins on separate items.
12. Verify no cross-user visibility or mutation.
13. Delete a note and then an account; verify all owned Practice data cascades.

### Final local gate

Run, at minimum:

```bash
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

Update any repository verification scripts whose current assertions require
Review, digest, old routes, old commands, or `firstReviewDate`. Hosted and live
verification remain approval-gated.

## 11. Phase evidence

The implementing agent must append concise evidence here after each approved
phase. Until then, leave every phase Pending.

| Phase                                 | Status   | Evidence                                                                                                                                                                                                         |
| ------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idea 1 — Active Practice foundation   | Complete | Fresh reset/types; 136 pgTAP assertions plus signed-JWT concurrent activation (3 active, fourth rejected); 53 function, 8 web, and 13 extension tests; type, lint, format, build, security, and diff gates pass. |
| Idea 2 — Living reflection thread     | Complete | Fresh reset/types; 166 pgTAP assertions (30 for entries/replies/cascades) plus concurrency; 64 function, 11 web, and 13 extension tests; type, lint, format, build, security, and diff gates pass.               |
| Idea 3 — Bandwidth-aware lifecycle    | Complete | Fresh reset/types; 194 pgTAP assertions plus signed-JWT concurrency; 70 function, 13 web, and 13 extension tests; type, lint, format, build, security, runtime-removal, and diff gates pass.                     |
| Final destructive cleanup and cutover | Pending  | —                                                                                                                                                                                                                |
