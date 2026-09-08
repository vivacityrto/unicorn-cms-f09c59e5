# Phase 2.6 Stabilization and Claude Code Execution Plan

> **Status:** execution plan; no packet below authorizes a production migration, production-data deletion, Edge deployment, permission change, or PR merge by itself
>
> **Prepared:** 2026-09-07 · **Truth-sync reviewed:** 2026-09-08
>
> **Evidence base:** historical audit at `origin/main@b24bbca57`, reconciled against `origin/main@afafe1f5a` (code state unchanged from `e1a0013ee`), current lint/typecheck/routes/KB-link checks, the Phase 2.6 investigation, and read-only Supabase checks of production plus the dedicated `unicorn-qa` project
>
> **Parent plan:** [Codebase Optimization and KB Renewal Plan](../../codebase-optimization-plan-2026-08-28.md)
>
> **Phase 2.6 source:** [Dead Code, Feature Consolidation, and Architecture Redesign Investigation](../cross-cutting/dead-code-feature-consolidation-investigation.md)
>
> **Related bug register:** [L10 real bugs found](l10-real-bugs-found.md)
>
> **Program index:** [Program Index](../../program-index.md)
>
> **Status:** active
>
> **Owner:** Carl authorizes each packet, Claude Code/Codex execute
>
> **Scope:** open-PR closeout, gate restoration (lint/typecheck/isolation), L10 bug-fix packets, residual lint/retirement, and the Phase 3 pilot — see §3 "Execution order and dependency graph"
>
> **Dependencies:** P1-C (isolation-suite hardening) depends on the QA environment strategy; P4-D items may depend on RBAC v6/Tenant Operating Model decisions — see each packet
>
> **Exit criteria:** see §13 "Definition of done"
>
> **Evidence:** [Progress log](progress-log.md)
>
> **Audit entry:** none at the phase level — individual packets record their own per `docs/audit-log/entries/`

## Current truth-sync (2026-09-08)

This addendum is the present-tense source of truth; dated progress entries below
remain intact as historical evidence. Phase 2.5 is closed as a prerequisite
gate at PR #953. Phase 2.6 stabilization/retirement is active and partly
shipped; Phase 3 is not started. The dedicated QA target is `unicorn-qa`
(`qfpxvumcrnzrjyvqkicq`), not the earlier failed `tenant-isolation-qa` branch.
P1-C live proof completed in protected workflow run `34179875080`; the
administrative secret-move/repeat-run tail was intentionally waived and is not
an open implementation blocker (see session 23 and the QA coverage strategy).

Current repository measurements, taken from the merged code state at
`origin/main@afafe1f5a`, are: 1,702 tracked product files; 480,206 physical
lines (407,168 excluding generated types; 395,650 excluding generated types and
tests); 115 files over 600 lines and 32 over 1,000; six wrapper files (105
lines); 240 routes with zero duplicate paths; and typecheck at zero errors.
The committed lint baseline is 2 errors and 40 rule-attributed warnings (full
lint prints 2 errors and 44 warnings, including four rule-less unused-disable
notices). The two errors are the reviewed `InviteUserDialog.tsx` exception and
the deferred `generate-meeting-recurrence` typing boundary. These measurements
supersede the historical snapshots embedded in the original packet text.

The often-quoted **9,209 retired lines** is an approximate Phase 2.6 aggregate:
direct per-PR shortstat summation is approximately 8,867, with the difference
coming from rounded/cohort accounting. Treat the dead-code register and current
architecture metrics as authoritative; do not use 9,209 as an exact present
LOC total. Remaining work is the P3-A client-health consumer graph, P4-D #18,
the bounded InviteUser adapter, the SeatCard/P6-B tail and P7, followed by the
separately gated Phase 3 architecture work.

## Progress log

Full execution history: [progress-log.md](progress-log.md).

## 1. Outcome and operating principles

Phase 2.5 is formally closed as a prerequisite gate, not as a claim that every lint finding is gone. The next objective is a controlled stabilization pass that:

1. closes superseded work without losing unique evidence;
2. reconciles the documents with current source and production findings;
3. restores zero-error typecheck and lint gates;
4. hardens the tenant-isolation test before any service-role credential is used;
5. fixes the documented L10 bugs in risk order;
6. completes only proven Phase 2.6 retirements and behavior-preserving consolidations; and
7. starts Phase 3 with one small, characterized lifecycle pilot.

The following rules apply to every packet:

- Start from the latest `origin/main` in an isolated worktree. Never switch the shared checkout.
- Keep database/schema/RLS/RPC/trigger/grant changes separate from frontend retirement and lint PRs.
- A dead frontend caller is not evidence that a backend object is dead.
- Preserve route guards, tenant scope, authorization semantics, public Edge contracts, deep links, and redirects unless a packet explicitly owns that behavior.
- Stop on ambiguous reachability, ownership, live schema, authorization, tenant scope, product intent, or browser evidence.
- Do not put a production service-role key in ordinary CI. Isolation tests must first prove safe cleanup against an allowlisted disposable QA project.
- Open PRs for review; do not merge unattended.

## 2. Current baseline and exit targets

| Measure | As authored 2026-09-07 | Stabilization target |
|---|---:|---:|
| ESLint errors | 173 | 0 |
| `@typescript-eslint/no-explicit-any` | 166 | 0, or explicitly approved residuals in a later contract packet |
| ESLint warnings | 39 | Tracked separately; eliminate during module-boundary work |
| TypeScript errors | 5 | 0 |
| Frontend tests | 282 tests, 15 skipped | No new failures; isolation suite no longer silently skips |
| Edge tests | Supported Node-test inventory passes | No regression; unsupported Deno inventory documented |
| Routes | 243, 0 duplicates | Preserve count/guards unless intentional and documented |
| KB links | 672 checked, 0 broken | Remain green whenever KB files change |
| Phase 2.6 retirement | 9,209 lines already removed | Every remaining candidate classified and individually evidenced |

The 173 lint errors (as authored) were distributed as follows:

- 76 in `supabase/functions/ask-viv-assistant/index.ts`;
- 43 in `supabase/functions/tga-rto-sync/index.ts`;
- 38 in `src/test/tenant/isolation.test.tsx`;
- 7 single-finding Edge Function files; and
- 2 frontend files: `InviteUserDialog.tsx` and `AddWorkboardItemDialog.tsx`.

The seven non-`any` errors are expression-only ternaries in `NewEnrolmentModal.tsx`, `ImportVideosPanel.tsx`, `AuditPreparationSection.tsx`, `ClientTimelineTab.tsx`, and `BulkMessageHistory.tsx` (with two findings in the first file). Convert them to explicit `if/else` statements without changing behavior.

> **Reconciled 2026-09-08 — every row above is now stale, in a good way.**
> Fresh `npm run lint` + `npm run lint:baseline` at `origin/main@e5930f908`:
> **2 errors, 44 warnings** (46 problems total; `lint-baseline.json` tracks
> 42 rule-attributed findings — 2 errors, 40 warnings — the other 4
> warnings are ruleId-less "unused eslint-disable directive" notices the
> baseline script doesn't attribute to a rule). Reconciling against the
> table above, by what closed each gap:
> - **`ask-viv-assistant` (76) and `tga-rto-sync` (43):** fixed, P5-A
>   batches 2-3 (PRs #968, #970).
> - **`isolation.test.tsx` (38):** fixed, P1-C steps 1-5 by Codex (PRs
>   #962-#963) — typed the live RLS suite against generated schema.
> - **7 single-finding Edge Functions:** fixed, P5-A batch 1 (PR #967).
> - **`AddWorkboardItemDialog.tsx`:** retired outright as dead code (P6-B,
>   this session), not fixed — zero repo-wide imports.
> - **`InviteUserDialog.tsx`:** still present — a deliberately retained,
>   reviewed `unicorn1` cross-schema exception, not a gap.
> - **The 7 non-`any` errors (`no-unused-expressions`):** fixed, P1-A (PR
>   #957).
> - **TypeScript errors (5 → 0):** fixed, P1-B (PR #958).
> - **The 2 errors remaining today** are both `@typescript-eslint/no-explicit-any`:
>   `InviteUserDialog.tsx` (the exception above) and
>   `supabase/functions/generate-meeting-recurrence/index.ts` (its auth
>   gate shipped in PR #979; typing cleanup was explicitly deferred per
>   this packet's own P3-A item 3 rule — auth before typing).
> - **Warnings (39 → 44, a net increase):** `react-refresh/only-export-components`
>   went 39 → 40 (net +1 across churn, not investigated further — a
>   Fast-Refresh style concern, not correctness); 4 new "unused
>   eslint-disable directive" notices appeared (`useDebouncedAutosave.ts`,
>   `workforce.ts`, `usePageViewTracking.ts`, `friendlyDbError.ts`) — stale
>   disable comments left over from fixes elsewhere, not yet cleaned up.
>
> **Net effect: the `no-explicit-any` elimination effort (§2's original
> exit target) is functionally done** — 2 residuals remain, both already
> individually documented and one already exception-approved. `ESLint
> errors: 0` is not literally met (2 remain) but both are known,
> deliberate, and tracked, not backlog. Frontend tests, routes, and KB
> links in the table above were not re-verified as part of this
> reconciliation pass (it was scoped to the ESLint/TypeScript rows only,
> per what was asked) — re-check those separately before trusting them.

## 3. Execution order and dependency graph

```text
P0  truth sync + PR disposition
│
├── P1  lint correctness + typecheck zero + CI gate
├── P2  isolation-suite hardening ──► protected QA-only workflow
├── P3  urgent production bugs/containment
└── P4  remaining L10 bugs
     │
     └── P5  residual lint contracts (after reachability triage)
          │
          └── P6  Phase 2.6 retirement/consolidation
               │
               └── P7  Phase 3 lifecycle boundary pilot
```

RBAC v6 and Tenant Operating Model decisions remain parallel governance dependencies. Do not invent a second permission registry in this plan, and do not let Phase 2.6 change staff tenant scope or database authority.

## 4. Open PR closeout packet

### Packet P0-A — superseded Phase 2.5 PRs

**Goal:** close stale branches after confirming that no unique source change remains.

| PR | Action | Superseding merged PRs |
|---|---|---|
| #794 | Close without merge | #861, #865 |
| #795 | Close without merge | #802, #808, #815, #844 |
| #796 | Close without merge | #842, #850, #855, #859 |
| #797 | Close without merge | #846, #848 |
| #798 | Close without merge | #809, #820, #848 |
| #799 | Close without merge | #819 |
| #800 | Close without merge | #703, #813 |
| #822 | Close without merge | #821, #823 |

**Pre-close checks:**

- confirm each PR is still open and its branch is not the source of a unique fix;
- compare changed files with current `origin/main`;
- run `npx eslint` on every affected current file;
- record the superseding PR links in the PR comment and this ledger.

**Do not rebase these branches.** Their source files are already clean on current `main`; rebasing would recreate superseded work.

### Packet P0-B — preserve PR #612’s unique evidence

**Goal:** retain the triage-dashboard timeout finding, then close the conflicted PR.

**Scope:**

- Copy the four affected view names and the reproduced HTTP 500/`57014` statement-timeout evidence into the L10 register.
- Track it as a distinct dashboard reliability bug, linked to Client Health H0.0 containment.
- Create a replacement stabilization PR containing only the documentation and, if separately approved, the narrowly scoped timeout fix.
- Close #612 after the replacement PR is opened or merged, with the replacement link in the closing comment.

**Playwright:** authenticated read-only triage-dashboard load, console/network capture, and direct refresh of the affected route. Do not submit, mutate, or seed dashboard data.

## 5. Documentation and evidence reconciliation packet

### Packet P0-C — truth-sync ledger

Update the following claims against `origin/main@b24bbca57`:

- Phase 2.5 is closed as a prerequisite gate.
- Phase 2.6 has already retired 9,209 lines across the merged cohorts.
- Phase 2.6 preparation is no longer blocked by Phase 2.5.
- Phase 3 is preparation-only and has no implementation PR.
- Edge auth guardrails are implemented in `.github/workflows/edge-function-auth-guardrails.yml`.
- Typecheck currently has five errors, not one, and is not yet a CI gate.
- Current route inventory is 243 routes with zero duplicates.
- `usePackageUsage.tsx`, `ComplianceScoreBreakdown`, `useComplianceScore`, and `useCompletionEligibility` are live and must not remain in retirement queues.
- #22/#24 are one ClientRouteGuard root cause.
- #612 is now recorded in the bug register.

**Files:** parent optimization plan, Phase 2.6 preparation/status docs, Phase 2.6 candidate register, Phase 3 packet, reference README, `AGENTS.md`, L10 bug register, and the execution-efficiency log.

**Verification:** `npm run check:kb-links`; regenerate routes and metrics; spot-check every changed claim against source/history. No code or production changes belong in this packet.

## 6. Gate-restoration packets

### Packet P1-A — seven non-`any` lint errors

Replace expression-only ternaries with explicit branches in:

- `src/components/admin/NewEnrolmentModal.tsx`;
- `src/components/academy/ImportVideosPanel.tsx`;
- `src/components/audits/AuditPreparationSection.tsx`;
- `src/components/client/ClientTimelineTab.tsx`; and
- `src/components/messaging/BulkMessageHistory.tsx`.

Add or update focused tests only if the branch is not already covered. The emitted behavior must remain equivalent.

**Exit:** lint errors fall from 173 to 166; `npm run lint:ratchet` passes.

### Packet P1-B — typecheck to zero and CI enforcement

Fix the five current errors:

- `src/components/layout/ClientLayout.tsx`: narrow realtime payloads so sender/conversation fields are present only on the appropriate message shape;
- `src/hooks/useKpiSummary.tsx`: replace the dynamic relation cast with a generated-schema-safe row type and explicit relation handling.

Then add a CI typecheck workflow or gate. The gate must run the repository’s canonical `npm run typecheck`, not `tsc -b --noEmit`, because the latter is known to exhaust the default heap on this repository.

**Exit:** typecheck returns zero; CI catches a deliberately introduced type error; no baseline exception is added.

### Packet P1-C — isolation suite hardening

**File:** `src/test/tenant/isolation.test.tsx`.

Before adding credentials:

- remove or replace the 11 placeholder `expect(true).toBe(true)` tests;
- type the 15 live RLS tests using generated Supabase types;
- assign a unique run ID to every fixture;
- clean users, memberships, participants, messages and audit rows in reverse dependency order from `finally`;
- collect cleanup failures and fail the run instead of warning only;
- assert that no run-scoped rows or auth users remain;
- serialize runs or use a project-level lock; and
- require a disposable-project URL/project-ref allowlist.

**Workflow:** add a protected manual/nightly workflow only after the suite proves cleanup. Do not expose the service-role secret to forked pull requests, and do not use a production project for fixture creation.

**Playwright:** not a substitute for RLS tests. Use Playwright only for the authenticated read-only persona smoke checks after the suite is safe.

**Exit:** the live isolation tests execute, pass, and prove cleanup; the suite cannot silently pass while skipped.

**Status:** done — see [progress-log.md](progress-log.md) and the linked audit entry below.

The QA project is reusable beyond this packet. Its layered suites and
change-impact rules are documented in
[`qa-environment-and-coverage-strategy.md`](qa-environment-and-coverage-strategy.md).

## 7. Bug-fix execution packets

Each packet must update the L10 status, add regression tests, and state whether production data repair is required. Schema or product decisions stop implementation until approved.

### Packet P3-A — urgent containment and authorization

1. **Client Health H0.0:** show “unavailable — data repair in progress” wherever the invalid stage-health metric is consumed. Do not relabel the metric as trustworthy.
2. **Dashboard timeout:** reproduce #612’s four view timeouts, add a bounded fix or documented owner, and verify the triage route read-only.
3. **`generate-meeting-recurrence` (#25):** add explicit caller authorization and negative tests before any typing cleanup.
4. **RBAC correctness hotfix:** disabled principals, arbitrary-subject `check_permission`, and `ProtectedRoute` fail-open behavior are separate security PRs, not Phase 2.6 refactors.

### Packet P4-A — small frontend correctness

- Fix `ClientRouteGuard` render-time navigation (#22/#24) using an effect or router-safe redirect pattern.
- Add `DialogTitle` and description to `BulkMessageDialog` (#23).
- Fix the `global_role`/`unicorn_role` mismatch in Team KPI checks (#11).

**Playwright:** protected deep links, denied client routes, staff routes, communications modal open/close, and KPI loading/error states. Read-only only.

### Packet P4-B — invalid relationship reads

Address Stage Preview (#5), Bulk Generate (#8), and Tenant Documents (#17) by replacing nonexistent embedded relationships with verified two-step reads or a generated-schema-safe query. Do not add speculative foreign keys.

**Required evidence:** live foreign-key catalog, generated types, forbidden/empty/error handling, and query-count/performance note.

**Status:** done — see [progress-log.md](progress-log.md) and the linked audit entry below.

### Packet P4-C — identity and lookup reads

Investigate and fix Process Audit Log (#20), Edit/Add Time person lookup (#21), and the unnumbered `AddTimeDialog` missing-parent-column issue. Confirm the actual identity columns and joins from the live schema before editing.

**Stop condition:** if the correct identity model is unclear, produce a decision packet instead of guessing.

**Status:** done — see [progress-log.md](progress-log.md) and the linked audit entry below.

### Packet P4-D — schema/product decision queue

Keep these as separately approved migration packets:

- ~~Import Stage identity allocation (#3)~~ — **done 2026-09-08**, Carl authorized;
- ~~Archive Package status contract (#4)~~ — **done 2026-09-08**, Carl authorized;
- ~~calendar event identity and invitations (#10)~~ — **done 2026-09-08**, Carl authorized;
- ~~stage archive audit identity (#14)~~ — **done 2026-09-08**, Carl authorized;
- ~~legacy tenant mapping (#15)~~ — **done 2026-09-08**, Carl authorized;
- ~~Academy RPC return type (#16)~~ — **done 2026-09-08**, Carl authorized; and
- ~~tenant-less notification preferences (#18)~~ — **done 2026-09-08**, Carl authorized.

Each packet requires dependency/grant/RLS review, generated types, migration rollback, post-apply checks, and explicit production authorization.

**Status:** done — see [progress-log.md](progress-log.md) and the linked audit entries below.

## 8. Residual lint and Phase 2.6 packets

### Packet P5-A — remaining `any` contracts

Perform reachability triage before touching any candidate. Recommended order:

1. eliminate the 38 isolation-test findings through P1-C;
2. remove `AddWorkboardItemDialog.tsx` only if exact-export reachability confirms it is dead;
3. replace the reviewed `InviteUserDialog.tsx` cross-schema exception with a bounded adapter;
4. group the seven single-finding Edge Functions by auth/write contract;
5. type `tga-rto-sync` in contract-sized batches; and
6. type `ask-viv-assistant` in authorization/tool-contract batches.

Do not use `unknown` casts merely to lower the count. Every Edge batch needs request/response, auth-negative, CORS and external-contract tests. `generate-meeting-recurrence` remains coupled to its security packet.

Track the 39 Fast Refresh warnings separately; resolve them through module-boundary extraction rather than mixing them into query or auth changes.

### Packet P6-A — AddClientTaskDialog/AddStaffTaskDialog consolidation

Use [task-dialog characterization](task-dialog-characterization.md) as the implementation source.

- Preserve separate client/staff table adapters.
- Preserve the current route guard and authorization behavior.
- Correct edit IDs from numeric assumptions to UUID strings.
- Add parity coverage for create/edit table selection, validation, past-date behavior, reset/close/onSuccess, error toasts, labels/DOM IDs, and UUID pass-through.

**Playwright:** authenticated read-only open, edit, cancel and validation flows at `/admin/package/:id`; no persistent writes unless separately authorized.

### Packet P6-B — remaining proven retirement cohorts

At branch cut, regenerate the AST import graph, exact-export census, route manifest, and architecture metrics. Then process one named cohort per PR:

- title extraction pair;
- `useStageQualityCheck` evaluator;
- SeatCard display core;
- Workboard, SharePoint-link, bulk-step, reassignment and network-status islands only after product/reachability confirmation;
- old standalone UI candidates; and
- zero-inbound candidates only after export, route, deep-link, history and deployed-caller sweeps.

Retain `usePackageUsage.tsx` and every live replacement identified in the Phase 2.6 register. Never delete an Audit page without UUID/deep-link characterization.

**Exit:** every candidate is retired, consolidated, retained with rationale, or deferred; before/after LOC and graph metrics are recorded; no backend object is removed by frontend evidence alone.

**Status:** done — see [progress-log.md](progress-log.md) and the linked audit entry below.

## 9. Phase 3 pilot packets

Do not begin until P6-A has parity evidence and the RBAC vocabulary decision explicitly says where authorization predicates live.

### Packet P7-A — lifecycle characterization

Characterize `/admin/lifecycle-checklists` for list, filter, create, edit, deactivate, loading, empty, error and forbidden states. Verify live tables, columns, grants, RLS and write authority.

### Packet P7-B — minimal feature boundary

Extract only the smallest useful feature API/query/domain boundary. Keep the existing `requireSuperAdmin` route guard and server enforcement. The success measure is testability and neutral/negative LOC, not a four-layer template.

### Packet P7-C — architecture and scoped lint boundary

Add one concise `src/ARCHITECTURE.md` page and enforce the new import convention only inside the lifecycle pilot. Do not impose a repository-wide abstraction before evidence exists.

### Packet P7-D — auth/profile/membership seam

Only after RBAC decisions and the disabled-user hotfix: separate session, profile, membership and authorization concerns with pure-helper tests and cancellation/error handling. Do not create a second capability registry.

## 10. Verification contract for every implementation PR

Before editing, record the branch-cut SHA, changed-file list, reachability evidence, generated-schema evidence, risk tier, and intended Playwright scope.

Acquire the shared heavy-command lock for `npm install`, lint, typecheck, tests, build, Vite and Playwright. Run independent checks concurrently when the lock permits it.

Run the complete chain:

```text
npm run lint:ratchet
npm run typecheck
npm run test:frontend
npm run test:edge
npm run build
npm run check:kb-links       # whenever docs/kb or audit index changes
npm run routes               # whenever routes or route declarations change
npm run routes:check-drift   # report, do not block, until inventory docs are reconciled
npm run e2e:unauth           # or the risk-scoped authenticated Playwright suite
```

Run the Playwright preflight before starting a browser. If port 8080 is owned by another worktree, report `blocked-by-owner`; do not silently use another server.

Playwright scope:

- docs-only or compiler-proven type narrowing: no browser pass beyond the applicable unauthenticated check;
- route, guard, auth, query-shape, UI lifecycle or consolidation changes: authenticated read-only personas and affected deep links;
- destructive or write-capable paths: no write test unless separately authorized with disposable data and cleanup proof.

PR handoff must include commands and results, changed files, before/after lint/typecheck/LOC/graph metrics, route diff, test inventory, browser/persona evidence, residual risk, and cleanup status.

## 11. Test-data and residue ledger

### Local residue

- Delete `playwright/.auth/*.json` after the final authenticated run, and rotate credentials if a live token may have been exposed.
- Review `.claude/worktrees`, `.worktrees`, and `worktrees` by exact path and ownership. Remove only clean, registered or explicitly classified stale worktrees using the repository cleanup procedure.
- Preserve npm and TypeScript caches for reuse; do not delete caches as “cleanup.”
- The registered `hotfix/p2p5-any-batch84` worktree has no unique source change worth merging; its remaining hook change would regress current role normalization.

### Hosted test data

Historical Phase 2.5 cleanup is documented, but current zero-residue status must be established by a read-only inventory before any deletion claim. The inventory should check run-scoped package/stage/audit/message/notification rows, orphan attachments, storage objects, and isolation-test prefixes. Any delete requires a separately authorized packet with a reversible or auditable procedure.

### Isolation-test residue

The hardened suite must use a unique run ID, reverse-order cleanup, failure propagation, and post-cleanup assertions. A green test with skipped live RLS coverage is not an exit condition.

## 12. Cron and migration stabilization packets

This track is a prerequisite for the safe QA environment required by P1-C and
is also the migration-safety work needed before Phase 3. It is operational and
schema work, not a Phase 2.6 frontend-retirement cohort. No packet below
authorizes a production change by itself.

### Current evidence and safety boundary

> **Supersession note (2026-09-08):** the QA bullet below is retained as the
> failed-branch investigation record. The current P1-C target is the dedicated
> `unicorn-qa` project (`qfpxvumcrnzrjyvqkicq`), with a verified schema-only,
> cron-free baseline and completed live proof. Do not read the historical
> `tenant-isolation-qa` status as an outstanding blocker.

- Production has 24 active `pg_cron` jobs after M2 retired three legacy audit
  schedules. The remaining jobs are a mixture of healthy maintenance and
  partially working forecast/health jobs.
- **Historical only:** the `tenant-isolation-qa` preview branch was reusable in
  the original investigation, but it is
  currently unhealthy: it has no `pg_cron` extension, only 17 of production's
  329 migrations applied, and stops at
  `20260714074920_enable_retention_and_risk_forecast_cron.sql` with
  `schema "cron" does not exist`.
- That migration also contains a production URL. Enabling `pg_cron` in QA or
  replaying it without an environment guard could make QA invoke production
  Edge Functions. Do not enable the extension, inject a service-role key, reset
  the branch, or apply a migration until the packets below are reviewed.
- An HTTP cron run marked successful only proves that `pg_net` accepted the
  request; it does not prove that the Edge Function produced valid output.

### Cron disposition ledger

| Jobs | Current evidence | Disposition |
|---|---|---|
| `audit-flag-overdue-chcs` (#6) | Repeatedly fails because `notification_schedule.payload` no longer exists | Retire after owner confirmation |
| `audit-evidence-reminders` (#5) | Legacy/half-shipped path; its status filter does not match the current evidence contract | Retire or formally migrate |
| `audit-24hr-confirmation` (#4) | Legacy path using the removed `notification_schedule.payload` contract | Retire or formally migrate |
| `run-tenant-risk-forecast` (#20) and `run-retention-forecast` (#21) | Active requests but zero forecast rows | Product decision: repair and prove output, or retire |
| `run-stage-health-monitor` (#15) | Writes snapshots, but progress is universally zero and health is not trustworthy | Contain and fix; do not silently retire |
| `run-workload-forecast` (#14) | Workload snapshots exist, but burn-forecast output is empty | Fix and add output-health checks |
| `regulator-watch-check` (#29) | Active function with no current repository owner/reference found | Ownership review |
| Bulk-document reclaim/purge (#18/#19) | Current maintenance functions exist | Keep unless a usage audit proves they are obsolete |
| Notifications, calendar, invites, Ask Viv, Xero, activity digest, locks, and stalled-job recovery | Current consumers or operational evidence exist | Keep |

M2 retired the former immediate retirement candidate group (jobs 4, 5, and 6).
Jobs 20 and 21 still require an explicit repair-or-retire decision; they must
not remain active as apparently successful no-op jobs.

### Packet M0 — read-only cron and migration inventory

Produce a versioned inventory before changing hosted state. Capture, per job:

- schedule, active state, target function/SQL, migration origin and target URL;
- recent `cron.job_run_details`, including exact failures;
- database function and Edge Function existence, callers, grants and ownership;
- tables written and freshness/row-count evidence; and
- repository references, product owner and proposed disposition.

Also inventory migration-time `INSERT`, `UPDATE`, `DELETE`, backup-table,
`cron.*`, `pg_net`, hard-coded URL and hard-coded-ID operations. The inventory
must distinguish data changes that execute during migration from function bodies
that only write when later invoked.

**Exit:** a committed Markdown/JSON matrix exists, with every active job and
every migration risk classified as keep, fix, retire, or owner decision.

**Artifact:** [Cron and Migration Inventory — 2026-09-07](../../../codebase-state/cron-and-migration-inventory-2026-09-07.md)
and its [machine-readable companion](../../../codebase-state/cron-and-migration-inventory-2026-09-07.json).

### Packet M1 — migration safety scanner and CI guardrail

Add a repository script (for example, `scripts/audit-migrations.mjs`) that
scans `supabase/migrations/**` and reports:

- production project references and literal `supabase.co` URLs;
- `cron.schedule`, `cron.unschedule`, `net.http_*` and extension assumptions;
- migration-time DML, destructive predicates, backup tables and hard-coded IDs;
- named backfill, seed, requeue, duplicate-removal and cleanup migrations; and
- whether each operation is replay-safe in an empty QA project.

Add a CI check that rejects new production URLs or cron registrations unless a
short-lived, reviewed allowlist entry includes the target project, owner,
reason and expiry. Do not rewrite already-applied migration history as a quick
fix.

**Exit:** a fresh migration cannot silently schedule production work or perform
an unreviewed data mutation during QA replay.

**Implementation:** the scanner usage and reviewed-exception contract are
documented in [Migration safety guardrail — 2026-09-07](../../../codebase-state/migration-safety-guardrail-2026-09-07.md).

### Packet M2 — controlled retirement of legacy audit jobs

After product-owner confirmation, add one idempotent corrective migration or
controlled Supabase operation that unschedules jobs 4, 5 and 6 and records the
reason. Guard the operation for environments where `cron` is absent, and
postflight-assert that the named jobs are gone.

**Status:** done — see [progress-log.md](progress-log.md) and the linked audit entry below.

Do not drop `notification_schedule`, `notification_audit_log`, or their helper
functions in the same change. First prove there are no current readers,
writers, grants, triggers or retention obligations; then handle object removal
in a separately reviewed packet with an auditable rollback/restore procedure.

### Packet M3 — notification legacy decision

The read-only dependency review supports a staged version of path 2 (retire),
not migration to a new reminder workflow. Production has zero rows in both
legacy tables. The three legacy database functions are service-role-only,
unscheduled after M2, have no trigger/view dependency, and have no repository
caller. `notification_audit_log` is not dead: the active
`process-notification-outbox` worker writes success/failure delivery records to
it, so it remains in the live notification contract. `notification_schedule`
is dormant but cannot be dropped yet because the deployed
`process-notification-queue` reads it and `send-automated-email` still writes
it in three unreachable audit branches; both paths reference the removed
`payload` column.

#### M3-A — retire the three legacy database functions

Prepare an idempotent migration that drops only:

- `public.audit_flag_overdue_chcs()`;
- `public.audit_send_24hr_confirmation()`; and
- `public.audit_send_evidence_reminders()`.

Preflight must re-check that the functions are service-role-only, no trigger or
view references them, and jobs 4–6 remain absent. Apply only after explicit
production authorization; postflight must assert that the three routines no
longer exist and that both legacy tables are unchanged.

**Status:** done — see [progress-log.md](progress-log.md) and the linked audit entry below.

#### M3-B — retire dormant queue references

Remove the three audit-only insert branches from `send-automated-email` and
retire the deployed `process-notification-queue` worker through a separately
reviewed Edge change (no cron job or frontend caller exists). Run Edge tests,
lint ratchet, typecheck, build, and a read-only function health check. Do not
drop `notification_schedule` in the same Edge deployment.

#### M3-C — drop `notification_schedule` after dependency proof

After M3-B, verify no deployed function, migration, trigger, view, or frontend
caller references the table; confirm zero rows and no recent access/error
evidence; then apply a separately authorized, reversible migration to drop the
table and its indexes/policies. Postflight must assert the relation is absent
and that `notification_audit_log` and `notification_outbox` remain intact.

**Status:** done — see [progress-log.md](progress-log.md) and the linked audit entry below.

#### M3-D — retain and govern `notification_audit_log`

Keep the table because `process-notification-outbox` writes it. Add a separate
retention/observability decision later (the current table is empty, while
`notification_outbox` contains 980 terminal failed/skipped rows). Do not drop
or rewrite its foreign key to `notification_outbox` as part of M3-A through
M3-C.

If the product owner instead wants audit reminders restored, stop this staged
retirement and open a migration path that uses `notification_outbox` and the
current email sender, with corrected schemas, dedupe, recipient policy, and
regression tests. The current `payload` mismatch and `status = 'sent'` filter
are blocking correctness defects, not typing cleanup.

### Packet M4 — forecast and health output integrity

**Status:** in progress — see [progress-log.md](progress-log.md) and the linked audit entries below.

- Add Client Health H0.0 containment so invalid stage-health data is shown as
  unavailable/data-repair-in-progress rather than relabelled as trustworthy.
- For jobs 14 and 15, define freshness, row-count and non-zero-output
  expectations; make violations fail visibly instead of recording a successful
  no-op.
- For jobs 20 and 21, repair and prove forecast inserts, or unschedule them
  after the product decision.
- Run authenticated, read-only Playwright checks for `/dashboard`,
  `/executive`, `/triage-dashboard` and the affected Ask Viv surface. Do not
  seed or mutate dashboard data.

### Packet M5 — environment-safe migration replay

**Status:** superseded — see [progress-log.md](progress-log.md) and the linked audit entries below.

Recommended replay strategy: create a clean QA branch from the current
production schema baseline (or an equivalent reviewed baseline export), then
replay only environment-neutral migrations. Replace cron registration with a
controlled deployment step that defaults to zero schedules in QA/preview and
refuses the production project ref. This is safer than patching the failed
branch in place because the current migration history contains both backfills
and environment-specific scheduling assumptions. Carl must approve the branch
repair strategy before any destructive or migration-history operation.

Stop adding environment-specific cron registration to ordinary schema
migrations. Move scheduling to a controlled deployment step that derives the
target URL from the selected project, defaults to no schedules in preview/QA,
and refuses unapproved project refs.

For the existing failed QA branch, select and document one replay strategy
before acting:

- a reviewed replay-safe patch/baseline that lets unapplied migrations run
  without cron or production URLs; or
- a clean schema baseline followed by only the approved, environment-neutral
  migrations.

Do not reset, delete or mark migrations applied in QA until that strategy is
approved and the resulting schema is checked against the migration inventory.

**Exit:** the preview branch is healthy, migration-complete, contains no cron
jobs by default, and cannot call production as a side effect of replay.

### Packet M6 — P1-C QA authorization and isolation proof

**Status:** done — see [progress-log.md](progress-log.md) and the linked audit entry below.

Only after M0–M5:

- confirm QA project URL and project ref are on the disposable-project
  allowlist;
- create a QA-only service-role secret and keep it out of ordinary CI;
- run P1-C with unique run IDs, project-level serialization, strict reverse
  cleanup, cleanup-failure propagation and residue assertions; and
- add the protected manual/nightly workflow only after repeated clean runs.

The workflow must be manual/nightly, protected by an Actions environment, and
unavailable to forked pull requests. A production service-role key is never a
valid substitute.

### Verification contract for M0–M6

Every implementation PR runs the repository gates appropriate to its scope:

```text
npm run lint:ratchet
npm run typecheck
npm run test:frontend
npm run test:edge
npm run build
npm run check:kb-links
```

Migration packets additionally require Supabase MCP preflight/postflight
queries, migration-history checks, exact cron/job assertions, and a fresh
zero-residue inventory. Playwright is read-only and risk-scoped; it is required
for dashboard, auth, route or query-behavior changes, but is not a substitute
for the live RLS suite.

## 13. Definition of done

This stabilization programme is complete when:

- all nine open PRs are closed with the dispositions in P0-A/P0-B;
- the L10 register includes #612 and has no duplicate root-cause entries;
- docs reflect current source, history and production evidence;
- ESLint and typecheck both return zero errors;
- CI enforces lint ratchet and typecheck without a stale-error baseline;
- the tenant-isolation suite executes safely in a disposable QA project and proves cleanup;
- urgent Client Health, dashboard-timeout and authorization defects have an owner and verified disposition;
- every Phase 2.6 candidate is classified with current reachability evidence;
- the task-dialog consolidation has parity tests and read-only browser evidence; and
- the Phase 3 lifecycle pilot has characterization tests, a measured boundary, and no authorization or tenant-scope drift.

## 14. Claude Code handoff prompt

```text
Execute docs/kb/reference/codebase-optimization/phase-2-6-stabilization/phase-2-6-stabilization-plan.md one packet at a time from fresh origin/main worktrees. Begin with P0 truth sync and open-PR disposition; preserve PR #612’s unique dashboard-timeout evidence before closing it. Treat M0–M6 as the cron/migration safety track that must precede P1-C's QA credential and workflow. Do not merge unattended. For every implementation PR, perform reachability and generated-schema checks, acquire the shared heavy-command lock, run lint:ratchet, typecheck, frontend tests, Edge tests, build, and the applicable KB/routes/Playwright checks. Keep database, RLS, RPC, grant, permission, tenant-scope, cron, migration and production-data work separately authorized. Never place a production service-role key in ordinary CI. Update the L10, residue, cron inventory and execution ledgers as evidence changes. Stop on ambiguous authorization, schema, ownership, product, or browser evidence and report the exact decision required.
```
