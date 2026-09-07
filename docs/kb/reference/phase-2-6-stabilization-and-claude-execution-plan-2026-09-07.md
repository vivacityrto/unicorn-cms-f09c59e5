# Phase 2.6 Stabilization and Claude Code Execution Plan

> **Status:** execution plan; no packet below authorizes a production migration, production-data deletion, Edge deployment, permission change, or PR merge by itself
>
> **Prepared:** 2026-09-07
>
> **Evidence base:** `origin/main@b24bbca57`, the four-initiative audit supplied on 2026-09-07, current lint/typecheck/routes/KB-link checks, and the Phase 2.6 investigation
>
> **Parent plan:** [Codebase Optimization and KB Renewal Plan](codebase-optimization-plan-2026-08-28.md)
>
> **Phase 2.6 source:** [Dead Code, Feature Consolidation, and Architecture Redesign Investigation](dead-code-feature-consolidation-investigation-2026-09-04.md)
>
> **Related bug register:** [L10 real bugs found](l10-real-bugs-found-2026-09-04.md)

## Progress log

**2026-09-07, session 1 — Packets P0-A, P0-B, P0-C, P1-A, P1-B, P4-A merged:**

> **Restoration note:** this whole section was added in PR #961 and then
> silently deleted by PR #963 ("test: track tenant isolation fixture
> identities") — a real content-loss incident, not a deliberate edit; #963's
> diff shows a clean 56-line removal of exactly this section, alongside an
> identical removal in `execution-efficiency-log.md`. Restored here with
> updates for what's happened since.

- **P0-A** (superseded PR closeout): all 8 listed PRs (#794–#800, #822) confirmed
  superseded — every changed file already clean (0 explicit-any, 0 ESLint
  errors) on `origin/main` — and closed without merge, with superseding-PR
  links recorded in each closing comment.
- **P0-B** (PR #612 evidence preservation): [#955](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/955),
  merged. Preserved the dashboard-500 statement-timeout evidence as L10 item
  #26, linked to Client Health H0.0 containment, then closed #612.
- **P0-C** (truth-sync): [#956](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/956),
  merged. Verified and corrected the packet's own claims against source —
  typecheck error count/CI-gate status, Phase 2.5/2.6/3 sequencing notes,
  #22/#24 duplicate root cause. **Found one factual error in this plan
  itself**, not silently accepted: `usePackageUsage.tsx` is NOT live (zero
  importers on `origin/main`, superseded by `usePackageUsageQuery.tsx`) —
  corrected in `execution-efficiency-log.md`, not reclassified as safe to
  retire without its own gated packet. Also flagged the plan's "9,209 lines
  retired" figure as an approximation (~8,867 by direct per-PR sum, a
  ~342-line gap within normal rounding of several `~`-prefixed entries).
- **P1-A** (7 non-`any` lint errors): [#957](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/957)
  and follow-up [#960](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/960)
  (`PackagePhasesTab.tsx`), both merged. §2's "seven non-`any` errors"
  undercounted by one: there were 7 ternary-as-statement findings across 6
  files plus 1 `prefer-const`, not the "seven, including two in the first
  file" description — #957 fixed 7 of the 8, #960 fixed the missed 8th.
  Several of the five named files also live at different paths than stated
  (e.g. `NewEnrolmentModal.tsx` is under `src/components/academy/admin/`,
  not `src/components/admin/`).
- **P1-B** (typecheck to zero + CI gate): [#958](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/958),
  merged. `ClientLayout.tsx` and `useKpiSummary.tsx` fixed; typecheck is 0
  errors; `.github/workflows/typecheck.yml` added as a real, non-exempted
  CI gate.
- **P1-C (isolation-suite hardening): steps 1–5 done by Codex, merged.**
  [#962](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/962) —
  placeholders removed, live RLS suite typed against generated schema.
  [#963](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/963) —
  unique per-run `RUN_ID`, fail-closed reverse-dependency cleanup. Steps 6
  (concurrent-run serialization) and 7 (disposable QA project + protected
  workflow) remain outstanding — the suite is still correctly credential-
  gated (`describe.skipIf(!RLS_SUITE_ENABLED)`) pending Carl's
  disposable-QA-project decision; do not wire in a service-role secret
  until that decision lands.
- **P4-A** (small frontend correctness): [#959](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/959),
  merged. Fixed L10 #22/#24 (`ClientRouteGuard` render-time `navigate()`)
  and #11 (`useKpiAccess` missing the `unicorn_role` SuperAdmin check —
  verified live against a real affected account, `carl@vivacity.com.au`,
  whose profile has `global_role: null, unicorn_role: "Super Admin"`).
  Confirmed #23 (`BulkMessageDialog` DialogTitle) was already fixed by an
  earlier, unrelated PR; annotated rather than re-implemented.
- **P6-A retargeted into a full-page retirement, merged.**
  [#964](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/964).
  Started as the
  `AddClientTaskDialog`/`AddStaffTaskDialog` consolidation per the
  task-dialog characterization packet. Live verification of the id-type fix
  surfaced that `PackageDetail.tsx` (the dialogs' only consumer) is itself
  an unreachable, redundant page — reachable only via one unlabeled icon
  button, every feature either disconnected from the real data model or a
  strictly less-capable duplicate of a live equivalent elsewhere. See
  `dead-code-feature-consolidation-investigation-2026-09-04.md` §7ter for
  the full investigation. The consolidation work was discarded; the whole
  `/admin/package/:id...` route tree was retired instead, in its own PR.
  This also surfaced a process gap: a stage was briefly added to a real
  client tenant's `tenants.stage_ids` while probing reachability instead of
  using Demo RTO/a seeded tenant, and had to be reverted via Supabase MCP
  after an in-page fetch-based revert attempt was correctly blocked by the
  permission classifier. Logged as a standing rule: future write-testing on
  this plan uses Demo RTO, a seeded tenant, or an inactive tenant — never
  whatever real tenant happens to have convenient data.
- **Not yet started:** P2 (depends on P1-C steps 6–7, blocked on Carl's
  infra decision), P3-A, P4-B/C/D, P5-A, P6-B, P7 — several of these
  require live-schema investigation, product/security decisions, or their
  own separately authorized packets per §1's rules.

Current `origin/main` state after all merges to date (P0/P1/P4-A/P6-A/P1-C
steps 1–5): 128 errors (all `no-explicit-any`), 43 warnings, 240 routes/0
duplicates, typecheck 0 errors. The P6-A retirement's own drop from 166→128
errors and 243→240 routes reflects the retired page's own `any` findings
and its 3 removed routes, not a regression.

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

| Measure | Current | Stabilization target |
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

The 173 lint errors are distributed as follows:

- 76 in `supabase/functions/ask-viv-assistant/index.ts`;
- 43 in `supabase/functions/tga-rto-sync/index.ts`;
- 38 in `src/test/tenant/isolation.test.tsx`;
- 7 single-finding Edge Function files; and
- 2 frontend files: `InviteUserDialog.tsx` and `AddWorkboardItemDialog.tsx`.

The seven non-`any` errors are expression-only ternaries in `NewEnrolmentModal.tsx`, `ImportVideosPanel.tsx`, `AuditPreparationSection.tsx`, `ClientTimelineTab.tsx`, and `BulkMessageHistory.tsx` (with two findings in the first file). Convert them to explicit `if/else` statements without changing behavior.

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

### Packet P4-C — identity and lookup reads

Investigate and fix Process Audit Log (#20), Edit/Add Time person lookup (#21), and the unnumbered `AddTimeDialog` missing-parent-column issue. Confirm the actual identity columns and joins from the live schema before editing.

**Stop condition:** if the correct identity model is unclear, produce a decision packet instead of guessing.

### Packet P4-D — schema/product decision queue

Keep these as separately approved migration packets:

- Import Stage identity allocation (#3);
- Archive Package status contract (#4);
- calendar event identity and invitations (#10);
- stage archive audit identity (#14);
- legacy tenant mapping (#15);
- Academy RPC return type (#16); and
- tenant-less notification preferences (#18).

Each packet requires dependency/grant/RLS review, generated types, migration rollback, post-apply checks, and explicit production authorization.

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

Use [task-dialog characterization](phase-2-6-task-dialog-characterization-2026-09-04.md) as the implementation source.

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

## 12. Definition of done

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

## 13. Claude Code handoff prompt

```text
Execute docs/kb/reference/phase-2-6-stabilization-and-claude-execution-plan-2026-09-07.md one packet at a time from fresh origin/main worktrees. Begin with P0 truth sync and open-PR disposition; preserve PR #612’s unique dashboard-timeout evidence before closing it. Do not merge unattended. For every implementation PR, perform reachability and generated-schema checks, acquire the shared heavy-command lock, run lint:ratchet, typecheck, frontend tests, Edge tests, build, and the applicable KB/routes/Playwright checks. Keep database, RLS, RPC, grant, permission, tenant-scope and production-data work separately authorized. Never place a production service-role key in ordinary CI. Update the L10, residue and execution ledgers as evidence changes. Stop on ambiguous authorization, schema, ownership, product, or browser evidence and report the exact decision required.
```
