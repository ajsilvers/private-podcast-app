# Programming schedule and Sol-class handoff

Prepared 17 September 2026. Status: **planned, not started**. Target: `/Users/main/Work/code/private-podcast`, with scoped integration changes in `donebythree-site` and `ajsilvers-site`. Read [REVIEW-2026-09-17.md](REVIEW-2026-09-17.md) first, then [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md). These plans supersede conflicting archive instructions.

## Execution approach

Use one Sol-class implementation agent in bounded sequential sessions. Do not re-scaffold or import the Claude archive. Each task ends with a reviewable diff, verification evidence, unresolved issues, and a short update to this task table. No task is complete merely because files compile. Preserve unrelated working-tree changes. No automatic commits, pushes, deployments, paid provisioning or real emails are authorized by this planning package.

Estimates are engineering effort ranges for planning, not elapsed agent-runtime promises. Allow **44–67 focused hours (roughly 6–9 working days)** for implementation, tests and staging acceptance, plus **3–5 hours** for authorized production activation and first checks. DNS/sender approval, missing content, account access and user acceptance can extend calendar time. The archive's 11–15-hour estimate covered initial MVP construction and is not a reliable estimate for completing these integrations.

| Order | Task | Estimate | Depends on | Deliverable and exit gate | Status |
| --- | --- | --- | --- | --- | --- |
| 0 | Confirm configuration and baseline | 2–3h | None | Inventory and launch map; reproducible checks; no secret output | Not started |
| 1 | Production foundation and test harness | 4–6h | 0 | Clean install/build, fail-closed config/auth, isolated tests | Not started |
| 2 | Feed correctness and publication invariants | 6–9h | 1 | Deterministic drip/binge, valid RSS, stable sequencing, verified publication flow | Not started |
| 3 | Enrollment API and transactional persistence | 6–9h | 1; task 2 contract | Auth-scoped endpoint, deduplication, migration and concurrency tests | Not started |
| 4 | Reliable access-email delivery | 6–9h | 3 | Outbox worker, provider callback, retry/reconciliation tooling | Not started |
| 5 | Done by Three integration | 5–8h | 2–4 | Explicit form mapping, durable handoff/replay, corrected feed destination | Not started |
| 6 | AJ Silvers integration | 5–8h | 3–5 | Durable capture and matching podcast path; scoped Bento migration | Not started |
| 7 | Staging deployment and acceptance | 7–10h | 1–6 | Recorded full matrix, real inbox/client tests, recovery rehearsal | Not started |
| 8 | Documentation and implementation handoff | 3–5h | 7 or clearly recorded external blockers | Updated runbook, evidence and exact remaining activation steps | Not started |
| 9 | Authorized production activation | 3–5h plus observation | 7–8 and external authorization | One-offer rollout, then second; monitored live evidence | Not started |

Suggested session schedule: day 1 tasks 0–1; days 2–3 tasks 2–3; day 4 task 4; days 5–6 tasks 5–6; days 7–9 staging, fixes and handoff. Re-estimate after task 0; account access work may proceed separately without blocking local fixture-based coding. Do not spawn agents merely because this schedule names separate tasks.

## Task packets

### 0. Baseline and launch configuration

Read applicable AGENTS.md chains and the existing Graft graph before source exploration. Record Git status/HEAD in all three repos. Current podcast baseline: HEAD `dd1b72a`, modified AGENTS.md/README.md, untracked CLAUDE.md; verify again at execution. Read actual Node/package versions. Run a clean build in an isolated checkout/test environment; do not point test/migration commands at the unknown local `.env` database.

Fill launch config: form IDs, shows, mode/interval, confirmed elapsed-time timing rule, domain, owner ID, sender identity, provider accounts, content locations and budget approval state. Inspect DB migration lineage and existing normalized-email collisions only when database access is authorized; first use an isolated fixture DB. Identify any live static-feed subscribers before retiring URLs. Confirm which secrets exist by name/presence without printing values. Current site/account records are not proof of active infrastructure.

**Pass:** fixture config allows local work; actual launch unknowns are explicitly disabled or recorded. Do not wait for every live value before implementing independent work.

### 1. Safe runtime and meaningful checks

Likely files: `package.json`, lockfile, `prisma.config.ts`, `src/lib/db.ts`, `src/lib/auth.ts`, middleware, dashboard data readers, `.env.example`, ESLint configuration; new focused tests/config as needed.

Add explicit Prisma generation and runtime pinning; verify dependencies/advisories and make only necessary compatible updates. Fail closed on missing/placeholder production auth and malformed URLs. Ensure secrets are server-only. Add shared authorization at data access points; reject forged cookies and invalid API credentials. Rate-limit login and document appropriate shared/platform state. Bound PostgreSQL pool/connections/timeouts. Separate migration and runtime connection configuration.

Fix current lint errors: exclude unrelated harness helper files appropriately and use Next Link in dashboard navigation. Do not globally suppress meaningful application lint rules. Add a lightweight test runner, parser validation and isolated PostgreSQL integration test setup; do not mock away transaction/uniqueness behavior being tested.

**Pass:** clean install, Prisma generation, typecheck, lint and production build in isolated environment; tests prove missing production session secret cannot fall back to a known value and unauthorized data reads fail. Record build environment and what was not exercised.

### 2. Feeds and publishing

Likely files: `src/lib/feed-generator.ts`, feed route, show/episode create/update/delete routes, episode/show forms, schema and migration for `publishedAt`; minimal bulk-publish action if required.

Implement the timing/publication contract in the plan. Validate PATCH schemas while preserving omitted values. Make pubDates stable, escape all XML content correctly, restrict launch audio to MP3, enforce media metadata and serial presentation. Lock show cadence and episode sequencing after enrollment; permit append/unpublish. Make analytics best effort and support HEAD/no-store responses.

**Pass:** parser-valid XML and explicit UTC/DST/boundary tests; no future binge dates; edits/publishing unrelated episodes do not rewrite existing GUIDs/dates. A binge course exposes every published episode in one feed request; drafts remain hidden. Bulk publication is validated and atomic if included.

### 3. Enrollment and data integrity

Likely files: `prisma/schema.prisma`, additive migrations, new `src/lib/enrollment.ts`, integration-config/auth modules, `src/app/api/v1/enrollments/route.ts`, existing subscriber routes.

Implement integration-scoped form mappings, request validation, normalized subscriber service, immutable start/token on replay, event receipts with payload hashes and atomic email-job creation. Persist mapping version for historical retries. Validate User/show association even for configured mappings. Missing mappings stay disabled. Harden existing API without changing provision-only callers into email senders. Remove automatic reactivation on retry.

**Pass:** concurrent requests against real test PostgreSQL converge on one subscriber and initial delivery job; conflict/replay paths behave as specified. A transaction failure cannot acknowledge success. Revoked enrollment remains revoked after old/new event replay. Migration rehearsed with representative existing records and documented collision handling.

### 4. Access email and recovery

Likely files: new delivery service/provider adapter, protected cron route, signed provider callback route, `vercel.json`, minimal admin status/retry surface and tests.

Implement durable leases, immutable email payload, stable provider idempotency keys, bounded attempts and redacted diagnostics. Add accepted/delivered/bounced/failed/unknown distinction, callback authentication/deduplication and timeout reconciliation. Verify current Resend signing/idempotency API using official documentation during implementation. Enforce the provider deduplication window; quarantine ambiguous old sends. Record worker heartbeat and unresolved-job age. Add a safe operator resend/retry process and tests; no public email-based feed lookup.

**Pass:** fault injection covers crash before send, after provider acceptance but before persistence, concurrent sweeps, revoked-before-send and >24h ambiguity. Check subscriber remains active immediately before delivering a job; cancel unsent jobs on revocation. No external email is sent by local tests. Authorized staging proves actual provider acceptance and callback handling.

### 5. Done by Three first

Files: `netlify/functions/subscribe.mjs`, `_capture.mjs`, `scripts/replay-optins.mjs`, new bounded scheduled replay function, `AudioSeriesOptin.astro`, `OptinForm.astro`, `/feed` route and relevant podcast data/static-feed handling.

Introduce explicit podcast form ID while preserving attribution. Extend durable records with per-operation status and stable UUID/capture time; call app with server key and timeout. Keep marketing independently recoverable. Add podcast-only scheduled retries with pagination/time budget. Confirmation must not falsely claim completed delivery. Replace the static-feed CTA in the new path with email instructions. Preserve resource downloads and historical record compatibility; do not enroll legacy contacts by inference.

**Pass:** app outage still captures request and recovers automatically; failed Blob write returns failure; second submit is safe; podcast recovery does not replay a successful Bento automation. No feed token or API key appears in public responses, HTML or analytics. Non-podcast forms do not trigger enrollment.

### 6. AJ Silvers second

Files: `netlify/functions/subscribe.mjs`, new capture/retry support, replay tool and targeted podcast form/component. Read site instructions before edits.

Apply the verified integration pattern without copying Done by Three brand/form assumptions. Add durable capture and outbound timeouts. Replace Engage only within the explicitly planned subscribe integration with Bento's verified contact/event behavior; preserve newsletter and resource gates. Add sender/site credentials independently. Do not grant the podcast to all newsletter users. If no form is selected, build and test adapter with a disabled mapping; report that activation dependency.

**Pass:** same fault/duplicate/secret tests as Done by Three, plus regressions for existing ordinary forms and provider failure. Existing unsubscribe/consent behavior is verified rather than blindly importing every address as subscribed.

### 7–9. Staging, evidence and activation

Execute the deployment sequence in the implementation plan. Stage both modes, both site identities, and provider delivery. Use a published isolated Netlify staging site to verify schedules. Capture request IDs and redacted provider references rather than private token URLs. Review the live release diff and migration/rollback notes before activating offers.

The implementation agent can complete local code/tests/runbooks without deployment credentials. It must report external acceptance as pending if it cannot perform it; a mock email or XML snapshot is not a delivered, playable subscription. Production activation remains a separately authorized task.

## Acceptance matrix

| ID | Scenario | Required result |
| --- | --- | --- |
| A01 | Each approved website form, new address | Correct show; one subscriber/token; access job; email contains that subscriber's feed |
| A02 | Ordinary newsletter/resource or unknown form | No unintended podcast access; existing resource flow preserved |
| A03 | No/wrong/other-site credential; supplied show/mode override | Rejected; no subscriber/job created or cross-site mapping allowed |
| A04 | Missing email, wrong JSON types, malformed/oversized JSON | Controlled 4xx; no 500 from simple input errors |
| A05 | Same event replay; same ID different payload | Same recorded outcome; conflicting payload rejected |
| A06 | Parallel duplicates and differently cased/whitespace email | One normalized subscriber, stable start/token, one initial delivery job |
| A07 | Same email on another mapped show | Separate subscriber/token and correct independent cadence |
| A08 | Website timeout after app commit; retry | Original transaction reused; no extra initial email |
| A09 | Revocation followed by delayed retry or queued send | No reactivation; feed 404; unsent delivery cancelled |
| A10 | Drip interval 1/2/7, separate signup times, exact boundaries | Hidden before release, visible at boundary, stable pubDate; no timezone drift |
| A11 | DST, midnight signup and future start | Contract holds in UTC and alternate process timezones; no early release |
| A12 | Binge with drafts, numbering gaps, append/unpublish/republish | All published eligible items immediately; no future/rewritten pubDates; GUIDs stable |
| A13 | Attempt to edit live cadence/delete/renumber | Rejected without corrupting existing schedules; supported unpublish/append works |
| A14 | XML characters, `]]>`, Unicode, URL query params | XML parser succeeds; metadata/MIME/length valid |
| A15 | Invalid/revoked token; HEAD; cache isolation | Correct status/headers, no personalized shared cache, HEAD not activation |
| A16 | Analytics write fails | Valid RSS still served within bounded request time |
| A17 | R2 upload from production origin, MP3 HEAD/range playback | CORS correct; direct upload; accurate length and playable/seekable audio |
| A18 | App/ESP/provider outage or failed Blob status update | Captured records survive; independent retries; no lost signup or wrong sync flag |
| A19 | Worker overlap/crash/expired lease; callback duplicates | At most one active claim, stable provider key, no status regression |
| A20 | Provider accepts but response lost; ambiguity exceeds 24h | Same-key bounded recovery; expired ambiguity held for reconciliation |
| A21 | Real access email, two podcast clients | Inbox receipt; personal feed subscribes and plays; binge/drip behavior observed |
| A22 | Missing production secrets/forged session | Fail closed; no default secret; API keys inaccessible |
| A23 | Preview deployment and staging retry schedule | No production DB/email use; scheduled work actually demonstrated in staging |
| A24 | Rollback/repair rehearsal | New enrollment can stop while existing feeds continue; retained backlog recoverable |

Use an injected clock for deterministic drip tests; perform at least one real staging poll across a release boundary to prove deployment behavior. Test suite speed is not a substitute for live client compatibility. Define initial operational targets for testing: normal access email accepted within one minute, recoverable handoff/email failures picked up within two sweep cycles, unresolved work visible by fifteen minutes. These are engineering targets, not guaranteed third-party inbox/podcast polling SLAs.

## Copy/paste starting brief for the coding agent

> Implement the reviewed private-podcast operational webhook plan in `/Users/main/Work/code/private-podcast`. Read applicable AGENTS.md chains, Graft context, `docs/REVIEW-2026-09-17.md`, `docs/IMPLEMENTATION-PLAN.md` and `docs/PROGRAMMING-SCHEDULE.md`. Start with tasks 0–1 and proceed in dependency order, keeping each task reviewable and recording evidence. The matching archive is the Kilo/GLM5 MVP plan; the Claude archive is a different implementation and must not be merged wholesale. The outcome includes scoped changes to both Netlify site repos, authenticated form-to-show enrollment, durable recovery and access-email delivery, correct binge/drip RSS, and deployment readiness. Preserve unrelated edits. Use isolated test data and never default to the local `.env` database for tests. Treat missing live mappings/senders/accounts as explicit activation dependencies while completing independent code. Do not push, deploy, provision paid services, alter live provider flows or send real messages without authorization covering those actions. No initial work has been implemented by the planning session.

Confirmed planning inputs: AJ requested placeholder form names and full-interval drip timing after signup. Do not reopen those questions; request actual form/show IDs only when configuring live offers.
