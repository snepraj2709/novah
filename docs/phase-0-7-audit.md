# Phase 0–7 completion audit

> Audited: 2026-08-02
> Scope: `PRODUCT_PLAN.md` Phases 0 through 7 only
> Result: current local implementation and the bounded hosted hardening rollout pass.

This matrix separates current local proof from earlier hosted or manual evidence. A
historical pass is not treated as proof that the latest unhosted code is deployed.

| Phase                   | Requirement coverage                                                                                              | Current authoritative evidence                                                                                                                                                                                                                                               | Result                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 0 — Workspace           | Items 0.1–0.11 and the workspace gate                                                                             | Root workspace scripts, one tracked `pnpm-lock.yaml`, ignored real environment files, recursive type-check/lint/format, and both production builds                                                                                                                           | Pass                                                          |
| 1 — Data foundation     | Items 1.1–1.12, RLS, ownership, schema constraints, profile trigger, caller-scoped search, types                  | Clean migration replay, warning-free database lint, and the Phase 1 portion of 107 pgTAP assertions; hosted isolation and migration evidence remains recorded in `docs/test-evidence.md`                                                                                     | Pass locally and for the previously hosted Phase 1 bundle     |
| 2 — Capture and recall  | Items 2.1–2.12, original-text preservation, atomic capture, idempotency, grounded search, weak-result withholding | Shared Zod contracts, authenticated function handlers, atomic-capture SQL, deterministic function tests, database tests, and the recorded hosted endpoint journey                                                                                                            | Pass locally and for the previously hosted Phase 2 bundle     |
| 3 — Chrome extension    | Items 3.1–3.11, minimal permissions, auth persistence, capture drafts, recall and citations                       | Ten extension tests, recursive type-check, production WXT build, emitted-manifest and built-asset security scan; the earlier clean-profile browser matrix is recorded in `docs/test-evidence.md`                                                                             | Pass; current code regressions are covered by tests and build |
| 4 — Telegram            | Items 4.1–4.13, signed webhook, linking, replay safety, commands, text/voice capture and no durable audio         | Telegram handler tests, pgTAP linking tests, strict request limits, in-memory audio clearing, and recorded hosted/live Telegram evidence with cleanup                                                                                                                        | Pass locally and for the previously hosted Phase 4 bundle     |
| 5 — Digests and reviews | Items 5.1–5.11, local-day scheduling, evidence grounding, idempotency, callbacks and Cron                         | Notification tests across UTC, Asia/Kolkata and daylight-saving transitions; database claim/deduplication tests; bounded profile and review work; oversized-evidence fallback; recorded hosted Cron/live delivery evidence                                                   | Pass locally and hosted                                       |
| 6 — Web dashboard       | Items 6.1–6.11, auth routing, all pages, export and deletion                                                      | Four web tests, production build, current Incognito sign-in and page matrix, current local cross-user network verifier, and local plus hosted Edge HTTP account-deletion journeys proving gateway denial, strict CORS, recent password auth, caller-only cascade and cleanup | Pass locally, visually, and for hosted deletion               |
| 7 — Hardening           | Items 7.1–7.12 and the security/retrieval gate                                                                    | 59 function tests, 107 pgTAP assertions, repository/build/history secret scan, six authorization-boundary checks, retrieval-fixture validation, recorded 30/30 live retrieval result, current dependency audit, migration parity and zero-provider hosted audit              | Pass locally and hosted                                       |

## Edge-case coverage

| Risk area                    | Direct proof                                                                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-user access            | RLS pgTAP tests, hosted Phase 1 verifier evidence, current two-user local network and account-deletion journeys                                                                                                             |
| Retry and concurrency        | Capture idempotency, webhook update claims, digest uniqueness, row-lock review claims, immediate Cron retry and concurrent processor tests                                                                                  |
| Size and resource exhaustion | JSON and Telegram body limits, note/source limits at Zod and database boundaries, bounded voice download, provider timeouts, paginated collections, bounded profile concurrency and deterministic oversized-digest fallback |
| Timezones                    | UTC, Asia/Kolkata, daylight-saving fall-back, spring-forward gap and midnight-crossing tests                                                                                                                                |
| Data loss                    | Atomic note/review insertion, failed-capture draft retention without silent eviction, export validation, note cascade and account cascade tests                                                                             |
| Untrusted input              | Strict Zod schemas, HTTP-only source URLs, normalized tags, hash-format checks, exact CORS origins and client-supplied account-ID rejection                                                                                 |
| Provider failure             | Safe OpenAI retry, at-most-once Telegram sends after uncertain failure, explicit rate-limit retry and failure-state persistence checks                                                                                      |
| Secrets and privacy          | Browser bundles use only public Supabase configuration; repository/history/build scan; no production content logging; `store: false`; no durable voice path; explicit Telegram disclosure                                   |

## Current limitations

- The extension's full unpacked-browser matrix was not repeated in this audit;
  its earlier clean-profile matrix remains recorded separately and the current
  extension changes pass focused tests, type-checking, security scans and the
  production build. The web application received a fresh isolated Incognito pass.
- Vite reports one non-failing chunk-size warning for the web bundle. It does not
  contradict any Phase 0–7 gate, but code splitting remains a performance option.

## Current gate results

```text
Database migration replay: pass
Database lint: pass, no findings
Database tests: 107 pass
Edge Function tests: 59 pass
Extension tests: 10 pass
Web tests: 4 pass
Type-check: pass
Lint: pass with warnings denied
Formatting: pass
Web production build: pass (one chunk-size warning)
Extension production build: pass
Security/history/build scan: pass
Retrieval fixture: 15 notes and 30 valid queries
Production dependency audit: no known vulnerabilities
Local account-deletion HTTP journey: pass and fixtures cleaned
Hosted migration and delete-account parity: pass
Hosted hardening audit: pass, zero OpenAI calls, zero Telegram messages, fixtures cleaned
Fresh web visual matrix: pass in Chrome Incognito; fixtures and window cleaned
```
