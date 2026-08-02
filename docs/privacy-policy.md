# Novah Privacy Policy

Effective 2 August 2026

Novah is a private-beta personal knowledge tool. This policy explains what the
beta stores, why it processes that information, which services receive it, and
how a participant can control it.

## Information Novah processes

Novah stores account identifiers and settings; saved note text and optional
personal context; source titles and URLs; generated summaries, tags, recall
prompts and embeddings; digests and review history; Telegram linkage and
delivery settings; and minimum operational metadata needed to run the service.
Raw Telegram voice audio is held in memory only long enough to enforce limits
and transcribe it and is not persisted by Novah.

## Purposes and providers

Novah processes information to authenticate participants, save and retrieve
their notes, generate requested note metadata and grounded answers, schedule
reviews and digests, deliver Telegram interactions, and secure and operate the
beta. Supabase provides authentication, database and Edge Function
infrastructure. OpenAI provides embeddings, enrichment, grounded synthesis,
digest generation and transcription. Telegram transports bot messages and voice
files. The web host serves the dashboard once it is deployed.

Only the data needed for a requested feature is sent to a provider. Text
generation requests use `store: false`. Novah does not use web search to answer
library questions, sell personal data, serve advertising, or send note content
to third-party analytics.

## Retention and deletion

Novah retains user-owned records until the participant deletes a note or their
account. Note deletion also removes its scheduled review events. Account
deletion removes the account's Novah records through database cascades. Limited
security, billing or request metadata may remain for a provider's own retention
period and legal obligations; Novah does not control those provider systems.

Participants can export their library as JSON or Markdown, delete individual
notes, unlink Telegram by deleting the account, or permanently delete the
account in Settings. Export before account deletion if a copy is needed. A beta
participant can contact the beta operator through the invitation channel for
help with access or deletion.

## Security

Row Level Security scopes user-owned records to the authenticated account.
Privileged keys stay in server-side functions. Browser origins use explicit
allowlists. Telegram webhooks and scheduled jobs use separate signed secrets.
Link codes are random, hashed, single-use and expire after ten minutes. Request,
note, URL and voice limits reduce accidental and malicious overuse. Application
logs omit note content, transcriptions, authorization headers and secret values.

No system can guarantee absolute security. Participants should avoid saving
information they do not want processed by the providers above and should report
suspected account compromise through the beta invitation channel.

## Changes

The policy may change as the private beta evolves. A material change will be
communicated through the beta channel and reflected by a new effective date.
