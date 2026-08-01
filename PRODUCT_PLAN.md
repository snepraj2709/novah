# Novah — Product Plan Lock-in and 24-Hour Execution Guide

> Status: Locked for private-beta implementation  
> Working name: Novah  
> Primary owner: Sneha  
> Execution partner: Codex in Visual Studio Code  
> Target: Working private beta in 24 focused hours  
> Public Chrome Web Store approval: Outside the 24-hour guarantee

---

## 1. How to use this file with Codex

This file is the product contract, technical scope and execution checklist for the repository. Product decisions marked **Locked** should not be reopened during the 24-hour build unless implementation evidence shows that they are impossible.

### First prompt to give Codex

```text
Read PRODUCT_PLAN.md completely before changing any file.

Then inspect the repository and report:
1. which execution phase the repository is currently in;
2. which required files, services or environment variables already exist;
3. conflicts between the repository and the locked plan;
4. the smallest safe next step;
5. how you will verify that step.

Do not implement anything yet. Do not reopen locked product decisions. Do not expose or request secret values in chat.
```

After Codex returns the repository assessment, use:

```text
Execute only the next incomplete checklist item in PRODUCT_PLAN.md.
Run its verification checks, update the checklist and Execution Log with evidence, then stop.
Do not start the following item.
```

For a faster session where one complete phase should be executed:

```text
Execute only Phase <number> from PRODUCT_PLAN.md.
Work through its checklist in order. Do not cross the phase gate unless every required verification passes.
Update the progress tracker and Execution Log, summarize changed files and remaining blockers, then stop.
```

### Codex operating contract

Codex must:

1. Read this file before implementation and after any context reset.
2. Inspect existing code before creating parallel or duplicate structures.
3. Preserve user changes and unrelated work already present in the repository.
4. Work on one checklist item or one explicitly requested phase at a time.
5. Use the locked stack and data model unless a documented blocker requires a deviation.
6. Keep the original captured note separate from all AI-generated metadata.
7. Run the verification listed for a step before marking it complete.
8. Record failed checks honestly; an attempted step is not a completed step.
9. Add a short entry to the Execution Log after each completed item.
10. Propose a commit message at every phase gate, but commit or push only when Sneha asks.
11. Ask before creating paid resources, changing billing, deploying to production, setting a live webhook, submitting to the Chrome Web Store or deleting data.
12. Never place Supabase secret keys, OpenAI keys or Telegram tokens in browser code, logs, Markdown or committed environment files.

Codex must not:

- Add features from the post-MVP list.
- Introduce FastAPI, Express, Redis, queues, LangChain or another vector database.
- Replace Supabase without an explicit product decision.
- Rewrite original quotations or notes with AI output.
- silently weaken Row Level Security to make a test pass.
- Use broad Chrome host permissions when a context-menu or `activeTab` permission is sufficient.
- Claim deployment, notification delivery or security isolation without verifying it.

### Allowed deviation process

If a locked decision blocks implementation, Codex must stop and report:

```text
Blocked decision:
Observed evidence:
Why the locked approach fails:
Smallest viable deviation:
Product or security trade-off:
Files that would change:
```

No deviation is implemented until Sneha approves it.

---

## 2. Product definition

### 2.1 Problem

People save quotations, highlights, lessons and observations across books, PDFs, articles, chats and their own thoughts. The information is captured, but it rarely returns at the moment when it could change a decision or behaviour.

The real problem is not note storage. It is completing the loop from capture to retrieval to repeated integration.

### 2.2 Product promise

**Save what matters. Recall it when it matters.**

Novah helps a user:

1. capture an idea where it appears;
2. preserve its original wording and source;
3. retrieve it through meaning, not only keywords;
4. reconnect it with other saved ideas;
5. revisit it at spaced intervals until it becomes usable knowledge.

### 2.3 Primary user

A single knowledge worker, reader, founder, researcher or creator who regularly consumes articles, books, PDFs, conversations and podcasts and wants their notes to influence real thinking.

### 2.4 Knowledge types

The locked note-type enum is:

```text
quote
argument
lesson
observation
reflection
principle
conversation_note
```

### 2.5 Core product loop

```mermaid
flowchart LR
    A["Capture idea"] --> B["Preserve and enrich"]
    B --> C["Retrieve by meaning"]
    C --> D["Review over time"]
    D --> E["Apply in life"]
    E --> A
```

---

## 3. Locked product decisions

| Decision | Locked choice | Reason |
| --- | --- | --- |
| Initial browser | Chrome only | Keeps extension permissions, testing and packaging bounded. |
| Extension interface | Persistent side panel | Capture and recall remain available beside the source material. |
| Highlight capture | Context-menu selection | Avoids injecting a content script into every webpage. |
| PDF MVP | Selected text from Chrome PDF viewer; manual paste fallback | Full annotation-file parsing is a separate product. |
| Messaging channel | Telegram first | Supports text, voice, commands, callbacks and webhooks without WhatsApp template setup. |
| WhatsApp | Post-MVP | Proactive scheduled messages add template, pricing and approval complexity. |
| Authentication | Supabase email and password for private beta | Most predictable extension-compatible authentication for a 24-hour build. |
| Database | Supabase Postgres | Provides authentication, Row Level Security, storage, SQL and serverless functions together. |
| Vector store | `pgvector` in Supabase | Avoids a second database and synchronization layer. |
| Backend | Supabase Edge Functions in TypeScript | Keeps secrets and OpenAI calls out of the browser without a separate server. |
| Scheduler | One Supabase Cron job every 10 minutes | Processes every user's local schedule without one job per user. |
| Text model | `gpt-5.6-luna` | Low-cost classification, summarization and grounded synthesis. |
| Embedding model | `text-embedding-3-small` | Sufficient and inexpensive for a personal note collection. |
| Transcription model | `gpt-transcribe` | Handles bounded voice-note transcription. |
| AI state | Stateless API calls with `store: false` | The application owns durable state. |
| Web frontend | React, TypeScript, Vite and Tailwind CSS | Familiar, fast and deployable as a small client application. |
| Extension framework | WXT, React and TypeScript | Manifest V3 packaging with a Vite-based development workflow. |
| Package manager | `pnpm` | One workspace and one lockfile. |
| Runtime validation | Zod schemas shared between clients and functions | Prevents API contracts from drifting. |
| Initial audience | Private beta of 5–10 users | Tests the behaviour before optimizing for scale. |
| Payments | Excluded | No price has been validated yet. |

### 3.1 Review timing decision

Revision intervals are treated as calendar-day stages rather than five separate exact-time alarms. Reviews are delivered in one daily packet at the user's preferred review time, default `09:00` in their timezone.

Stages:

| Stage | Calendar offset from capture date |
| --- | ---: |
| 1 | 1 day |
| 2 | 2 days |
| 3 | 3 days |
| 4 | 7 days |
| 5 | 21 days |

This intentionally trades minute-level interval precision for a review habit that does not create notification spam.

---

## 4. MVP scope

### 4.1 Must ship

- [ ] Supabase email/password sign-up and sign-in.
- [ ] Row Level Security on every user-owned table.
- [ ] Chrome Manifest V3 extension.
- [ ] Side-panel sign-in, capture and recall interfaces.
- [ ] Right-click capture of selected article text.
- [ ] Best-effort selected-text capture from Chrome's PDF viewer.
- [ ] Manual text capture fallback.
- [ ] Optional personal context: “Why did this matter to you?”
- [ ] Automatic page title and source URL capture.
- [ ] AI-generated note type, summary, tags and recall prompt.
- [ ] OpenAI embedding generation.
- [ ] `pgvector` similarity search.
- [ ] Grounded answer based only on retrieved notes.
- [ ] Telegram account linking through an expiring one-time code.
- [ ] Telegram text capture.
- [ ] Telegram voice-note transcription and capture.
- [ ] `/search`, `/today`, `/review` and `/settings` commands.
- [ ] Daily 9 PM summary in the user's timezone.
- [ ] Five-stage daily review packet.
- [ ] Review feedback: remembered, partly remembered, missed and skipped.
- [ ] Web Today, Library, Review and Settings pages.
- [ ] Note deletion.
- [ ] Markdown or JSON export.
- [ ] Account deletion with owned-data cleanup.
- [ ] Privacy policy page.
- [ ] Deployed web application and Edge Functions.
- [ ] Packaged extension ZIP.
- [ ] Chrome Web Store submission prepared; submission occurs only after approval from Sneha.

### 4.2 Explicitly excluded

- WhatsApp integration.
- Kindle, Readwise, Notion or Obsidian imports.
- Automatic import of embedded annotations from uploaded PDF files.
- OCR for scanned PDFs.
- Knowledge graphs and visual maps.
- Adaptive spaced repetition.
- Public sharing or collaboration.
- Native mobile applications.
- Browser support beyond Chrome.
- Payments and subscriptions.
- Rich-text editing.
- AI agents that browse or modify external sources.
- Analytics that capture note content.

### 4.3 Contingency cuts

If the build is behind schedule, cut in this order:

1. Remove the standalone web Review page; retain Telegram review.
2. Remove web voice recording; retain Telegram voice notes.
3. Remove AI-generated answers; retain ranked semantic-search results.
4. Remove the web dashboard; retain extension and Telegram.

Never cut:

- secure capture;
- original-text preservation;
- semantic retrieval;
- one notification channel;
- review scheduling;
- user isolation.

---

## 5. User experience specification

### 5.1 Browser highlight capture

1. User selects text on an article or readable PDF.
2. User right-clicks and selects **Save to Novah**.
3. The extension opens or updates the side panel.
4. The panel displays the untouched selection, page title and source URL.
5. The user may add personal context and change the inferred type.
6. User selects **Save note**.
7. UI immediately shows a saving state.
8. Backend enriches, embeds and saves the note.
9. UI confirms the first scheduled review date.

Acceptance:

- Capture takes two intentional interactions after text selection.
- Original text shown after saving exactly matches the selected text after whitespace normalization.
- Failure preserves the unsaved text locally and offers retry.

### 5.2 Manual and voice capture

The side panel provides:

- a text area;
- a personal-context field;
- source-title and source-URL fields;
- a record button capped at two minutes;
- a save button.

For the first release, voice recording in the extension is optional if Telegram voice capture has passed its gate.

### 5.3 Recall

The Recall tab accepts a natural-language prompt such as:

> What have I saved about making decisions under uncertainty?

The response contains:

1. a short synthesis based only on retrieved notes;
2. numbered citations that map to note IDs;
3. the underlying notes, personal context, source and capture date;
4. useful/not-useful feedback.

If retrieval confidence is weak, return possible note matches without a synthesized answer.

### 5.4 Telegram capture

Supported inputs:

- plain text;
- forwarded text;
- a URL plus a comment;
- a voice note;
- bot commands.

Example confirmation:

```text
Saved as a principle under Decision Making.
First revision: tomorrow at your review time.
```

### 5.5 Daily 9 PM digest

If at least one note was captured during the user's local day, send:

```text
What you kept today

You saved 7 ideas from 3 sources.

Recurring theme
Three notes connected uncertainty with the desire to control outcomes.

A useful connection
Your note from Seneca and your observation from today both separate imagined risk from irreversible risk.

For tomorrow
Which current decision becomes easier if you treat it as reversible?
```

Requirements:

- Every claim must be traceable to included note IDs.
- If one note exists, send that note with one reflection question; do not manufacture a recurring theme.
- If zero notes exist, send nothing.
- A digest is sent no more than once per user per local calendar date.

### 5.6 Review packet

The review begins with active recall:

```text
Before revealing the note, what do you remember from this source?
```

Actions:

- Reveal note
- Skip
- Remembered
- Partly remembered
- Missed

The fixed schedule does not change from feedback in the MVP. Feedback is stored for product evaluation and later adaptive scheduling.

---

## 6. Architecture

```mermaid
flowchart TD
    A["Chrome extension"] --> D["Supabase Edge Functions"]
    B["Telegram bot"] --> D
    C["Web dashboard"] --> D
    D --> E["Postgres and pgvector"]
    D --> F["OpenAI APIs"]
    G["Supabase Cron"] --> D
    D --> H["Telegram notifications"]
```

### 6.1 Repository structure

```text
novah/
├── apps/
│   ├── extension/
│   │   ├── entrypoints/
│   │   ├── components/
│   │   ├── lib/
│   │   └── wxt.config.ts
│   └── web/
│       ├── src/
│       └── public/
├── packages/
│   └── shared/
│       ├── src/contracts/
│       ├── src/types/
│       └── src/constants/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── functions/
│       ├── _shared/
│       ├── capture-note/
│       ├── search-notes/
│       ├── telegram-webhook/
│       └── process-notifications/
├── docs/
│   ├── privacy-policy.md
│   ├── runbook.md
│   └── test-evidence.md
├── .env.example
├── pnpm-workspace.yaml
├── package.json
└── PRODUCT_PLAN.md
```

### 6.2 Environment variables

Only names belong in `.env.example`:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
OPENAI_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
CRON_SECRET=
APP_URL=
ALLOWED_EXTENSION_IDS=
```

Rules:

- `VITE_SUPABASE_URL` and the publishable key may be present in browser bundles.
- OpenAI, Telegram, Cron and Supabase secret keys are server-only.
- Do not use a Supabase secret or service-role key in the extension or web app.
- Never log request bodies containing note content in production.

---

## 7. Data model

### 7.1 Extensions

Enable:

```sql
create extension if not exists vector with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
```

Use the Supabase-recommended schema placement if the hosted project requires a different extension schema.

### 7.2 `profiles`

| Column | Type | Rules |
| --- | --- | --- |
| `user_id` | `uuid` | Primary key; references `auth.users`; cascade delete. |
| `timezone` | `text` | Default `Asia/Kolkata`; valid IANA timezone. |
| `digest_time` | `time` | Default `21:00`. |
| `review_time` | `time` | Default `09:00`. |
| `telegram_chat_id` | `bigint` | Nullable; unique when present. |
| `created_at` | `timestamptz` | Default `now()`. |
| `updated_at` | `timestamptz` | Updated on change. |

### 7.3 `notes`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key; generated UUID. |
| `user_id` | `uuid` | Required; references profile; cascade delete. |
| `original_text` | `text` | Required; normalized whitespace; never AI-rewritten. |
| `personal_context` | `text` | Optional; maximum 2,000 characters. |
| `note_type` | enum/text check | One of the locked note types. |
| `summary` | `text` | AI metadata; maximum 500 characters. |
| `tags` | `text[]` | Maximum five normalized tags. |
| `recall_prompt` | `text` | AI-generated active-recall question. |
| `source_title` | `text` | Optional. |
| `source_url` | `text` | Optional valid HTTP(S) URL. |
| `capture_channel` | enum/text check | `extension`, `web`, `telegram_text`, `telegram_voice`. |
| `embedding` | `vector(1536)` | Generated with `text-embedding-3-small`. |
| `captured_at` | `timestamptz` | Default `now()`. |
| `created_at` | `timestamptz` | Default `now()`. |
| `updated_at` | `timestamptz` | Updated on change. |

Do not soft-delete notes in the MVP. A delete action removes the note and cascades its review events. Export exists for recovery before account deletion.

### 7.4 `review_events`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `user_id` | `uuid` | Required; indexed. |
| `note_id` | `uuid` | Required; cascade delete. |
| `stage` | `smallint` | Check between 1 and 5. |
| `due_on` | `date` | User-local review date. |
| `sent_at` | `timestamptz` | Nullable. |
| `status` | enum/text check | `pending`, `sent`, `remembered`, `partial`, `missed`, `skipped`. |
| `answered_at` | `timestamptz` | Nullable. |
| `created_at` | `timestamptz` | Default `now()`. |

Unique constraint: `(note_id, stage)`.

### 7.5 `daily_digests`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `user_id` | `uuid` | Required. |
| `digest_date` | `date` | User-local calendar date. |
| `note_ids` | `uuid[]` | Exact evidence set. |
| `content` | `jsonb` | Validated structured digest. |
| `sent_at` | `timestamptz` | Nullable. |
| `created_at` | `timestamptz` | Default `now()`. |

Unique constraint: `(user_id, digest_date)`.

### 7.6 `telegram_link_codes`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `user_id` | `uuid` | Required. |
| `code_hash` | `text` | Store only a hash of the code. |
| `expires_at` | `timestamptz` | Ten-minute expiry. |
| `consumed_at` | `timestamptz` | Nullable. |
| `created_at` | `timestamptz` | Default `now()`. |

### 7.7 `processed_telegram_updates`

| Column | Type | Rules |
| --- | --- | --- |
| `update_id` | `bigint` | Primary key; prevents duplicate processing. |
| `processed_at` | `timestamptz` | Default `now()`. |

### 7.8 Row Level Security policy contract

For every user-owned table:

- authenticated users can select their own rows;
- authenticated users can insert rows only with `user_id = auth.uid()`;
- authenticated users can update or delete only their own rows;
- anonymous access is denied;
- privileged Edge Function operations use a server-only client after performing their own authorization checks.

`processed_telegram_updates` is server-only and is not exposed to authenticated clients.

### 7.9 Vector search function

Create `match_notes(query_embedding, match_count)` as a database function that:

- derives the user from `auth.uid()` rather than accepting a trusted `user_id` argument;
- returns note ID, original text, personal context, metadata and cosine similarity;
- limits `match_count` to a safe maximum of 20;
- excludes rows without embeddings;
- never bypasses user isolation.

Add an HNSW cosine index only after basic sequential-search correctness passes. A personal library does not need premature index tuning.

---

## 8. API contracts

All contracts live as Zod schemas in `packages/shared` and are reused where runtime compatibility allows.

### 8.1 Capture note

`POST /functions/v1/capture-note`

Request:

```json
{
  "originalText": "We suffer more often in imagination than in reality.",
  "personalContext": "Separate imagined risk from irreversible risk.",
  "noteType": "quote",
  "sourceTitle": "Letters from a Stoic",
  "sourceUrl": "https://example.com/source",
  "captureChannel": "extension",
  "clientRequestId": "uuid-generated-by-client"
}
```

Response:

```json
{
  "note": {
    "id": "uuid",
    "originalText": "We suffer more often in imagination than in reality.",
    "noteType": "quote",
    "summary": "Distinguish imagined suffering from present reality.",
    "tags": ["risk", "stoicism"],
    "firstReviewDate": "2026-08-02"
  }
}
```

Requirements:

- Authentication required for web and extension requests.
- Telegram requests use an internal authenticated service path.
- `clientRequestId` is unique per user and makes retries idempotent.
- The note is inserted only after successful enrichment and embedding in the first implementation.
- If OpenAI fails, return a retryable error and preserve the client draft.

### 8.2 Search notes

`POST /functions/v1/search-notes`

Request:

```json
{
  "query": "What have I saved about making decisions under uncertainty?",
  "limit": 8
}
```

Response:

```json
{
  "answer": "Your notes repeatedly separate reversible decisions from imagined irreversible risk. [1][2]",
  "citations": [
    { "number": 1, "noteId": "uuid-1" },
    { "number": 2, "noteId": "uuid-2" }
  ],
  "matches": [
    {
      "noteId": "uuid-1",
      "originalText": "...",
      "personalContext": "...",
      "sourceTitle": "...",
      "sourceUrl": "...",
      "capturedAt": "..."
    }
  ],
  "synthesisWithheld": false
}
```

Grounding rules:

- Use only returned notes as model context.
- Do not use web search or general model knowledge.
- Every material claim needs one or more numbered note citations.
- If no result clears the tuned relevance threshold, set `answer` to `null`, set `synthesisWithheld` to `true` and return possible matches.

### 8.3 Process notifications

`POST /functions/v1/process-notifications`

- Callable only with `CRON_SECRET`.
- Finds profiles whose local time entered a scheduled 10-minute window.
- Creates or sends missing daily digests.
- Sends one grouped review packet for due events.
- Uses unique database constraints and transactional state changes to prevent duplicate sends.
- Returns counts, not note content, in operational logs.

### 8.4 Telegram webhook

`POST /functions/v1/telegram-webhook`

- Validate Telegram's configured secret header.
- Insert `update_id` before executing side effects.
- Return HTTP 200 for previously processed updates.
- Reject unknown or unlinked chat IDs except for `/start` and `/link`.
- Cap downloaded voice files and transcribed duration.
- Do not persist raw Telegram audio after transcription.

---

## 9. AI behaviour

### 9.1 Capture enrichment schema

The model returns structured data:

```json
{
  "noteType": "principle",
  "summary": "One concise sentence that preserves the note's meaning.",
  "tags": ["tag-one", "tag-two"],
  "recallPrompt": "A question that helps the user actively recall this idea."
}
```

Rules:

- Do not alter `original_text`.
- Prefer the user-selected note type over the inferred type.
- Generate two to five lowercase tags.
- Do not add facts not present in the note or personal context.
- The recall prompt should test the central idea without revealing the answer.
- Use `store: false` for text-generation calls.

### 9.2 Daily digest schema

```json
{
  "captureCount": 7,
  "sourceCount": 3,
  "themes": [
    {
      "title": "Clear thinking under uncertainty",
      "noteIds": ["uuid-1", "uuid-2"]
    }
  ],
  "connection": {
    "text": "A connection supported by at least two notes.",
    "noteIds": ["uuid-1", "uuid-3"]
  },
  "reflectionQuestion": "One bounded question for tomorrow."
}
```

When fewer than two notes exist, `connection` must be `null`.

### 9.3 Search synthesis

The model receives:

- the user query;
- retrieved note IDs;
- original text;
- personal context;
- source metadata.

The model does not receive:

- unrelated notes;
- web results;
- previous search conversations;
- hidden profile assumptions.

---

## 10. Privacy and security requirements

- [ ] All user tables have Row Level Security before client integration begins.
- [ ] The browser receives only the Supabase publishable key.
- [ ] OpenAI and Telegram calls occur only in Edge Functions.
- [ ] Responses API calls set `store: false`.
- [ ] Raw voice files are streamed or temporarily held and deleted immediately after transcription.
- [ ] Application logs exclude note text, transcription text, personal context and authorization headers.
- [ ] Telegram linking codes are random, hashed, single-use and expire after ten minutes.
- [ ] Telegram update IDs make webhook processing idempotent.
- [ ] Capture `clientRequestId` makes client retries idempotent.
- [ ] Extension permissions remain minimal.
- [ ] Allowed Origins are explicit for the web app and known extension IDs.
- [ ] Delete note removes its review events.
- [ ] Account deletion removes all owned rows.
- [ ] Export is available before account deletion.
- [ ] Privacy policy explains that Telegram bot messages pass through Telegram infrastructure.
- [ ] No third-party analytics receives personal note content.

---

## 11. Twenty-four-hour execution plan

The time boxes are limits, not invitations to expand the phase. If a phase gate fails, fix the gate or invoke a contingency cut before moving ahead.

### Phase 0 — Lock the workspace

**Time:** Hour 0–1  
**Outcome:** One installable monorepo with documented configuration and no product-code ambiguity.

#### Checklist

- [x] 0.1 Inspect the repository, current branch, existing files and uncommitted changes.
- [x] 0.2 Record existing-code conflicts under Decisions and Deviations.
- [x] 0.3 Confirm Node.js 20 or later and `pnpm` availability.
- [x] 0.4 Create the locked repository structure without duplicating existing applications.
- [x] 0.5 Configure the root `pnpm` workspace.
- [x] 0.6 Scaffold `apps/web` with React, TypeScript and Vite.
- [ ] 0.7 Scaffold `apps/extension` with WXT, React and TypeScript.
- [ ] 0.8 Create `packages/shared` with exported constants and placeholder Zod schemas.
- [ ] 0.9 Add root formatting, linting and type-check commands.
- [ ] 0.10 Add `.env.example` and confirm real `.env` files are ignored.
- [ ] 0.11 Add `docs/runbook.md` and `docs/test-evidence.md` placeholders.

#### Verification

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm --filter web build
pnpm --filter extension build
```

#### Phase gate

- Both applications build.
- No secret value appears in tracked files.
- The workspace has one lockfile.
- Existing user work remains intact.

#### Proposed commit message

```text
chore: scaffold novah workspace
```

---

### Phase 1 — Establish the secure data foundation

**Time:** Hours 1–3  
**Outcome:** Hosted Supabase schema, isolation policies and typed contracts exist before feature code.

#### Manual prerequisite

Sneha creates or selects the Supabase project and authenticates the Supabase Command Line Interface. Codex must not ask for secret values in chat.

#### Checklist

- [ ] 1.1 Initialize the `supabase` directory if it does not exist.
- [ ] 1.2 Create the extension-enabling migration.
- [ ] 1.3 Create enums or checked text fields for note, channel and review statuses.
- [ ] 1.4 Create `profiles`, `notes`, `review_events`, `daily_digests`, `telegram_link_codes` and `processed_telegram_updates`.
- [ ] 1.5 Add foreign keys, cascades, unique constraints and indexes.
- [ ] 1.6 Create the automatic profile-on-sign-up trigger.
- [ ] 1.7 Enable Row Level Security and add ownership policies.
- [ ] 1.8 Create `match_notes` with caller-derived identity.
- [ ] 1.9 Add capture idempotency using `(user_id, client_request_id)`.
- [ ] 1.10 Add minimal seed data for a dedicated test user without committing credentials.
- [ ] 1.11 Push the migration to the selected project after Sneha approves the remote write.
- [ ] 1.12 Generate TypeScript database types and place them in `packages/shared`.

#### Verification

- Sign in as test user A and insert/select/update/delete user A's note.
- Sign in as test user B and prove user A's note returns zero rows.
- Call `match_notes` as each user and prove it cannot return the other user's rows.
- Attempt anonymous access and prove it is rejected.
- Store evidence without note content in `docs/test-evidence.md`.

#### Phase gate

- All isolation tests pass.
- A failed isolation test blocks all client development.
- Generated database types compile.

#### Proposed commit message

```text
feat: add secure knowledge and review schema
```

---

### Phase 2 — Implement capture and semantic recall

**Time:** Hours 3–6  
**Outcome:** Authenticated text can be enriched, embedded, stored and retrieved by meaning.

#### Checklist

- [ ] 2.1 Finalize shared capture and search Zod contracts.
- [ ] 2.2 Create shared Edge Function helpers for CORS, authentication, errors and OpenAI calls.
- [ ] 2.3 Implement `capture-note` input validation and authentication.
- [ ] 2.4 Implement Structured Output enrichment.
- [ ] 2.5 Generate the `text-embedding-3-small` embedding.
- [ ] 2.6 Insert the note and five review events atomically or with compensating cleanup.
- [ ] 2.7 Enforce capture idempotency.
- [ ] 2.8 Implement `search-notes` query embedding and `match_notes` call.
- [ ] 2.9 Implement grounded synthesis with numbered note citations.
- [ ] 2.10 Withhold synthesis when retrieval is weak.
- [ ] 2.11 Add unit tests for validation, enrichment parsing and citation mapping.
- [ ] 2.12 Deploy both functions after Sneha approves the remote write.

#### Verification cases

1. Save one quote and confirm original text is unchanged.
2. Confirm summary, tags and recall prompt are stored separately.
3. Retry the same `clientRequestId` and confirm only one note exists.
4. Search a paraphrase and confirm the expected note is in the top five.
5. Search an unrelated query and confirm synthesis is withheld.
6. Attempt cross-user search and confirm no leakage.
7. Simulate OpenAI failure and confirm no partial note or review rows remain.

#### Phase gate

- Capture and search work through deployed function endpoints.
- Grounded citations map to actual returned note IDs.
- Original note preservation test passes.

#### Proposed commit message

```text
feat: add note enrichment and semantic recall
```

---

### Phase 3 — Build the Chrome extension

**Time:** Hours 6–9  
**Outcome:** A user can authenticate, save selected text and search their notes without leaving the page.

#### Checklist

- [ ] 3.1 Configure Manifest V3, side-panel and minimal permissions.
- [ ] 3.2 Implement extension authentication and session persistence.
- [ ] 3.3 Register the **Save to Novah** selection context menu.
- [ ] 3.4 Capture selection text, page title and page URL.
- [ ] 3.5 Open or focus the side panel after the context-menu action.
- [ ] 3.6 Build Capture and Recall tabs.
- [ ] 3.7 Add personal context, note type, source fields and validation.
- [ ] 3.8 Preserve failed capture drafts in extension storage.
- [ ] 3.9 Add saving, success, retry, signed-out and empty states.
- [ ] 3.10 Display ranked search matches and citation-linked synthesis.
- [ ] 3.11 Test the production build as an unpacked extension.

#### Required extension permissions

Start with:

```json
{
  "permissions": ["contextMenus", "sidePanel", "storage", "activeTab"]
}
```

Add a host permission only for the Supabase project endpoint if required. Do not request `<all_urls>`.

#### Manual verification matrix

| Case | Expected result |
| --- | --- |
| Standard article selection | Text, title and URL appear in panel. |
| Chrome PDF text selection | Selection is captured or manual-paste fallback is clearly offered. |
| Page without selection | Context-menu action is not shown. |
| Signed-out user | Draft remains while sign-in is requested. |
| Network failure | Draft remains and retry succeeds. |
| Duplicate click | One note is created. |
| Natural-language recall | Ranked matching notes appear. |

#### Phase gate

- The unpacked production build passes the matrix.
- No OpenAI or privileged Supabase key exists in built extension assets.
- Browser permissions match the locked list or an approved deviation.

#### Proposed commit message

```text
feat: add browser capture and recall extension
```

---

### Phase 4 — Connect Telegram text and voice capture

**Time:** Hours 9–12  
**Outcome:** A linked Telegram user can capture text and voice into the same secured library.

#### Manual prerequisites

- Sneha creates the bot through BotFather.
- Sneha stores the token in Supabase Function secrets without pasting it into chat.
- A deployed webhook URL exists.

#### Checklist

- [ ] 4.1 Implement secure one-time link-code generation in Settings.
- [ ] 4.2 Implement `/start` and `/link CODE`.
- [ ] 4.3 Validate, consume and expire link codes.
- [ ] 4.4 Validate Telegram webhook secret headers.
- [ ] 4.5 Deduplicate webhook updates with `update_id`.
- [ ] 4.6 Map linked chat IDs to application users.
- [ ] 4.7 Route plain and forwarded text through the capture service.
- [ ] 4.8 Implement `/search QUERY` through the search service.
- [ ] 4.9 Implement `/today`, `/review` and `/settings` responses.
- [ ] 4.10 Download bounded voice messages.
- [ ] 4.11 Transcribe with `gpt-transcribe` and discard raw audio.
- [ ] 4.12 Send capture confirmation without echoing sensitive content unnecessarily.
- [ ] 4.13 Set the live webhook only after Sneha approves the external action.

#### Verification cases

- Invalid and expired link codes fail.
- A valid code links exactly one chat.
- Text capture creates a `telegram_text` note.
- Replayed webhook payload creates no duplicate.
- Voice capture creates a `telegram_voice` note and no durable raw-audio object.
- An unlinked chat cannot search another user's notes.
- `/search` results cite the user's actual notes.

#### Phase gate

- Text, voice and search pass end to end.
- Webhook replay is idempotent.
- Unknown chat IDs remain isolated.

#### Proposed commit message

```text
feat: add telegram capture and recall
```

---

### Phase 5 — Deliver digests and spaced reviews

**Time:** Hours 12–15  
**Outcome:** Notes return automatically at the correct local-day schedule without duplicate notifications.

#### Checklist

- [ ] 5.1 Implement timezone-aware 10-minute schedule-window selection.
- [ ] 5.2 Implement daily-note selection by the user's local calendar date.
- [ ] 5.3 Generate a validated digest from exact note evidence.
- [ ] 5.4 Handle zero-note and one-note days without hallucinated themes.
- [ ] 5.5 Persist digests before delivery.
- [ ] 5.6 Send at most one digest per user per local date.
- [ ] 5.7 Select due review events for the user's local review date.
- [ ] 5.8 Group due events into one review packet.
- [ ] 5.9 Implement reveal, skip and recall-quality callbacks.
- [ ] 5.10 Make sends safe against Cron retries and concurrent invocations.
- [ ] 5.11 Create the Supabase Cron job after Sneha approves the remote write.

#### Verification cases

1. Simulate `Asia/Kolkata`, UTC and one daylight-saving timezone.
2. Run the same schedule window twice and confirm one digest.
3. Run concurrent notification processors and confirm one delivery.
4. Confirm zero-note day sends nothing.
5. Confirm one-note day contains no false recurring theme.
6. Confirm review dates are 1, 2, 3, 7 and 21 local calendar days after capture.
7. Confirm callback feedback updates the correct event only.

#### Phase gate

- Timezone and idempotency tests pass.
- Digest evidence maps only to notes from the requested local date.
- Five review stages exist exactly once per note.

#### Proposed commit message

```text
feat: add daily digest and spaced review delivery
```

---

### Phase 6 — Build the web dashboard

**Time:** Hours 15–18  
**Outcome:** A user can inspect, search, delete and export their library and manage delivery settings.

#### Checklist

- [ ] 6.1 Add authenticated routing.
- [ ] 6.2 Build Today with today's notes and stored digest.
- [ ] 6.3 Build Library with search, type filter and pagination.
- [ ] 6.4 Build Review with due and completed states.
- [ ] 6.5 Build Settings for timezone, digest time and review time.
- [ ] 6.6 Add Telegram link-code generation and connection status.
- [ ] 6.7 Add note deletion with confirmation.
- [ ] 6.8 Add JSON and Markdown export.
- [ ] 6.9 Add account deletion with confirmation and reauthentication if supported.
- [ ] 6.10 Add responsive empty, loading and error states.
- [ ] 6.11 Add the privacy policy route.

#### Phase gate

- A user can complete every page's primary action.
- Cross-user isolation remains intact in browser-network tests.
- Export opens as valid JSON and readable Markdown.
- Delete actions affect only owned records.

#### Proposed commit message

```text
feat: add personal knowledge dashboard
```

---

### Phase 7 — Harden and evaluate

**Time:** Hours 18–21  
**Outcome:** The private beta fails safely and has evidence for its central retrieval claim.

#### Checklist

- [ ] 7.1 Search the repository and build outputs for committed secrets.
- [ ] 7.2 Verify every Edge Function authorization path.
- [ ] 7.3 Verify CORS allowlists.
- [ ] 7.4 Add request-size, note-length, URL and voice-duration limits.
- [ ] 7.5 Add timeout and retry behaviour for OpenAI and Telegram calls.
- [ ] 7.6 Confirm production logs omit content and authorization data.
- [ ] 7.7 Create 30 retrieval-evaluation queries with expected note IDs.
- [ ] 7.8 Measure top-five hit rate and record failures.
- [ ] 7.9 Test duplicate capture, duplicate webhook and duplicate Cron execution.
- [ ] 7.10 Test export, note deletion and account deletion.
- [ ] 7.11 Complete the privacy policy and runbook.
- [ ] 7.12 Record evidence in `docs/test-evidence.md`.

#### Retrieval target

Initial top-five hit rate: **80% or higher** on the 30-query private evaluation set.

Do not tune only the similarity threshold to hide failures. Record whether failures come from note wording, embedding quality, query ambiguity or incorrect expected matches.

#### Phase gate

- All must-not-fail security tests pass.
- Retrieval target passes or the miss taxonomy is documented with synthesis disabled for weak cases.
- Runbook contains recovery steps for failed capture, Telegram outage and duplicate-job suspicion.

#### Proposed commit message

```text
test: harden private beta and add retrieval evaluation
```

---

### Phase 8 — Deploy the private beta

**Time:** Hours 21–23  
**Outcome:** The production URLs and background functions operate with production configuration.

#### Checklist

- [ ] 8.1 Confirm production environment-variable names and secret placement.
- [ ] 8.2 Deploy Supabase migrations after Sneha approves.
- [ ] 8.3 Deploy all Edge Functions after Sneha approves.
- [ ] 8.4 Configure the Cron job and inspect its first run.
- [ ] 8.5 Deploy the web app to Vercel after Sneha approves.
- [ ] 8.6 Configure production web and extension origins.
- [ ] 8.7 Set the Telegram webhook after Sneha approves.
- [ ] 8.8 Create a fresh production test account.
- [ ] 8.9 Run the production smoke-test journey.
- [ ] 8.10 Record rollback commands and deployed identifiers in the private runbook, never in public documentation if sensitive.

#### Production smoke-test journey

1. Create account.
2. Sign into web and extension.
3. Save an article highlight.
4. Save a manual note.
5. Link Telegram.
6. Save Telegram text and voice notes.
7. Search from extension and Telegram.
8. Temporarily schedule a digest test window and receive exactly one message.
9. Trigger a review packet and submit feedback.
10. Export notes.
11. Delete the test notes and account.

#### Phase gate

- Every smoke-test step has evidence.
- No real user data was used for testing.
- Rollback path is documented.

#### Proposed commit message

```text
chore: prepare private beta deployment
```

---

### Phase 9 — Package and prepare distribution

**Time:** Hours 23–24  
**Outcome:** A testable extension package and complete Chrome Web Store submission bundle exist.

#### Checklist

- [ ] 9.1 Build the extension in production mode.
- [ ] 9.2 Inspect the packaged manifest and permissions.
- [ ] 9.3 Inspect built assets for secrets and remote executable code.
- [ ] 9.4 Create 16, 32, 48 and 128 pixel icons.
- [ ] 9.5 Create store screenshots and concise listing copy.
- [ ] 9.6 Confirm the public privacy-policy URL works.
- [ ] 9.7 Create the extension ZIP.
- [ ] 9.8 Test the ZIP as an unpacked extension on a clean Chrome profile.
- [ ] 9.9 Prepare submission answers for data collection and permission justification.
- [ ] 9.10 Submit only after Sneha explicitly approves the external action.

#### Important delivery boundary

The extension can be packaged and submitted within 24 hours. Chrome Web Store approval is not part of the 24-hour definition of done. Private testers use the unpacked ZIP until approval.

#### Phase gate

- Clean-profile tests pass.
- Store disclosure matches actual data behaviour.
- Requested permissions have written justifications.

#### Proposed commit message

```text
chore: package chrome private beta
```

---

## 12. Progress tracker

| Phase | Status | Gate evidence | Blocker |
| --- | --- | --- | --- |
| 0. Workspace | Not started | — | — |
| 1. Data foundation | Not started | — | — |
| 2. Capture and recall | Not started | — | — |
| 3. Chrome extension | Not started | — | — |
| 4. Telegram | Not started | — | — |
| 5. Digest and reviews | Not started | — | — |
| 6. Web dashboard | Not started | — | — |
| 7. Hardening | Not started | — | — |
| 8. Deployment | Not started | — | — |
| 9. Distribution | Not started | — | — |

Allowed status values:

```text
Not started
In progress
Blocked
Complete
Cut by approved contingency
```

---

## 13. Definition of done

The private beta is done only when:

- [ ] Selected text can be saved from a normal article in two intentional interactions.
- [ ] PDF selection works or a clear manual-paste fallback is present.
- [ ] Original note text remains unchanged after enrichment.
- [ ] A natural-language paraphrase retrieves the expected note in the top five.
- [ ] Weak retrieval does not produce an unsupported synthesized answer.
- [ ] Search synthesis cites actual note IDs.
- [ ] User A cannot read, search, update or delete user B's notes.
- [ ] Telegram text and voice appear in the same library.
- [ ] Raw voice audio is not durably retained.
- [ ] A daily digest is sent once or not at all for a local date.
- [ ] Every note receives exactly five review stages.
- [ ] Webhook and Cron retries do not duplicate notes or messages.
- [ ] Export and deletion work.
- [ ] No privileged secret appears in source control or browser bundles.
- [ ] Production smoke tests pass using a dummy account.
- [ ] The extension ZIP works on a clean Chrome profile.
- [ ] Private testers have installation and feedback instructions.

---

## 14. Product validation after shipping

The first beta must answer:

1. Do users save at least five notes in their first three days?
2. Do retrieved notes feel meaningfully relevant?
3. Does the 9 PM digest create a useful connection rather than another summary?
4. Do users complete review packets without notification fatigue?
5. Does an old note return at a moment when it changes a decision, action or interpretation?

Track:

- first-five-notes activation rate;
- captures per active week;
- search-result usefulness rate;
- percentage of searches where synthesis is withheld;
- digest delivery and response rate;
- review completion rate;
- remembered, partial and missed distribution;
- day-seven retention.

Do not use total notes stored as the primary success metric. Storage is an input. Useful return and integration are the outcomes.

---

## 15. Post-MVP backlog

This list is deliberately unordered and must not enter the 24-hour build:

- WhatsApp Cloud API adapter.
- Full PDF annotation extraction.
- Kindle and Readwise imports.
- Import from Notion and Obsidian.
- Hybrid keyword and vector ranking.
- Adaptive spaced repetition based on recall feedback.
- Note connections and knowledge graph.
- Mobile capture applications.
- End-to-end encrypted local-first mode.
- Shared or public collections.
- Browser support for Firefox, Safari and Edge.
- Billing and subscription management.

---

## 16. Decisions and deviations

Add only approved changes here.

| Date | Decision or deviation | Evidence | Approved by | Consequence |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |
| 2026-08-01 | Resolved workspace conflict, not a product deviation: Item 0.2 verification found Git root `/Users/snehaprajapati/Downloads/novah`, branch `main`, initial commit `d3c5fc0` and no configured remote. | Sneha — documentation only | The repository-boundary blocker is resolved. Item 0.2 makes no Git configuration or scaffolding changes; remote setup remains outside this item. |

---

## 17. Execution Log

Codex appends one concise row after each verified checklist item or phase gate.

| Timestamp | Item | Files changed | Verification evidence | Result or blocker |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |
| 2026-08-01 14:33 IST | 0.2 Record existing-code conflicts | `PRODUCT_PLAN.md` | Recorded the item 0.1 parent-repository conflict and verified its pre-existing resolution: current Git root is `novah`, branch is `main`, initial commit is `d3c5fc0` and no remote is configured. | Complete: resolved workspace conflict documented; no Git configuration, scaffolding or other implementation performed. |
| 2026-08-01 14:40 IST | 0.1 Inspect the repository, current branch, existing files and uncommitted changes | `PRODUCT_PLAN.md` | Confirmed independent Git root `/Users/snehaprajapati/Downloads/novah`, branch `main`, initial commit `d3c5fc0`, no configured remote and only `PRODUCT_PLAN.md` in the workspace; the prior 0.2 update was staged with no unstaged changes before 0.1. | Complete: current repository state documented; no Git configuration, staging, installation, scaffolding or item 0.3 work performed. |
| 2026-08-01 14:43 IST | 0.3 Confirm Node.js 20 or later and `pnpm` availability | `PRODUCT_PLAN.md` | `node --version` returned `v22.23.1`, the explicit Node-major check returned `true`, and `pnpm --version` returned `10.33.2`; both executables were found and all commands exited successfully. | Complete: required Node.js and pnpm tooling is available; no installation or workspace setup performed. |
| 2026-08-01 14:47 IST | 0.4 Create the locked repository structure without duplicating existing applications | `PRODUCT_PLAN.md` | Confirmed no application directories existed, then created the locked empty directory groups under `apps`, `packages/shared`, `supabase` and `docs`; verified every required directory exists and contains no scaffold or placeholder files. | Complete: directory skeleton created without duplicating applications; no package installation, scaffolding or external action performed. |
| 2026-08-01 14:49 IST | 0.5 Configure the root `pnpm` workspace | `package.json`, `pnpm-workspace.yaml`, `PRODUCT_PLAN.md` | Parsed the private root manifest successfully; `pnpm list --recursive --depth -1` recognized `novah@0.0.0`; workspace globs cover `apps/*` and `packages/*`; `pnpm-lock.yaml` remains absent. | Complete: root pnpm workspace configured without installing packages or starting application scaffolds. |
| 2026-08-01 15:03 IST | 0.6 Scaffold `apps/web` with React, TypeScript and Vite | `apps/web/**`, `.gitignore`, `pnpm-lock.yaml`, `PRODUCT_PLAN.md` | Official Vite scaffold created `web@0.0.0` with React `19.2.8`, TypeScript `6.0.2` and Vite `8.2.0`; Tailwind `4.3.3` compiles through `@tailwindcss/vite`; `pnpm --filter web lint` and `pnpm --filter web build` passed; exactly one lockfile exists. | Complete: web scaffold builds successfully; extension, shared package, Supabase and docs remain untouched. |

---

## 18. Final handoff format for Codex

At the end of every phase, Codex reports:

```text
Phase:
Outcome:
Completed checklist items:
Changed files:
Verification commands and results:
Security or product risks found:
Approved deviations used:
Remaining blockers:
Next incomplete checklist item:
Proposed commit message:
```

The goal is not to make the repository look complete. The goal is to keep every layer traceable: product requirement to implementation, implementation to verification, scheduled behaviour to delivery evidence, and retrieved knowledge back to the user's original note.
