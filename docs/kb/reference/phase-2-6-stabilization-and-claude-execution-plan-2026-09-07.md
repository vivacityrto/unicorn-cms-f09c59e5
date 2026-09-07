# Phase 2.6 Stabilization and Claude Code Execution Plan

> **Status:** execution plan; no packet below authorizes a production migration, production-data deletion, Edge deployment, permission change, or PR merge by itself
>
> **Prepared:** 2026-09-07
>
> **Evidence base:** `origin/main@b24bbca57`, the four-initiative audit supplied on 2026-09-07, current lint/typecheck/routes/KB-link checks, the Phase 2.6 investigation, and read-only Supabase MCP checks of production plus the `tenant-isolation-qa` preview branch
>
> **Parent plan:** [Codebase Optimization and KB Renewal Plan](codebase-optimization-plan-2026-08-28.md)
>
> **Phase 2.6 source:** [Dead Code, Feature Consolidation, and Architecture Redesign Investigation](dead-code-feature-consolidation-investigation-2026-09-04.md)
>
> **Related bug register:** [L10 real bugs found](l10-real-bugs-found-2026-09-04.md)

## Progress log

**2026-09-07, session 2 — Packet M0 completed:** read-only production cron and
migration inventory captured in [cron-and-migration-inventory-2026-09-07.md](../codebase-state/cron-and-migration-inventory-2026-09-07.md)
and its JSON companion. No hosted state changed. M1 is next.

**2026-09-07, session 3 — Packet M1 implemented:** added the repository
migration scanner, unit tests, empty reviewed-exception allowlist, CI
guardrail, and usage documentation. The full-tree audit reports historical
findings without failing; changed-only CI mode blocks new production URLs,
cron/HTTP side effects, migration-time mutations, and edits to existing
migration history unless a concrete, short-lived allowlist entry matches.
No hosted state changed. M2 remains product-owner gated.

**2026-09-07, session 4 — Packet M2 authored after product-owner approval:**
read-only production preflight confirmed jobs 4–6 and their failure/success
evidence, and found that the notification tables still have active Edge
Function readers/writers. Added a guarded, idempotent corrective migration to
unschedule only the three legacy audit job names, with an ID-reuse check and a
postflight assertion. Tables and helper functions are intentionally retained
for M3. The migration was then applied in session 5 after separate explicit
authorization.

**2026-09-07, session 5 — Packet M2 applied after explicit authorization:**
the guarded migration unscheduled only `audit-24hr-confirmation` (job 4),
`audit-evidence-reminders` (job 5), and `audit-flag-overdue-chcs` (job 6) in
production. Postflight confirmed 24 active jobs remain, zero rows for the
retired names, unchanged neighboring schedules, and migration-history entry
`20260907050651`. Historical run details remain; notification tables and
helper functions were not changed. M3 is next.

**2026-09-07, session 6 — Packet M3 dependency review completed (read-only):**
production has zero rows in both `notification_schedule` and
`notification_audit_log`; all three legacy audit functions are executable only
by `service_role`/`postgres`, with no triggers or views depending on either
table. The three database functions have no active schedule after M2 and no
repository caller. `notification_audit_log` is nevertheless written by the
active `process-notification-outbox` worker and must remain. `notification_schedule`
is still read by the deployed but unscheduled `process-notification-queue`
worker and written by the three audit branches of `send-automated-email`; those
branches have no repository caller and currently reference the removed
`payload` column. Recommendation: execute the staged retirement path in Packet
M3-A through M3-C below, retaining `notification_audit_log`.

**2026-09-07, session 7 — M3-A applied after explicit authorization:**
the new migration dropped only the three legacy audit routines. Postflight
confirmed no matching routines remain, jobs 4–6 remain absent, both legacy
tables remain present/RLS-enabled with zero rows, and the notification outbox
remains unchanged at 738 failed and 242 skipped rows. Supabase recorded
`retire_legacy_audit_functions` as migration `20260907052028`. M3-B is next.

**2026-09-07, session 8 — M3-B implemented:** removed the three dormant
`notification_schedule` writes from `send-automated-email` while preserving
its three email response paths, and replaced the unused
`process-notification-queue` worker with a credential-free HTTP 410 retirement
stub. The shared cron-auth inventory no longer treats the retired worker as an
active cron function; `notification_schedule` and the active
`process-notification-outbox` contract remain intact for M3-C/M3-D. Static
regression tests pass. Production state is unchanged pending reviewed PR
merge, after which the native Supabase GitHub sync will deploy the Edge change.

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
- **P5-A batch 2/3 (`tga-rto-sync`, 43 findings), merged.**
  [#968](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/968).
  Rather than casting every property access to `unknown` (which would
  have forced assertions at ~150 downstream sites), modelled the actual
  TGA REST API shapes (`TgaScopeItem`, `TgaOrgData` + its nested
  collection types, `TgaStagingRow`). All 43 fixes are pure
  type-annotation changes — verified via full diff review plus a
  standalone `tsc --noEmit` pass against a stubbed copy of the file (0
  errors), since `supabase/functions/**` isn't covered by either
  tsconfig and has never actually been type-checked otherwise. Added a
  new `auth-gate.test.mjs` (function had no prior test coverage).
  Post-merge Edge-deploy check pending (per `AGENTS.md`'s "Supabase
  deployment workflow" — confirm deployed version/source via Supabase MCP).
- **P5-A batch 1/3 (6 single-finding Edge Functions), merged.**
  [#967](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/967).
  Fixed `add-missing-packages`, `bulk-send-invitations`,
  `create-client-audit`, `create-tasks-from-minutes`, `dashboard-test-seed`,
  `tga-rto-import` — every single-occurrence `no-explicit-any` finding in
  `supabase/functions/**` outside `tga-rto-sync` (43 findings) and
  `ask-viv-assistant` (76 findings), both deferred to their own
  contract-sized batches, and `generate-meeting-recurrence` (excluded per
  this section's own rule, tied to L10 #25's auth review). All 6 fixes are
  compiler-provable type-only changes (catch-narrowing, an existing typed
  `EdgeRuntime`-global pattern reused from 3 other functions, a new
  `MinutesContent` JSON-blob type, a redundant any-cast removal, and a
  `SupabaseClientAny = any` alias swapped for the real untyped
  `SupabaseClient` import already used in `_shared/`) — no live Playwright
  pass required. Added 5 missing `*.test.mjs` static-assertion files
  (test:edge 260→265 passing). Found, documented (L10 #28), but
  deliberately did not fix — behavioral change, out of scope here — a
  pre-existing `bulk-send-invitations` bug: 3 call sites call its own
  `jsonResponse(req, status, body)` helper without `req`, so those
  validation-failure paths throw instead of returning a structured error.
  Post-merge Edge-deploy check pending (per `AGENTS.md`'s "Supabase
  deployment workflow" — confirm deployed version/source via Supabase MCP).
- **P5-A batch 3/3 (`ask-viv-assistant`, 76 findings, the largest remaining
  file), merged and deploy-verified.**
  [#970](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/970),
  merged at commit `db2c46105` (05:29 UTC). Confirmed live via Supabase MCP:
  deployed version advanced 147→148 at 05:41 UTC (~12 min sync lag via
  Supabase's native GitHub sync integration, confirmed independently by
  Codex the same day — see `AGENTS.md`'s "Supabase deployment workflow"
  section, correction pending in PR #972), source verified byte-identical
  to the merged commit, and 3 live Playwright test conversations returned
  correct real data with zero new console errors and clean production
  logs.
  Staff-only agentic tool-calling assistant (21 tools in one `executeTool`
  dispatcher) — the client portal calls a separate, untouched
  `ask-viv-assistant-client` function. Modelled 20 local row-shape
  interfaces, one per distinct query/RPC result shape, replacing per-
  callback `any` annotations with a single cast at first read (same
  pattern as #968). The standalone `tsc --noEmit` pass against the real,
  unmodified `_shared/**` dependency tree (not just a stub) surfaced two
  real narrowing gaps this fixed (`rank_clients_by_activity`/
  `get_activity_trend` both divided a dynamically-keyed column value
  without narrowing `unknown` to `number` first) — genuine bugs the
  linter alone would not have caught. Also surfaced (left alone, out of
  scope) 6 pre-existing type errors in two untouched `_shared` files.
  Added `auth-gate.test.mjs` (function had zero prior test coverage).
  **P5-A is now fully complete** — all 3 PRs merged (#967, #968,
  #970 — 6 + 43 + 76 = 125 of the 166 baseline `no-explicit-any` findings;
  the remaining 41 were the isolation-test findings via P1-C and the two
  frontier frontend files already resolved earlier).
  **Process note:** discovered mid-batch that Edge Functions on this
  project deploy via Supabase's native GitHub sync integration on merge
  to `main` (not a repo-committed Action — none of `.github/workflows/*`
  reference deploy/supabase), contradicting `AGENTS.md`'s current "no
  automatic Supabase deployment workflow" claim. Correcting that claim is
  deliberately deferred until the mechanism is empirically confirmed on a
  real merge (per Carl's instruction), not assumed from this discovery
  alone. No live Playwright pass was done pre-merge for this reason —
  there's nothing new deployed to exercise yet; live verification happens
  after merge once the sync integration deploys it.
- **P4-B (invalid relationship reads) done, plus a P6-B retirement it
  surfaced, pending merge.** Two genuine `packages:package_id`-embed no-FK
  bugs fixed (`StagePreviewDialog.tsx`, `BulkGenerateDocumentsDialog.tsx`) —
  same two-step-fetch pattern as `GeneratedDocumentsTab.tsx`'s existing fix,
  no speculative FK added. Fixing a third instance in
  `TenantDocuments.tsx` was paused mid-task after Carl noticed the page for
  the first time; reachability triage (matching the P6-A lesson above)
  found `TenantDocuments.tsx`, `TenantDocumentsHub.tsx`,
  `TenantDocumentDetail.tsx`, and `TenantDocumentDetailWrapper.tsx` (+ their
  3 routes) were unreachable dead code whose only live equivalent
  (`ClientDetail.tsx`'s embedded Documents tab) was already fixed. Retired
  all 4 files and redirected the 3 routes instead of fixing dead code — see
  `dead-code-feature-consolidation-investigation-2026-09-04.md` §7quater and
  L10 item #17's update for the full investigation. Verified live:
  `StagePreviewDialog.tsx`'s fixed query and all 3 retirement redirects,
  zero console errors; `BulkGenerateDocumentsDialog.tsx`'s own dialog could
  not be opened live (`package_stage_documents` has zero non-deleted rows
  in production right now, for any stage — a pre-existing, unrelated data
  fact) so its fix rests on static verification + code-pattern review only,
  disclosed as a coverage gap rather than silently claimed as tested.
- **P4-C (identity and lookup reads) done and merged (PR #976).** Process
  Audit Log (#20), Edit/Add Time person lookup (#21), and `AddTimeDialog`'s
  note-insert (unnumbered) all fixed against confirmed live schema — none
  needed a decision packet. See Packet P4-C's own section (§7) for full
  detail. Also surfaced a parked, explicitly-deferred finding: person-picker
  dropdowns built on `public.users` list system/test/bulk-operation accounts
  unfiltered — logged as RBAC v6 plan §13 item 14, not actioned here.
- **Edge Function auto-deploy confirmed unreliable, not just laggy — all 7
  functions from #967/#968 manually redeployed, correction merged (PR
  #977).** Post-merge checks found none of the 7 functions changed by
  #967/#968 had auto-deployed 20+ minutes after merge (confirmed via a
  real source diff, e.g. `tga-rto-sync`'s live source still had the
  pre-fix `const norm = (v: any) => ...`), directly contradicting the
  "confirmed reliable" claim recorded above for #970 and in PR #972.
  Carl independently confirmed Codex hit the identical failure the same
  day. All 7 (`tga-rto-sync`, `add-missing-packages`, `tga-rto-import`,
  `bulk-send-invitations`, `create-client-audit`, `dashboard-test-seed`,
  `create-tasks-from-minutes`) were manually deployed via Supabase MCP
  and verified byte-for-byte against `origin/main`. Also found and logged
  (L10 item 29, not fixed — out of scope) a second instance of the same
  bug shape as item 28: `tga-rto-import`'s `handleImport`/`handleStatus`
  call `jsonResponse(req, ...)` with `req` out of scope, a guaranteed
  `ReferenceError` on every real invocation, pre-existing since PR #303.
  `AGENTS.md`'s "Supabase deployment workflow" section now documents the
  manual-deploy fallback and treats auto-deploy as something to verify
  every time, not trust.
- **P3-A item 3 (`generate-meeting-recurrence` auth, L10 #25) done and
  merged.** Live schema review found the RLS policies on
  `eos_meeting_recurrences`/`eos_meeting_occurrences` already fully enforce
  per-tenant facilitator/eos-admin authorization on every write
  (`WITH CHECK` against `is_eos_admin`/`can_facilitate_eos`/
  `is_super_admin`) — the flagged gap was a missing application-layer gate,
  not an open write path. Added `requireCaller(req,
  FeatureKeys.staffMeetings)` before any DB access, plus a server-side
  check that the caller-supplied `tenant_id` actually matches the
  referenced `meeting_id`'s real tenant (RLS's `WITH CHECK` only verifies
  authorization *for* the supplied `tenant_id`, not that `meeting_id`
  genuinely belongs to it). Deliberately kept the existing RLS-backed
  forwarded-JWT client for the writes themselves — no switch to a
  service-role client, so the finer-grained facilitator/eos-admin boundary
  is unchanged. Added `auth-gate.test.mjs`; manually deployed (Edge
  auto-deploy still unreliable, see the finding above) and live-verified
  against production using the SuperAdmin persona (this feature is
  Vivacity-staff-only, `/eos/*` — Demo RTO's client persona has no access
  to it; correction to this entry's original wording, which incorrectly
  said Demo RTO) with test data cleaned up afterward.
- **P6-B "title extraction pair" cohort retargeted into a retirement.**
  Both this section's §8 packet definition and the underlying candidate
  writeups (`phase-2-6-next-candidate-packets-2026-09-04.md`,
  `dead-code-feature-consolidation-investigation-2026-09-04.md`) assumed
  `extract-note-title` and `extract-suggest-title` were a live near-duplicate
  pair needing consolidation. Reachability triage (the required
  deployed-caller inventory these docs called for, but that had never
  actually been done) found `extract-suggest-title` has zero callers in
  `src/` or `supabase/functions/**` and zero logged invocations — it was
  added alongside a "suggestion tables and RBAC" feature whose UI never
  got wired to AI-assisted titling. There was no clone pair to consolidate.
  Retired `extract-suggest-title` outright (source + `supabase/config.toml`
  entry removed); `extract-note-title` (5 real callers) is untouched — no
  consolidation needed for a single remaining function. The live Supabase
  function stays deployed and ACTIVE (no `delete_edge_function` MCP tool
  available this session) but is now unreachable from any code path;
  manually deleting it via the dashboard is a disclosed follow-up, not
  done here.
- **P3-A item 3 / L10 #25's "Demo RTO" wording corrected.** That entry and
  this doc's own progress-log line for it originally said the live
  verification ran against Demo RTO; it actually used the SuperAdmin
  persona, since `generate-meeting-recurrence`/EOS Meetings is
  Vivacity-staff-only and Demo RTO's client persona has no access to it.
  Both entries corrected in the same PR as this retirement.
- **P3-A item 1 (Client Health H0.0) partially done: cron paused, one
  direct consumer contained; the wider RPC/AI/executive graph is
  deliberately out of scope here.** Carl explicitly authorized pausing the
  nightly `run-stage-health-monitor-nightly` cron (job 15) — "the client
  health will be superseded by the new client health plan, so you can stop
  the cron" — resolving H0.0's one explicit decision gate. Applied via a
  guarded, allowlisted migration (unschedules only that job by name,
  refuses on ID reuse, postflight-verified); `stage_health_snapshots` and
  the `run-stage-health-monitor` Edge Function are retained as evidence,
  not dropped. Audit entry:
  `docs/audit-log/entries/2026-09-07-pause-stage-health-monitor-cron.md`.
  Also contained the one component confirmed as a direct, standalone
  frontend consumer of the raw metric — `PortfolioHealthWidget.tsx` — which
  now shows an explicit "unavailable — data repair in progress" message
  instead of computing healthy/at-risk/critical percentages from
  known-defective data, and no longer queries `stage_health_snapshots` at
  all. **Deliberately not touched in this pass:** the plan doc's own §4
  "current product and request graph" lists a much wider consumer set —
  `v_dashboard_attention_ranked` (25% stage-weighted, feeds the whole
  `/triage-dashboard`), `rpc_portfolio_client_health()` in `MainDashboard`,
  staff Ask Viv's portfolio fact builder, `ask-viv-assistant`,
  `compliance-assistant`, and executive health/consultant-distribution
  views. Containing those correctly needs the H0.1-style characterization
  work the plan itself calls for (exact formulas, defaults, fallbacks,
  caller permissions per consumer) before a safe "unavailable" swap can be
  written for each — attempting that in the same pass as a single-widget
  fix would risk silently changing AI-generated content or executive
  reporting behavior without the evidence base the plan requires. Left as
  a properly scoped follow-up, not guessed at.
- **P6-B `useStageQualityCheck` evaluator cohort done.** Extracted the
  shared A-E structure/team-task/client-task/email/document checks from
  `useStageQualityCheck.tsx` (745 LOC, two near-duplicated pipelines) into
  a pure `stageQualityEvaluator.ts` with no Supabase calls, used by both
  the live dashboard hook and the `computeStageQuality` certification
  guardrail. Preserved both real behavioral differences the plan's own
  candidate writeup didn't fully characterize: (1) the hook shows a
  generic "Emails"/"Documents linked" pass check for stage types outside
  the categories that specifically require them, which the certification
  guardrail deliberately omits (`includeGenericEmailPass`/
  `includeGenericDocumentPass` options); (2) the "certified integrity"
  self-check (section F) is display-only, appended by the hook after
  calling the shared evaluator, and intentionally not part of
  `computeStageQuality` — that function IS the certification gate, so
  checking "is this already-certified stage still passing" would be
  circular. Both call sites' own Supabase-fetch logic is otherwise
  untouched (same queries, same tables, same package/template branching).
  Added 29 parity fixture tests (`stageQualityEvaluator.test.ts`) per the
  plan's own gate ("No focused fixtures currently exist; add parity
  fixtures first") covering every check category and both option
  combinations. All 4 real call sites (`PublishStageDialog.tsx`,
  `StageQualityPanel.tsx`, `useStageSimulation.tsx`,
  `AdminStageDetail.tsx`) import unchanged names/shapes — no caller edits
  needed.
- **P6-B network-status island retired.** `NetworkStatusIndicator.tsx` +
  `useNetworkStatus.ts` (302 LOC): zero repo-wide references beyond the two
  files themselves, created in the same original commit and never mounted
  anywhere despite the component's own docstring suggesting
  `AuthenticatedLayout`/`App.tsx`. Pure browser-API code (`navigator.onLine`,
  Network Information API) — no server/RPC/Edge Function dependency, so
  none of the caution this cohort's sibling islands need (SharePoint,
  Workboard, Reassignment, Compliance-score all have live backend ties per
  `dead-code-feature-consolidation-investigation-2026-09-04.md` §3.2).
  **SeatCard display core explicitly not started** — the packet itself
  gates it behind independent Playwright drag-and-drop coverage for both
  `SeatCard`/`DraggableSeatCard` interactive contexts, which doesn't exist
  yet; building that test infrastructure is its own scoped prerequisite,
  not something to improvise inside a consolidation PR.
- **P6-B "old standalone UI" pair retired.** `client/BulkUploadDialog.tsx`
  (345 LOC) and `dashboard/WeekTasksTable.tsx` (250 LOC): zero repo-wide
  references to either beyond the files themselves, no exclusive backend
  objects (the dialog's one Supabase call is a shared `package-documents`
  storage upload; the table's calls are plain reads on shared tables).
  **Process-integrity finding surfaced by this reachability check:**
  `WeekTasksTable`'s only caller was deleted 2026-08-27 (`c1dcf097f`), but
  a 2026-09-06 PR (#842) explicitly claimed "fresh reachability confirmed
  `WeekTasksTable` is active on `/dashboard`" with a claimed Playwright
  pass — `/dashboard` is served by `MainDashboard.tsx`, which never
  imported it. The component had been orphaned for 10 days when that
  claim was made. Corrected in `execution-efficiency-log.md` and
  `codebase-optimization-plan-2026-08-28.md`'s own PR #842 entries — not
  silently absorbed. This is the same class of gap as PR #0-C's
  `usePackageUsage.tsx` correction earlier in this plan: a "confirmed
  live" claim that reachability triage later disproved.
- **P6-B zero-inbound UX/platform artifacts cohort (5 of 7) retired.**
  `useDevOverflowWarning.ts` (dev-only overflow diagnostic, no-op in
  production), `engagement-guardrails.ts` (pure celebration-governance
  validation logic), `useYouveGotMailToast.tsx` (read-only against the
  shared `conversation_participants`/`tenant_messages` tables — deleting
  the frontend hook doesn't retire either table), `useProgressAnchors.ts`
  (read-only against the shared `v_phase_actions_remaining`/
  `v_progress_anchor_inputs` views, same reasoning), and
  `stage-registry.ts` (pure TypeScript type re-exports, zero runtime
  code). All confirmed zero repo-wide references beyond their own files.
  **Deliberately not touched:** `useClientAICompanion` (calls server
  objects per the register's own caution — an orphaned frontend caller is
  not server-object retirement evidence) and `StandardsPicker.tsx` (may
  represent roadmap intent, needs a product decision) — both correctly
  excluded per the register's existing dispositions, not overlooked.
- **P6-B Workboard UI island retired.** `AddWorkboardItemDialog.tsx`,
  `WorkboardBoardView.tsx`, `WorkboardItemDrawer.tsx`,
  `WorkboardListView.tsx`, and `useClientWorkboard.tsx` (1,765 LOC): zero
  repo-wide references to any of the 5 beyond their own internal
  cross-imports — no page or route renders any of the 4 view components.
  **Caution satisfied, not skipped:** `client_action_items`/
  `client_action_item_comments` (the tables this hook reads/writes) are
  genuinely still live — `ClientActionItemsTab.tsx`, `ClientTasksPage.tsx`,
  `TasksManagement.tsx`, several KPI-v2 components, and the Ask Viv fact
  builder's backend all read the same tables through a completely
  different, active UI. This is a superseded duplicate feature, not dead
  database infrastructure. **Also resolves `AddWorkboardItemDialog.tsx`'s
  long-standing P5-A item 2 reachability question** (carried since Phase
  2.5 closeout as one of the residual 3 `no-explicit-any` findings) —
  confirmed genuinely dead rather than typed.
- **P6-B SharePoint document-link UI island retired (frontend only).**
  `LinkedDocumentsList.tsx`, `SharePointDocumentPicker.tsx`,
  `useDocumentLinks.tsx` (1,088 LOC): the cluster's only entry point had
  zero repo-wide references beyond its own internal cross-imports.
  **The caution's own instruction — "do not infer the endpoint or
  `document_links` is unused" — was checked against production data, not
  inferred:** `document_links` has 0 rows, ever, while
  `document_stage_links` (the table the live document-stage-linking
  feature actually uses) has 678 real rows. Retired the 3 frontend files
  only; the `link-sharepoint-document` Edge Function and the empty
  `document_links` table were deliberately left untouched — their own
  retirement needs separate Edge/schema authorization, not inferred from
  a frontend-only cleanup.
- **P6-B abandoned bulk-generation steps retired.** `PackageFilterStep.tsx`,
  `ScopeStep.tsx`, `StageDocFilterStep.tsx`, `useTenantSharepointStatus.ts`
  (386 LOC). **Caution satisfied, not skipped:** confirmed the active
  targeted bulk-generation flow is `TargetedMode.tsx` (imported by the live
  `BulkGenerateNew.tsx`, reached from `BulkGenerateButton.tsx`'s
  `/manage-documents/bulk-generate/new` link), and that `BulkGenerateNew.tsx`
  imports only `TargetedMode` — no reference to any of the 4 retired files,
  confirming the older step-wizard was fully superseded, not one of two
  live variants. All 4 files' Supabase calls are plain reads on shared core
  tables (`packages`, `tenants`, `stages`, `tenant_sharepoint_settings`) —
  no exclusive backend object retired.
- **P6-B Reassignment island retired.** `ReassignConsultantDialog.tsx`
  (129 LOC), `useConsultantAssignment.tsx` (228 LOC). **Caution satisfied,
  not skipped:** confirmed active CSC assignment contracts are preserved
  — `BulkReassignCscDialog.tsx` (live, imported by `ManageTenants.tsx`) is
  a completely independent implementation that doesn't use
  `useConsultantAssignment.tsx` at all. `ReassignConsultantDialog.tsx`'s
  only caller was actually removed 2026-08-27 (`235c3a3ce`), predating a
  later claim in `codebase-optimization-plan-2026-08-28.md` (batch 9a)
  that Playwright "verified live... the Reassign Consultant dialog" —
  **corrected there**, since that claim almost certainly conflated this
  dead dialog with the similarly-named, genuinely-live
  `BulkReassignCscDialog.tsx` typed in the same batch (the same class of
  gap as the earlier `WeekTasksTable` correction). Per this cohort's own
  instruction, removed the dead duplicated staff-listing predicate from
  `docs/kb/handoffs/rbac-v6-gate-closure-plan.md`'s census of files
  needing future `useListableStaff()` migration (9→8 files), rather than
  migrating dead code.
- **P6-B Compliance-score island retired (frontend only).**
  `ComplianceScoreBreakdown.tsx` (146 LOC), `useComplianceScore.ts`
  (115 LOC). **The caution's own instruction — "do not infer its backing
  view or RPC is dead" — was checked against production data, not
  inferred:** `compliance_score_snapshots` (the table `v_compliance_score_
  latest` reads and `calculate_compliance_score` RPC writes) has 0 rows,
  ever, and no `cron.job` invokes the RPC. This feature has never actually
  computed a score for any tenant/package from any path — no frontend
  caller, no cron, no data. Retired the 2 frontend files only;
  `calculate_compliance_score`, `v_compliance_score_latest`, and the
  empty `compliance_score_snapshots` table are deliberately left
  untouched — their own retirement needs separate Edge/schema
  authorization.
- **P6-B `usePackageUsage.tsx` + `useCompletionEligibility.ts` retired; a
  real stale-worktree process-integrity finding surfaced along the way.**
  `usePackageUsage.tsx` (266 LOC): zero repo-wide imports; its "compare
  behavior before retirement" caution was checked, not skipped — the live
  `usePackageUsageQuery.tsx` calls the identical three RPCs
  (`rpc_get_package_usage`, `rpc_check_package_thresholds`,
  `rpc_dismiss_alert`), and `useTenantPackages.ts` also shares them,
  confirming true functional supersession. While verifying this, the
  dead-code register's own §7bis (dated 2026-09-05) was found to contain
  **two wrong "confirmed live" corrections** — for this exact
  `ComplianceScoreBreakdown`/`useComplianceScore` pair (already retired
  earlier today, before this contradiction was caught) and for
  `useCompletionEligibility.ts` (claimed live via `useCompletionCascade.ts`).
  Root cause: §7bis's checks were run against commit `a0cf450b5`, labeled
  as "current `origin/main`" but actually the exact commit the still-open
  `.claude/worktrees/any-retirement-batch6` worktree (branch
  `hotfix/p2p5-any-batch84`) sits on — a branch cut *before* 2026-08-27's
  dead-code batches 4/12 and 11/12 deleted every one of §7bis's claimed
  live callers (`useCompletionCascade.ts`, `ComplianceScoreCard.tsx`,
  `CompletionSummaryModal.tsx`). Both `git merge-base --is-ancestor` checks
  against those deletion commits and fresh repo-wide greps confirmed all
  three files were genuinely dead. Corrected §7bis, the dependent
  `execution-efficiency-log.md` note, and this plan's own earlier P6-B
  entry accordingly — a third, distinct false-verification root cause this
  session (stale/diverged worktree mistaken for `origin/main`, not the
  earlier two sessions' "already-removed caller, claim made later
  anyway" pattern). `useCompletionEligibility.ts` (39 LOC) retired
  frontend-only; its `v_completion_eligibility` view is untouched. **Flagged,
  not chased further:** the same §7bis section's `StageCellEditor`/
  `MembershipGrid.tsx` finding from the same timeframe hasn't been
  independently re-verified and could carry the same risk — noted as
  unconfirmed in the register rather than assumed correct or re-checked
  under this already-large batch.
- **P6-B `usePortfolioCockpit.ts` retired, decision preserved.** Zero
  repo-wide imports; its consumer `PortfolioTable.tsx` and the related
  `ConsultantAssignmentCard.tsx` were already deleted 2026-08-27 (dead-code
  batches 8/12 and 11/12) — independently confirmed orphaned even earlier,
  in `docs/audit-log/entries/2026-07-27-csc-assignment-silent-failure.md`,
  predating and unrelated to this session's stale-worktree §7bis findings.
  Per this cohort's own instruction, the old policy this hook encoded
  (restricting the portfolio view to a non-staff user's own assigned-CSC
  tenants) is preserved in the dead-code register rather than lost with
  the code — current live behavior (the real triage dashboard) shows the
  full portfolio to all staff, a deliberate difference from this old,
  unreachable model. All of its Supabase calls are on shared
  views/tables also used by the live triage dashboard — no backend object
  retired.
- **P6-B `useStageReleases.tsx` retired, backend objects confirmed
  partially live.** Zero repo-wide imports (fresh check in this batch's
  own worktree, not carried over from an earlier one — see the §7bis
  stale-worktree lesson above). Its "calls server objects" caution was
  checked, not skipped: `create_stage_release`, `release_to_tenant`, and
  `generate-release-documents` have no other frontend caller and their
  liveness is unconfirmed either way, but `send-stage-email` **is** still
  called elsewhere (`src/hooks/useEmailTemplates.tsx`, direct `fetch` to
  the Edge Function URL) — confirming the caution's exact concern, not a
  hypothetical one. Retired the frontend hook only; the
  `stage_releases`/`stage_release_items` tables, the two RPCs, and both
  Edge Functions are all deliberately left untouched pending their own
  backend-impact review.
- **P6-B `useMeetingSeries.tsx` retired, live replacement confirmed.**
  Zero repo-wide imports, fresh check in this batch's own worktree. Its
  "calls server objects" caution was checked, not skipped: the
  `eos_meeting_series` table has real production data (8 rows, no cron
  job references it) and all 5 RPCs it called (`create_meeting_series`,
  `update_meeting_series`, `generate_series_instances`,
  `start_meeting_instance`, `complete_meeting_instance`) have no other
  frontend caller — none of that backend was touched. Sibling comparison
  found `useEosConfigMeetingActions.tsx` (Stage 2 "type + date only"
  scheduling, M6/M8 migrations) is the live functional replacement — it
  calls `create_meeting_from_configuration`/`sync_meeting_to_configuration`/
  `skip_meeting_occurrence` and invalidates the same `eos-meeting-series`/
  `eos-meetings` query keys, the same supersession pattern as
  `usePackageUsage`→`usePackageUsageQuery`. The shared `eos_meetings`
  table this hook also read is untouched and remains heavily used
  elsewhere (`useNextMeeting`, `useEosReadiness`, `useEosHealth`,
  `LiveMeetingView.tsx`, etc.).
- **Not yet started:** P2 (depends on P1-C steps 6–7, blocked on Carl's
  infra decision), P3-A item 2, the rest of P3-A item 1 (the wider
  consumer graph above), P4-D, `InviteUserDialog.tsx`'s bounded
  cross-schema adapter (P5-A item 3), the rest of P6-B (SeatCard display
  core — blocked on missing Playwright coverage; the empty
  `document_links`/`compliance_score_snapshots` tables and their Edge/RPC
  functions' own retirement decisions; the unverified `StageCellEditor`
  dead-export finding; the remaining "data/workflow
  hooks" in the
  zero-inbound queue: `useMeetingMinutes`/
  `useKpiReview`/`useAISuggestions`/`useEosDrafts`/`useDocumentScan`/
  `useEngagementAudit`
  — each has its own caution note requiring a
  server-object/sibling-comparison/policy-preservation check before
  touching, `useClientAICompanion`, `StandardsPicker.tsx`), P7 — several
  of these require live-schema investigation, product/security decisions,
  or their own separately
  authorized packets per §1's rules.

Current `origin/main` state after all merges to date (P0/P1/P4-A/P6-A/P1-C
steps 1–5): 128 errors (all `no-explicit-any`), 43 warnings, 240 routes/0
duplicates, typecheck 0 errors. The P6-A retirement's own drop from 166→128
errors and 243→240 routes reflects the retired page's own `any` findings
and its 3 removed routes, not a regression. **All three P5-A batches
(#967, #968, #970), P4-B/P6-B (#975), and P4-C (#976) have now merged** —
this brings the count to 3 (128 minus 125 across the three P5-A batches) —
the residual 3 being `generate-meeting-recurrence` (1, deliberately
excluded from typing scope, tied to its own L10 #25 auth-review packet —
that packet's auth gate was added in P3-A item 3/PR #979, but the file's
`catch (error: any)` itself was left untouched as out of scope for a
security-only fix) and `InviteUserDialog.tsx`/`AddWorkboardItemDialog.tsx`
(2, per §8's own P5-A item 2-3). **`AddWorkboardItemDialog.tsx`'s
reachability question is now resolved**: retired 2026-09-07 as part of
P6-B's Workboard UI cluster retirement (§3.2) — confirmed genuinely dead,
zero repo-wide references, with a live successor UI
(`ClientActionItemsTab.tsx`) still managing the same `client_action_items`
table. `InviteUserDialog.tsx`'s bounded cross-schema adapter remains not
started. The route count (240) and
retirement history above are current as of the P4-B/P6-B retirement noted
above — this whole paragraph's error/warning counts are otherwise a
snapshot around #970's merge and not re-verified against every later commit;
re-run `npm run lint:ratchet`-adjacent full-repo lint before trusting the
exact numbers if it's been a while.

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

**Status (2026-09-07): done, pending merge.** #5 and #8 fixed via the
two-step-fetch pattern (batched `Map` lookups, `pg_constraint`-verified no
real FK exists, matching the pattern `GeneratedDocumentsTab.tsx` already
used). #17 turned out to be dead code — see the P6-B retirement below and
`dead-code-feature-consolidation-investigation-2026-09-04.md` §7quater; no
separate fix was made or is needed. Live evidence: #5's fixed query and
#17's retirement redirects verified with zero console errors; #8's dialog
could not be opened live (`package_stage_documents` has zero non-deleted
rows in production for any stage right now — pre-existing, unrelated to
this PR) so it rests on static verification only, disclosed as a coverage
gap.

### Packet P4-C — identity and lookup reads

Investigate and fix Process Audit Log (#20), Edit/Add Time person lookup (#21), and the unnumbered `AddTimeDialog` missing-parent-column issue. Confirm the actual identity columns and joins from the live schema before editing.

**Stop condition:** if the correct identity model is unclear, produce a decision packet instead of guessing.

**Status (2026-09-07): done, pending merge.** All three fixed — none needed
a decision packet, the correct identity model was confirmed live via
`pg_constraint`/`pg_get_functiondef` in every case:
- **#20** (`useProcessAuditLog`): two-step fetch against `public.users` by
  `user_uuid` (kept in sync with `auth.users.id` by the
  `link_auth_user_to_profile` trigger), matching `useStageAuditLog.tsx`'s
  existing pattern for the same actor-resolution problem.
- **#21** (`EditTimeDialog.tsx`/`AddTimeDialog.tsx`): fixed the wrong
  `tenant_users.user_uuid` → `user_id` column, plus a second bug found
  alongside it — `EditTimeDialog.tsx`'s "Person" select was wired to the
  wrong state (`vivacityStaff` instead of the already-merged `teamMembers`),
  so even a correct query would never have surfaced tenant contacts there.
- **`AddTimeDialog` note-insert** (unnumbered, L10's "also found" list):
  `notes.client_id`/`package_instance_id` aren't real columns; replaced
  with the real `parent_type`/`parent_id`/`package_id` shape, matching the
  existing convention in `useNotes.tsx`'s `createNote` and
  `ClientStructuredNotesTab.tsx` — an existing established mapping, not a
  guess.

Live-verified on Demo RTO (tenant 7547): #20 against a real process with 10
audit entries; #21's Person/Notify dropdowns now list all 7 real tenant
contacts; the note-insert fix end-to-end (real time entry + linked note
created, verified via SQL, then deleted). Zero console errors throughout.
Full detail: `l10-real-bugs-found-2026-09-04.md` items #15/#20/#21 and the
execution-efficiency log's P4-C entry.

**Parked, not part of this packet:** live-verifying these dropdowns
surfaced that `public.users` person-pickers list system/bulk-operation/
test accounts unfiltered alongside real people (e.g. "Bulk Generate",
"Test", "Ghost", "K_Account" all appeared next to real staff/tenant
contacts in the Notify dropdown). Logged as RBAC v6 plan §13 item 14 — a
council-scoped decision, explicitly deferred by Carl, not actioned here.

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

**Cohort done, 2026-09-07 (surfaced by P4-B, not from the named-cohort list
above): `/tenant/:tenantId/document(s)...` route tree.**
`TenantDocuments.tsx`, `TenantDocumentsHub.tsx`, `TenantDocumentDetail.tsx`,
`TenantDocumentDetailWrapper.tsx` + 3 routes retired as zero-inbound —
exhaustive `navigate()`/`Link to=`/route-manifest sweep found no real entry
point, and the live equivalent (`ClientDetail.tsx`'s embedded Documents
tab) was already fixed independently. Full writeup:
`dead-code-feature-consolidation-investigation-2026-09-04.md` §7quater.
Before/after metrics: 1,727→1,724 tracked files, 490,147→489,187 physical
lines (−960). No backend object removed — `documents`,
`document_versions`, `document_stage_links` all remain live schema used by
the real equivalent.

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

- Production has 24 active `pg_cron` jobs after M2 retired three legacy audit
  schedules. The remaining jobs are a mixture of healthy maintenance and
  partially working forecast/health jobs.
- The persistent `tenant-isolation-qa` preview branch is reusable, but it is
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

**Artifact:** [Cron and Migration Inventory — 2026-09-07](../codebase-state/cron-and-migration-inventory-2026-09-07.md)
and its [machine-readable companion](../codebase-state/cron-and-migration-inventory-2026-09-07.json).

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
documented in [Migration safety guardrail — 2026-09-07](../codebase-state/migration-safety-guardrail-2026-09-07.md).

### Packet M2 — controlled retirement of legacy audit jobs

After product-owner confirmation, add one idempotent corrective migration or
controlled Supabase operation that unschedules jobs 4, 5 and 6 and records the
reason. Guard the operation for environments where `cron` is absent, and
postflight-assert that the named jobs are gone. **Completed 2026-09-07:** the
production migration is recorded as `retire_legacy_audit_cron_jobs`; postflight
found zero retired jobs and 24 active jobs. Historical run records remain.

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
longer exist and that both legacy tables are unchanged. **Completed
2026-09-07:** migration `retire_legacy_audit_functions` was applied and
postflight passed; no table, outbox, or cron state changed.

#### M3-B — retire dormant queue references

Remove the three audit-only insert branches from `send-automated-email` and
retire the deployed `process-notification-queue` worker through a separately
reviewed Edge change (no cron job or frontend caller exists). Run Edge tests,
lint ratchet, typecheck, build, and a read-only function health check. Do not
drop `notification_schedule` in the same Edge deployment.

#### M3-C — drop `notification_schedule` only after a quiet-period proof

After M3-B, verify no deployed function, migration, trigger, view, or frontend
caller references the table; confirm zero rows and zero recent access/error
evidence; then apply a separately authorized, reversible migration to drop the
table and its indexes/policies. Postflight must assert the relation is absent
and that `notification_audit_log` and `notification_outbox` remain intact.

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
Execute docs/kb/reference/phase-2-6-stabilization-and-claude-execution-plan-2026-09-07.md one packet at a time from fresh origin/main worktrees. Begin with P0 truth sync and open-PR disposition; preserve PR #612’s unique dashboard-timeout evidence before closing it. Treat M0–M6 as the cron/migration safety track that must precede P1-C's QA credential and workflow. Do not merge unattended. For every implementation PR, perform reachability and generated-schema checks, acquire the shared heavy-command lock, run lint:ratchet, typecheck, frontend tests, Edge tests, build, and the applicable KB/routes/Playwright checks. Keep database, RLS, RPC, grant, permission, tenant-scope, cron, migration and production-data work separately authorized. Never place a production service-role key in ordinary CI. Update the L10, residue, cron inventory and execution ledgers as evidence changes. Stop on ambiguous authorization, schema, ownership, product, or browser evidence and report the exact decision required.
```
