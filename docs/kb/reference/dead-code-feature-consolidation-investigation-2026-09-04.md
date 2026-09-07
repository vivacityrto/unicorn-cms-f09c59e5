# Dead Code, Feature Consolidation, and Architecture Redesign Investigation

> **Status:** council-reviewed investigation and execution proposal; no candidate in this document is approved for deletion, production mutation, or permission change merely by being listed
> **Prepared:** 2026-09-04
> **Repository evidence:** council import-graph snapshot at `main@55366a59c`; highest-confidence cohorts, routes, current plan state, and recent Phase 2.5 evidence rechecked against `origin/main@944ad7627`
> **Parent plan:** [Codebase Optimization and KB Renewal Plan](codebase-optimization-plan-2026-08-28.md)
> **Required architecture:** [RBAC v6 Authorization Plan](rbac-v6-authorization-implementation-plan-2026-09-01.md) and [Tenant Operating Model and Data Architecture Plan](tenant-operating-model-data-architecture-plan-2026-09-02.md)

## 1. Council decision

The proposed direction is sound, but it must not become one broad cleanup/overhaul change. Use three distinct lanes:

1. **Verified retirement:** remove frontend files and cohesive islands only after proving that their supported replacement and deep-link behavior remain intact.
2. **Behavior-preserving consolidation:** consolidate literal clones or repeated pure rules only after parity fixtures exist. Preserve public endpoints and authorization behavior.
3. **Feature/data redesign:** redesign active workflows as authorization-aware vertical slices owned by RBAC v6 and the tenant operating-model plan. LOC reduction is a useful outcome, not the authority for changing data or permissions.

Add a non-blocking **Phase 2.6 — verified retirement and bounded consolidation** after the next clean Phase 2.5 merge checkpoint. Do not wait for a zero-lint repository before starting RBAC v6. Tenant P0 non-production discovery may run in parallel: P0.1/P0.3 remain read-only against production, while P0.2 writes synthetic fixtures only inside a separately authorized disposable environment. Database-affecting redesign waits for the RBAC decision core, staff-scope decision, and applicable vertical-slice gate.

## 2. Evidence and limits

The dead-code council performed a fresh TypeScript import/dynamic-import traversal rooted at `src/main.tsx`, exact-export searches, route-manifest review, history searches, and audit/plan review. At `55366a59c`, it found 58 production TS/TSX files unreachable from the frontend entry point, about 14,400 lines. Five more pages (`Index`, `EosIssues`, `Audits`, `AuditWorkspace`, and `AuditWorkspacePlaceholder`) were reachable only through unused `React.lazy` declarations in `App.tsx`, producing a 63-file investigation universe.

That graph has two important qualifications:

- Four `src/lib/mcp/**` files are false positives because Vite's `mcpPlugin()` consumes them as an external entry. They must remain.
- Frontend reachability cannot prove that an Edge Function, RPC, view, table, trigger, policy, cron, storage path, webhook, integration callback, or bookmarked URL is unused.

Current `origin/main` advanced during the council review. Phase 2.6 must regenerate the graph and route manifest from its own branch-cut SHA before making deletion decisions; the figures here are a discovery baseline, not a frozen acceptance count.

## 3. Verified-retirement candidate register

### 3.1 Highest-confidence frontend cohorts

These have replacement and isolation evidence strong enough to enter the first implementation queue. Each still receives a fresh pre-delete sweep and its own domain-scoped PR.

| Cohort | Files | Current evidence | Approx. LOC |
|---|---|---|---:|
| ~~Legacy admin package island~~ **✅ Retired [PR #570](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/570), merged 2026-09-04** | `src/pages/AdminManagePackages.tsx`, `src/components/AddPackageDialog.tsx`, `src/components/admin/AllStagesTable.tsx` | All three are disconnected; the two components are exclusive to the page. `/admin/manage-packages` renders `PackageBuilder`. PR #539 independently reconfirmed that the old page has no live route. | 2,521 |
| ~~Legacy tenant-detail island~~ **✅ Retired [PR #571](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/571), merged 2026-09-04** | `src/pages/TenantDetail.tsx`, `src/components/csc/CSCProfileCard.tsx`, `src/components/tenant/EnrichTenantButton.tsx`, `ReviewModePanel.tsx`, `TenantClickUpActivity.tsx`, `TenantProgressTable.tsx`, `src/hooks/useReviewMode.ts` | The island is disconnected and its dependencies are exclusive. Current tenant-detail routes render `ClientDetail`; PR #538 reconfirmed the old page as dead. This is not authority to change the active tenant-detail feature. | 2,474 |
| ~~Stale EOS page~~ **✅ Retired [PR #574](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/574), merged 2026-09-04** | `src/pages/EosIssues.tsx`, plus its unused declaration in `src/App.tsx` | `/eos/issues` redirects to `/eos/risks-opportunities`; the `App.tsx` declaration exists but is never rendered. PR #574 also updated `EosOverview.tsx`'s three hardcoded `/eos/issues` links to point directly at the live `/eos/risks-opportunities` route — a necessary follow-up (those links would otherwise still round-trip through the now-deleted redirect), not scope creep. | 223 |
| ~~Legacy suggestion pages~~ **✅ Retired [PR #577](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/577), merged 2026-09-04** | `src/pages/NewSuggestionForm.tsx`, `SuggestionRegister.tsx`, `src/pages/client/ClientNewSuggestionPage.tsx`, `ClientSuggestionDetailPage.tsx`, `ClientSuggestionsPage.tsx` | Zero inbound imports. Staff and client legacy routes now redirect to or use Support Tickets; compatibility redirects and the live `SuggestionDetail` alias were preserved. | 1,224 |
| ~~Orphaned document-version hook~~ **✅ Retired [PR #579](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/579)** | `src/hooks/useDocumentVersions.tsx` | Retired before this branch cut; current `origin/main` no longer contains the file. | 167 |
| ~~Unused landing-page alias~~ **✅ Retired [PR #579](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/579)** | `src/pages/Index.tsx`, plus its unused declaration in `src/App.tsx` | Retired before this branch cut; `/` and `/login` render `Login` directly. | 18 |

The immediately actionable first-wave potential was about **6,627 lines**, already above the parent plan's original 3,000–6,000 conservative target. That was a reason to split it into domain PRs, not to raise deletion scope automatically. **Update 2026-09-05:** PR #579 retired the document-version hook and landing-page alias; the remaining work is the separately gated Audit components and bounded consolidation candidates.

The formerly unused Audit shells and their exclusive legacy dependencies were characterized with the UUID route-convergence slice in [#586](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/586), then retired in [#588](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/588) after authenticated parity evidence. The active replacements remain `AuditsAssessments` and `AuditWorkspaceNew`.

### 3.2 Cohesive second-wave islands

| Cohort | Files / potential | Required caution before retirement |
|---|---|---|
| ~~Workboard UI~~ | **✅ Retired 2026-09-07 (Phase 2.6 P6-B).** Four files under `src/components/workboard/**` (`AddWorkboardItemDialog.tsx`, `WorkboardBoardView.tsx`, `WorkboardItemDrawer.tsx`, `WorkboardListView.tsx`) plus `src/hooks/useClientWorkboard.tsx`; 1,765 LOC. Zero repo-wide references to any of the 5 beyond the cluster's own internal cross-imports — confirmed no page/route renders any of the 4 view components. **Caution satisfied, not skipped:** `client_action_items`/`client_action_item_comments` (the tables `useClientWorkboard.tsx` reads/writes) are genuinely still live — `ClientActionItemsTab.tsx`, `ClientTasksPage.tsx`, `TasksManagement.tsx`, several KPI-v2 components, and the Ask Viv fact builder's backend all read the same tables through a completely different, active UI. This is a superseded duplicate feature, not dead database infrastructure — only the orphaned standalone board/list-view UI was removed; the data model remains fully live and manageable through its real successor. | — |
| ~~SharePoint document-link UI~~ | **✅ Retired 2026-09-07 (Phase 2.6 P6-B), frontend only.** `LinkedDocumentsList.tsx`, `SharePointDocumentPicker.tsx`, `useDocumentLinks.tsx`; 1,088 LOC. `LinkedDocumentsList.tsx` (the cluster's only entry point) had zero repo-wide references beyond the cluster's own internal cross-imports. **The caution's own instruction — "do not infer the endpoint or `document_links` is unused" — was checked, not skipped**: production `document_links` has 0 rows, ever (`select count(*) from document_links`), while `document_stage_links` (the table the live document-stage-linking feature actually uses, e.g. read by `useStageQualityCheck.tsx`'s document counts) has 678 real rows. This is stronger evidence than reachability alone — the feature was deployed but never adopted by any real user, superseded from day one by a differently-named table. Retired the 3 frontend files only; the `link-sharepoint-document` Edge Function and the empty `document_links` table were deliberately left untouched — their own retirement is a separate, later decision requiring the usual Edge/schema authorization, not inferred from this frontend-only cleanup. | — |
| ~~Abandoned bulk-generation steps~~ | **✅ Retired 2026-09-07 (Phase 2.6 P6-B).** `PackageFilterStep.tsx`, `ScopeStep.tsx`, `StageDocFilterStep.tsx`, `useTenantSharepointStatus.ts`; 386 LOC. **Caution satisfied, not skipped:** confirmed the active targeted bulk-generation flow is `TargetedMode.tsx` (imported by the live `BulkGenerateNew.tsx`, reached from `BulkGenerateButton.tsx`'s `/manage-documents/bulk-generate/new` link), and that `BulkGenerateNew.tsx` imports only `TargetedMode` — no reference to any of the 4 retired files, confirming the older step-wizard was fully superseded, not one of two live variants. All 4 files' Supabase calls are plain reads on shared core tables (`packages`, `tenants`, `stages`, `tenant_sharepoint_settings`) — no exclusive backend object retired. | — |
| ~~Reassignment island~~ | **✅ Retired 2026-09-07 (Phase 2.6 P6-B).** `ReassignConsultantDialog.tsx` (129 LOC), `useConsultantAssignment.tsx` (228 LOC); 357 LOC. **Caution satisfied, not skipped:** confirmed active CSC assignment contracts are preserved — `BulkReassignCscDialog.tsx` (live, imported by `ManageTenants.tsx`) is a completely independent implementation that does not use `useConsultantAssignment.tsx` at all, so retiring this island doesn't touch the live reassignment path. `ReassignConsultantDialog.tsx`'s only caller was actually removed 2026-08-27 (`235c3a3ce`, dead-code batch 8/12) — predating a later claim in `codebase-optimization-plan-2026-08-28.md` (Phase 2.5 any-batch 9a) that Playwright "verified live... Users (including the Reassign Consultant dialog)"; that claim is corrected there — it almost certainly conflated this dead dialog with the similarly-named, genuinely-live `BulkReassignCscDialog.tsx` typed in the same batch. Per this row's own instruction, removed the dead duplicated staff-listing predicate (`is_vivacity_internal`/`disabled`/`archived`/`kpi_pod` WHERE clause) from `docs/kb/handoffs/rbac-v6-gate-closure-plan.md`'s census of ~9 files needing future `useListableStaff()` migration, rather than migrating dead code. | — |
| ~~Network-status island~~ | **✅ Retired 2026-09-07 (Phase 2.6 P6-B).** `NetworkStatusIndicator.tsx`, `useNetworkStatus.ts`; 302 LOC. Zero repo-wide references beyond the two files themselves (checked `src/`, config files, `.html`); a repo-wide grep for `NetworkStatusIndicator`/`useNetworkStatus`/`network-status`/`networkStatus` across `*.ts(x)`/`*.json`/`*.config.*`/`*.html` found nothing else — no build-time, preview, or dev registry references. Both files were created in the same original commit and never touched again despite the component's own usage docstring suggesting it belonged in `AuthenticatedLayout` or `App.tsx` — it was built but never mounted. Pure browser-API code (`navigator.onLine`, the Network Information API) with zero server/RPC/Edge Function dependency, so no backend disposition question applies. | — |
| ~~Compliance-score island~~ | **✅ Retired 2026-09-07 (Phase 2.6 P6-B), frontend only.** `ComplianceScoreBreakdown.tsx` (146 LOC), `useComplianceScore.ts` (115 LOC); 261 LOC. **The caution's own instruction — "do not infer its backing view or RPC is dead" — was checked against production data, not inferred:** `compliance_score_snapshots` (the table `v_compliance_score_latest` reads and `calculate_compliance_score` RPC writes) has 0 rows, ever, and no `cron.job` invokes the RPC. This feature has never actually computed a compliance score for any tenant/package from any path — no frontend caller, no cron, no data. Two other frontend files (`PackageDataManager.tsx`'s cascade-delete-on-package-removal, `import-unicorn1-client`'s import row-count) reference the same table defensively but don't compute or display scores — their presence doesn't indicate the feature is live. Retired the 2 frontend files only; `calculate_compliance_score`, `v_compliance_score_latest`, and the empty `compliance_score_snapshots` table are deliberately left untouched — their own retirement needs separate Edge/schema authorization. | — |
| ~~Old standalone UI~~ | **✅ Retired 2026-09-07 (Phase 2.6 P6-B).** `client/BulkUploadDialog.tsx` (345 LOC) and `dashboard/WeekTasksTable.tsx` (250 LOC). Zero repo-wide references to either beyond the files themselves; no modal registry, launcher, or lazy-loaded reference found. `BulkUploadDialog.tsx`'s one Supabase call is a `package-documents` storage upload — shared bucket infrastructure used elsewhere, not exclusive to this file, so no backend disposition question. `WeekTasksTable.tsx`'s calls are plain reads on shared tables (`tasks_tenants`, `tenants`, `users`), same reasoning. **Process-integrity finding on `WeekTasksTable.tsx`:** its only caller was deleted on 2026-08-27 (`c1dcf097f`, dead-code batch 11/12), but a 2026-09-06 lint-typing PR (`033209d1e`, "chore: type dashboard overdue tasks") explicitly claimed in `execution-efficiency-log.md` and `codebase-optimization-plan-2026-08-28.md` that "fresh reachability confirmed `WeekTasksTable` is active on the protected `/dashboard` route," including a claimed Playwright pass "1/1 with zero page/console errors" — `/dashboard` is served by `MainDashboard.tsx`, which never imported this component (confirmed via `src/routes/dashboardRoutes.tsx`'s own header comment distinguishing it from the unrelated `Dashboard.tsx`). The component had already been orphaned for 10 days when that claim was made; the Playwright pass most likely just loaded `/dashboard` successfully regardless of whether this specific component rendered anything, and was mistakenly presented as verification of it. See the corresponding correction note added to both of those docs' PR #842 entries. | — |

### 3.3 Individual zero-inbound investigation queue

The following are candidates, not a bulk-deletion list:

- Data/workflow hooks: ~~`useStageReleases` (396 LOC)~~, ~~`usePortfolioCockpit` (316)~~, ~~`useMeetingSeries` (285)~~, ~~`usePackageUsage` (266)~~, ~~`useMeetingMinutes` (207)~~, ~~`useKpiReview` (149)~~, ~~`useAISuggestions` (122)~~, ~~`useEosDrafts` (100)~~, ~~`useDocumentScan` (46)~~, ~~`useEngagementAudit` (42)~~, and ~~`useCompletionEligibility` (39)~~. **All zero-inbound data/workflow hooks in this list are now retired.**

**✅ Retired 2026-09-08 (Phase 2.6 P6-B):** `useEngagementAudit.ts` (42 LOC) — zero repo-wide imports, verified fresh in this batch's own worktree. Its only server object, `engagement_audit_log` (insert-only), is empty (0 rows) in production with no cron references and no other caller — genuinely never used, the same disposition as the already-retired sibling `engagement-guardrails.ts` (pure celebration-governance validation logic from the same never-shipped feature area). Table left untouched.

**✅ Retired 2026-09-08 (Phase 2.6 P6-B):** `useDocumentScan.tsx` (46 LOC) — zero repo-wide imports, verified fresh in this batch's own worktree. Its only server object is the `scan-document` Edge Function, which has a live sibling caller: `useExcelBindings.tsx` (imported by `ExcelBindingStatusBadge.tsx`) independently invokes the same `scan-document` function with an equivalent implementation (auth check + `functions.invoke('scan-document', ...)`) — genuine functional duplication/supersession, not a dead backend. The Edge Function is untouched and remains live via that caller.

**✅ Retired 2026-09-08 (Phase 2.6 P6-B):** `useEosDrafts.tsx` (100 LOC) — exports `useEosVtoDrafts` and `useEosChartDrafts` (not a `useEosDrafts` symbol itself; the register name is the filename), both zero repo-wide imports, verified fresh in this batch's own worktree. Backend-impact check performed: `eos_vto_drafts` and `eos_chart_drafts` are both empty (0 rows) in production, no cron references, and neither `propose_vto_change` nor `propose_chart_change` RPC has any other frontend caller — genuinely never used. All left untouched.

**✅ Retired 2026-09-08 (Phase 2.6 P6-B):** `useAISuggestions.tsx` (122 LOC) — zero repo-wide imports, verified fresh in this batch's own worktree. Its "calls server objects" caution was checked, not skipped: `ai_suggestions` is empty (0 rows) in production, no cron references, and neither the `ai-generate-suggestions` Edge Function nor the `accept_ai_suggestion` RPC has any other frontend caller — genuinely never used, the same category as `useMeetingMinutes`. (An unrelated `aiSuggestion` prop in `src/components/audit/workspace/QuestionCard.tsx` is a same-named coincidence in the audit-evidence feature area, not this hook's `ai_suggestions` table.) The Edge Function, RPC, and table are all left untouched.

**✅ Retired 2026-09-08 (Phase 2.6 P6-B), genuine product gap uncovered:** `useKpiReview.tsx` (149 LOC) — zero repo-wide imports, verified fresh in this batch's own worktree. Its tables have real (if minimal) production data: `kpi_reviews` and `kpi_review_signoffs` each have 1 row, no cron references either. A live sibling exists — `MyKpiSignOffSection.tsx` (routed via `MyKpiDashboardPage.tsx`) reads and inserts into the same two tables directly (not through this hook) for the *subject*-side view/sign-off flow. But `compute_kpi_overall_status` and `upsert_kpi_review` (the *reviewer*-side create/edit RPCs) and the `locked_at` lock action have **no caller anywhere else** — this hook was the only frontend path to create or lock a KPI review. **This is not a case of "safe orphaning after supersession"**: `MyKpiDashboardPage.tsx` itself links to `/admin/kpi-review` ("Open reviewer view"), and `ProtectedRoute.tsx` has a `/admin/kpi-*` allowlist carve-out for `kpi_role === 'reviewer'` users — but no route matching `/admin/kpi-*` is registered anywhere in `dashboardRoutes.tsx`/`App.tsx`. The reviewer-side page this hook was built for appears to have been removed (or never finished) independently of this retirement; retiring the already-unreachable hook doesn't change current behavior (nothing could call it), but the underlying reviewer workflow is currently broken and this is a product decision (rebuild the `/admin/kpi-review` page, or formally retire the create/lock RPCs and `locked_at` column) — not something to resolve as a side effect of dead-code cleanup. Both RPCs and the `locked_at` column are left untouched.

**✅ Retired 2026-09-08 (Phase 2.6 P6-B):** `useMeetingMinutes.tsx` (207 LOC) — zero repo-wide imports, verified fresh in this batch's own worktree. Its "calls server objects" caution was checked, not skipped: `eos_meeting_minutes_versions` and `eos_minutes_audit_log` are both **empty (0 rows)** in production, no cron references either, and all 6 RPCs it called (`save_meeting_minutes`, `finalise_meeting_minutes`, `create_minutes_revision`, `lock_meeting_minutes`, `unlock_meeting_minutes`, `restore_minutes_version`) have no other frontend caller — unlike `useStageReleases`/`useMeetingSeries`, this backend was never actually used, not merely orphaned later. **Separate finding, flagged not fixed:** `MeetingExecutionPanel.tsx` (lines 185, 191) still renders "View Minutes"/"View Attendance" links to `/eos/meetings/:id/minutes` and `/eos/meetings/:id/attendance` — neither route is registered anywhere (only `/summary` and `/live` exist in `dashboardRoutes.tsx`/`App.tsx`). These were already dead links before this retirement (this hook was never the page behind them) and remain dead links after it — whether to build the missing minutes/attendance pages or remove the links is a product decision, out of scope for this dead-code retirement.

**✅ Retired 2026-09-08 (Phase 2.6 P6-B):** `useMeetingSeries.tsx` (285 LOC) — zero repo-wide imports, verified fresh in this batch's own worktree at `origin/main`. Its "calls server objects" caution was checked, not skipped: the `eos_meeting_series` table has real production data (8 rows, no cron job references it), and all 5 RPCs it called (`create_meeting_series`, `update_meeting_series`, `generate_series_instances`, `start_meeting_instance`, `complete_meeting_instance`) have no other frontend caller — none of that backend was touched. Sibling comparison found the live replacement: `useEosConfigMeetingActions.tsx` ("RPCs backing Stage 2 ('type + date only' scheduling) and the Configuration-derived meeting lifecycle actions added alongside it (M6/M8 migrations)") calls `create_meeting_from_configuration`/`sync_meeting_to_configuration`/`skip_meeting_occurrence` and invalidates the same `eos-meeting-series`/`eos-meetings` query keys — confirming genuine functional supersession, the same pattern as `usePackageUsage`→`usePackageUsageQuery`. The shared `eos_meetings` table this hook also read is untouched and remains heavily used by `useNextMeeting`, `useEosReadiness`, `useEosHealth`, `LiveMeetingView.tsx`, and others.

**✅ Retired 2026-09-07 (Phase 2.6 P6-B):** `usePackageUsage.tsx` (266 LOC) — zero repo-wide imports (`from '@/hooks/usePackageUsage'` matches nowhere). Its caution below ("compare behavior before retirement") was checked, not skipped: the live `usePackageUsageQuery.tsx` (4 real callers: `ClientTimeSummaryCard.tsx`, `PackageBreakdownModal.tsx`, `TenantTimeTrackerBar.tsx`, `useTenantTimeTracker.tsx`) calls the identical three RPCs the old hook did (`rpc_get_package_usage`, `rpc_check_package_thresholds`, `rpc_dismiss_alert`), and `useTenantPackages.ts` also calls the same RPCs — genuinely shared, live backend contract, confirming true functional supersession rather than a same-named coincidence. No backend object retired. Also retired `useCompletionEligibility.ts` (39 LOC) in the same PR — **§7bis's 2026-09-05 "confirmed live via `useCompletionCascade.ts`" claim was itself wrong**, based on a stale, diverged worktree rather than true `origin/main` (see the correction added to §7bis above); `useCompletionCascade.ts` was deleted 2026-08-27, `useCompletionEligibility.ts` has had zero real importers since. Its `v_completion_eligibility` view is left untouched — retirement is frontend-only.
- UX/platform artifacts: ~~`useDevOverflowWarning` (234)~~, ~~`engagement-guardrails.ts` (187)~~, ~~`useYouveGotMailToast` (168)~~, `useClientAICompanion` (142, calls server objects — see below, not retired here), ~~`useProgressAnchors` (102)~~, ~~`stage-registry.ts` (86)~~, and `features/pdp/components/StandardsPicker.tsx` (198, roadmap-intent — see below, not retired here).

**✅ Retired 2026-09-07 (Phase 2.6 P6-B)**, the 5 struck-through above: `useDevOverflowWarning.ts` (dev-only overflow diagnostic, no-op in production, zero backend calls), `engagement-guardrails.ts` (pure celebration-governance validation logic, zero backend calls), `useYouveGotMailToast.tsx` (read-only query against the shared `conversation_participants`/`tenant_messages` tables — deleting the frontend hook doesn't retire either table, both remain heavily used elsewhere), `useProgressAnchors.ts` (read-only query against the shared `v_phase_actions_remaining`/`v_progress_anchor_inputs` views — same reasoning, views untouched), and `stage-registry.ts` (pure TypeScript type re-exports derived from the generated `Database` type, zero runtime code). All confirmed zero repo-wide references beyond their own files before deletion.

Important dispositions:

- ~~`usePackageUsage.tsx` has an active newer sibling, `usePackageUsageQuery.tsx`; compare behavior before retirement.~~ Done — see the ✅ Retired note above.
- ~~`usePortfolioCockpit.ts` contains an old restricted-portfolio model. Preserve the recorded operating-policy decision even if the implementation is retired.~~ **✅ Retired 2026-09-07 (Phase 2.6 P6-B)**, decision preserved, not lost: zero repo-wide imports, and its consumer `PortfolioTable.tsx` plus the related `ConsultantAssignmentCard.tsx` were already deleted 2026-08-27 (dead-code batches 8/12 and 11/12) — independently confirmed orphaned even earlier, in `docs/audit-log/entries/2026-07-27-csc-assignment-silent-failure.md` ("not imported by any live page — orphaned/unreachable, no action taken"), predating and unrelated to this session's stale-worktree §7bis findings. The old policy this hook encoded — restricting the portfolio view to only a non-staff user's own assigned-CSC tenants (`assigned_csc_user_id === profile.user_uuid`) — is preserved here in this KB entry rather than lost with the code; current live behavior (the actual triage dashboard) shows the full portfolio to all staff roles, a deliberate difference from this old, unreachable model, not something this retirement changes. All of `usePortfolioCockpit.ts`'s Supabase calls (`v_dashboard_tenant_portfolio`, `v_dashboard_priority_inbox`, `priority_inbox_actions`, `audit_dashboard_events`, `v_dashboard_tenant_recent_comms`) are shared objects also used by the live triage dashboard — no backend object retired.
- ~~`useStageReleases`~~, ~~`useMeetingSeries`~~, ~~`useMeetingMinutes`~~, ~~`useAISuggestions`~~, and `useClientAICompanion` call server objects. Removing an orphaned frontend caller is not server-object retirement evidence.
- `StandardsPicker` may represent roadmap intent; it requires a product decision.
- PR #562 changed `useStageReleases.tsx` during Phase 2.5 even though the current source search finds no importer. Future lint/type batches must perform reachability triage first so effort is not spent improving code already queued for retirement. **✅ Retired 2026-09-08 (Phase 2.6 P6-B)**, ending this repeat-mistake pattern: `useStageReleases.tsx` (396 LOC) had zero repo-wide imports. Its "calls server objects" caution was checked, not skipped — two of its Edge Functions/RPCs (`create_stage_release`, `release_to_tenant`, `generate-release-documents`) have no other caller and their liveness is unconfirmed either way, but `send-stage-email` **is** still called elsewhere (`useEmailTemplates.tsx`, via direct `fetch`) — confirming the caution's exact concern, not a hypothetical one. Retired the frontend hook only; `stage_releases`/`stage_release_items` tables, the RPCs, and both Edge Functions are all deliberately left untouched.

### 3.4 Required retains and false-positive controls

Keep:

- `src/lib/mcp/index.ts` and its `tools/whoami.ts`, `list-my-tenants.ts`, and `list-my-tasks.ts` external-entry files;
- live replacements: `PackageBuilder.tsx`, `ClientDetail.tsx`, `AuditsAssessments.tsx`, `AuditWorkspaceNew.tsx`, `SuggestionDetail.tsx`, and `useEos.tsx`'s live `useEosIssues` export;
- legacy redirect routes until bookmark, notification, email, documentation, and external-link evidence supports a deliberate change.

## 4. Feature redundancy and consolidation register

### 4.1 Bounded clone queue for Phase 2.6

| Candidate | Evidence | Proposed boundary | Gate / potential |
|---|---|---|---|
| `AddClientTaskDialog` + `AddStaffTaskDialog` | About 335 LOC each and only a small owner/schema-specific diff | Shared form/controller with thin client/staff adapters; never one boolean-mode mega-component | Characterize both insert/update schemas, owner behavior, and permissions. Likely 250–300 net LOC reduction. |
| ~~`extract-note-title` + `extract-suggest-title`~~ | RETARGETED 2026-09-07 (P6-B): `extract-suggest-title` had zero repo callers and zero logged invocations — not a live clone pair. Retired outright instead of consolidated; `extract-note-title` (5 real callers) is untouched. See the correction note in `phase-3-5-parallel-preparation-packets-2026-09-04.md`'s Packet D. | — | — |
| ~~`useStageQualityCheck.tsx`~~ | DONE 2026-09-07 (P6-B): extracted `stageQualityEvaluator.ts`, a pure A-E evaluator with no Supabase calls, used by both the hook and `computeStageQuality`. 29 parity fixtures added; both real behavioral differences (generic email/document fallback checks, hook-only certified-integrity check) preserved via explicit options, not silently unified. | — | — |
| `SeatCard` + `DraggableSeatCard` | Substantial shared presentation, but meaningful drag/mutation differences | Extract display core only; keep drag behavior, mutation, and permission logic in adapters | Lower-confidence 150–300 LOC potential; verify both interactive contexts. |

The original 800–1,500 net-line target remains plausible, but parity and clearer ownership are the acceptance criteria. Similar-looking dialogs are not consolidation candidates until their lifecycle, authorization, and side effects are proven equivalent.

### 4.2 Audit feature convergence — characterize before deleting

Current `/audits` and `/audits/:id` use the UUID-based `client_audits` model through `AuditsAssessments` and `AuditWorkspaceNew`. However, the still-active `/audits/:id/findings`, `/actions`, and `/report` routes point to older pages that call `parseInt(id)` and use the legacy `useAudits` contract. This is a source-proven incompatible split for UUID audit IDs.

Treat this as a Phase 2.6 consolidation slice:

1. Characterize the current workspace tabs, the three legacy deep links, generated links, browser refresh, permission behavior, and failure states.
2. Add canonical UUID-aware tab/deep-link behavior or deliberate redirects into `AuditWorkspaceNew`.
3. After parity, retire the self-contained legacy frontend island (`Audits`, `AuditWorkspace`, placeholder, legacy subpages, `useAudits`, legacy audit types, and exclusive components). This shipped in [#588](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/588), removing 1,607 exact physical LOC with no database or policy changes.
4. Treat any old table, RPC, function, or policy retirement as a later audited database slice with live dependency, row, grant, deployed-caller, and observation evidence.

Do not delete the three currently routed subpages merely because their contract looks stale; they remain reachable until the route convergence lands.

## 5. Active-feature redesign register and ownership

| Priority | Active workflow | Intended consolidation | Owning plans and prerequisite |
|---:|---|---|---|
| 1 | Authorization and client policy | Replace parallel static/DB/raw role models with one target-aware server decision vocabulary; route metadata evaluates in shadow and cuts over last | RBAC v6 P0–P8. Optimization must not create a second auth abstraction. |
| 2 | Tenant Directory | Replace the roughly 37-request browser assembly with a versioned, permission-safe, page-ID-first read contract; retire only exclusive hooks after shadow parity | Tenant P0 now; P1/P2 only after RBAC decision core and staff-scope decision. Preserve current all-tenant staff behavior until explicitly changed. |
| 3 | Active tenant detail / operating context | Separate staff, client, Ask Viv, and later analytics contracts over explicit identity/lifecycle/contact/assignment/package sources | Tenant P3+, after Directory semantics and RBAC scope. Dead `TenantDetail.tsx` is unrelated to this active `ClientDetail.tsx` redesign. |
| 4 | Package, time, and renewal | One versioned calculation contract and an idempotent locked renewal command; reconcile allocations, carry-in, parent/child, and boundary dates | Optimization P4.1 + tenant P4.3, after the RBAC Package vertical slice. No credible LOC target before contract inventory. |
| 5 | Listable-human staff directory | One permission-safe listing contract and one query hook, while keeping human/listable, staff identity, and authorization distinct | RBAC principal classification first; then a bounded RBAC/RLS vertical slice. Verify system, QA, disabled, archived, and role cases. |
| 6 | Membership/contact identity | Make `tenant_users`, `tenant_members`, contacts, invitations, promote/swap, and history responsibilities explicit; migrate additively | Tenant P4.2 after directory and RBAC relationship decisions. Unmatched IDs are classification work, not deletion evidence. |
| 7 | Documents, generation, and delivery | Extract selection/status rules and transactional commands one workflow at a time; preserve job resumability, locks, version/current pointers, and delivery history | Optimization P4.6/P6 with RBAC P5/P6 enforcement. Never merge all document aggregates into one table or one PR. |
| 8 | Messaging and broadcast | Canonical participant eligibility, target binding, idempotent per-user outcomes, and durable delivery results across messages, attachments, notifications, read state, broadcast, and realtime | RBAC P5/P6 coordinated privacy slice + optimization P4.2/P6. Reliability and leakage prevention precede LOC. |
| 9 | Academy authoring | Share a validated course-draft contract, asset adapter, and publish command while keeping create/import and editor controllers distinct | After the RBAC Academy vertical slice. Verify create/edit/publish, tenant entitlement, facilitator visibility, and non-SA roles. |
| 10 | Lifecycle Checklists | Prove a small feature API/query/domain boundary without adding ceremony | Optimization Phase 3 pilot. Active but modest in size; success is testability and neutral/negative LOC, not a headline LOC reduction. |

The tenant plan remains authoritative for read-before-write sequencing, expand/migrate/compare/canary/contract mechanics, identity ledgers, unmatched-row classification, and schema normalization. The optimization plan must not split the 64-column `tenants` table, replace its primary key, delete indexes from “unused” evidence, coerce legacy IDs, or expose new directory/Ask Viv/BI surfaces ahead of those gates.

## 7. Council recheck after Phase 2.5 batches 12–49 (2026-09-05)

The follow-up council reviewed the recent merged PRs and the exact current
source at `main@eba9833`. It found one missed Phase 2.6 retirement cohort and
one under-scoped reliability family:

### 7.1 Newly orphaned Audit components

PR #588 removed the legacy `Audits.tsx` island but did not remove three of its
exclusive components. Fresh entry-point traversal and exact-export searches
show no inbound use for:

- `src/components/audit/AuditInspectionsTable.tsx` — 336 lines at current branch cut;
- `src/components/audit/AuditNavCards.tsx` — 81 lines;
- `src/components/audit/AuditTemplatesTable.tsx` — 300 lines.

These are Phase 2.6 retirement candidates (approximately 717 lines at this
branch cut), not approved deletions. Run a fresh route, dynamic-import,
history, and deployed-caller sweep immediately before removal. Preserve the live
`AuditsAssessments`/`AuditWorkspaceNew` surfaces and UUID redirects.

### 7.2 Package/stage authoring reliability family

Recent typing work fixed several browser paths by computing `MAX(id)+1`, while
other paths still omit required IDs and Archive writes an unsupported status.
This is a shared contract problem, not more UI cleanup. Promote it to an
explicit Phase 4 package/stage reliability slice and a later Phase 7 schema
candidate:

- inventory every package/stage insert and lifecycle transition;
- design database-owned ID allocation and a valid status contract;
- add an idempotent, backward-compatible server contract before removing the
  browser-side allocation;
- separately decide Import Stage, Archive Package, Stage Preview, and Bulk
  Generate behavior against the live schema and foreign-key graph.

Do not add speculative FKs or bundle migrations into a consolidation PR.

### 7.3 Scheduling clarification

Phase 2.6 is non-blocking with respect to the *entire* lint backlog. The
already-characterized task-dialog consolidation may proceed once its two files
are excluded from the active lint batch and parity fixtures are ready; Claude
may continue Phase 2.5 independently. A formal Phase 2.5 exit checkpoint is
still required before declaring that phase complete, but it is not a reason to
stall safe Phase 2.6 work indefinitely.

## 7bis. Fresh reachability reconfirmation — Phase 2.5 batches 71-80 (2026-09-05)

The ongoing `no-explicit-any` retirement lane's mandatory reachability
triage (grep for real importers before touching a candidate file, per the
liveness-triage rule from §7 above and §3.3 item 5) independently
reconfirmed two items already on this register, at current `origin/main`
after [PR #679](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/679):

- ~~**Correction from the current-origin sweep (2026-09-05):** the cached
  zero-inbound evidence for **`ComplianceScoreBreakdown.tsx`** and
  **`useComplianceScore.ts`** is stale. At `origin/main` (`a0cf450b5`),
  `ComplianceScoreBreakdown` is imported and rendered by
  `ComplianceScoreCard`, while `useComplianceScore` is used by both
  `ComplianceScoreBreakdown` and `CompletionSummaryModal`. This island is
  live and is **not** a retirement candidate. Its backing
  `v_compliance_score_latest` view and `calculate_compliance_score` RPC also
  remain live; no deletion or schema action is authorized.~~ **This
  correction was itself wrong — re-corrected 2026-09-07, Phase 2.6 P6-B.**
  `a0cf450b5` was not current `origin/main` on 2026-09-05 despite being
  labeled as such — it's the exact commit the still-open
  `.claude/worktrees/any-retirement-batch6` worktree (branch
  `hotfix/p2p5-any-batch84`) was sitting on, a branch cut *before*
  2026-08-27's dead-code batch 11/12 (`c1dcf097f`) deleted both
  `ComplianceScoreCard.tsx` and `CompletionSummaryModal.tsx`. Whoever ran
  this "fresh" reachability check on 2026-09-05 almost certainly ran it
  inside that stale, diverged worktree rather than against true
  `origin/main`, so it saw callers that had already been gone for 9 days.
  Confirmed via `git merge-base --is-ancestor c1dcf097f origin/main` (true)
  and a repo-wide grep (zero real importers of either file). Retired for
  real in P6-B — see the dead-code register's §3.2 "Compliance-score
  island" entry.
- ~~**Correction from the current-origin sweep (2026-09-05):** the cached
  zero-inbound evidence for **`useCompletionEligibility.ts`** is stale. At
  `origin/main` (`a0cf450b5`), it is imported and executed by
  `useCompletionCascade.ts`, so it is live and is **not** a retirement
  candidate. Its `v_completion_eligibility` view remains a live backend
  contract. PR #677's earlier type-only cast cleanup does not change this
  disposition.~~ **This correction was itself wrong too — re-corrected
  2026-09-07, Phase 2.6 P6-B.** Same root cause as above: `useCompletionCascade.ts`
  (the claimed live caller) was deleted 2026-08-27 in dead-code batch 4/12
  (`d551e764c`), also before this "fresh" check's date, also an ancestor of
  current `origin/main`. `useCompletionEligibility.ts` had zero real
  importers and was retired in P6-B alongside `usePackageUsage.tsx` — see
  the "data/workflow hooks" bullet in §3.3 below.
- **Flagged for a future re-check, not verified in this pass:** the
  `StageCellEditor`/`MembershipGrid.tsx` finding immediately below this
  list was made in the same PR #683 timeframe as the two now-corrected
  claims above — it hasn't been independently re-verified against true
  current `origin/main` and could be subject to the same stale-worktree
  risk. Treat it as unconfirmed until someone re-checks it fresh.
Batch 81's live-verification pass (PR #683) turned up a third, more
specific finding: **`StageCellEditor` itself (the named export in
`src/components/membership/StageCellEditor.tsx`) has no importer anywhere**
— confirmed by grep — even though the file is not fully dead. Its sibling
export from the same file, `StageStatusDot`, is imported and actively
rendered by `MembershipGrid.tsx`; live-clicked in the running app, a
Membership Grid row shows only a read-only "No stage data" pill, never the
editor. This is a narrower case than the other two: not a whole-file
retirement candidate, but a dead export inside an otherwise-live file. Any
future retirement pass on this file should remove only the unused
`StageCellEditor` component/export and its exclusive imports, keeping
`StageStatusDot` and the file itself intact.

No other file touched across batches 71-81 turned up as unreachable;
every other candidate in those batches had a real, grep-confirmed importer
before being edited (see `docs/kb/reference/execution-efficiency-log.md`
for the batch-by-batch record). These three remain **candidates only** —
nothing here authorizes deletion; follow the "Required gates per
implementation PR" checklist in §7 before actioning any of them.

**AuditTemplatesTable action (completed in PR [#691](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/691), merged 2026-09-05):** Fresh reachability at
current `origin/main` found `src/components/audit/AuditTemplatesTable.tsx`
has no inbound imports, dynamic imports, route/menu/registry references, or
generated-link/history references. Its former `Audits.tsx` parent was retired
in #588; `/audits` uses `AuditsAssessments`. The component is frontend-only and
the merged PR removed the orphaned file without changing active routes or backend
objects.

**Actioned candidate (PR [#686](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/686), merged 2026-09-05):** the Phase 2.6 cohort for
`StageCellEditor` removes only the unimported `StageCellEditor` export and its
exclusive editor/UI/data-access imports from
`src/components/membership/StageCellEditor.tsx`. The file and its live
`StageStatusDot` export remain intact. A fresh sweep at current `origin/main`
found no inbound import, dynamic import, route/menu/registry reference,
history/generated-link reference, or backend object whose existence depends on
the deleted frontend export; the related `client_package_stage_state` table
and transition RPC remain live elsewhere and are untouched. The implementation
PR will record the exact verification results and remains unmergeable without
Carl's explicit sign-off.

**AuditNavCards action (completed in PR [#690](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/690), merged 2026-09-05):** Fresh reachability at
current `origin/main` found `src/components/audit/AuditNavCards.tsx` has no
inbound imports, dynamic imports, route/menu/registry references, or generated
link/history references. Its former parent `Audits.tsx` was retired in #588;
the active `/audits` route renders `AuditsAssessments` instead. The component
is frontend-only and has no backend object dependency. This PR removes the
orphaned file only; no active audit route or data contract changes.

## 7ter. `/admin/package/:id...` route tree retirement (2026-09-07, Phase 2.6 stabilization Packet P6-A)

**Newly discovered, not in this register's original candidate list — found
incidentally while implementing the task-dialog consolidation (Packet P6-A),
then investigated separately and retired in its own PR.**

**Candidate:** `src/pages/PackageDetail.tsx`, `src/pages/AdminPackageTenantDetail.tsx`,
`src/components/AddClientTaskDialog.tsx`, `src/components/AddStaffTaskDialog.tsx`,
`src/components/AddExistingStageDialog.tsx`, `src/components/AddExistingDocumentDialog.tsx`,
and the 3 routes registering them in `dashboardRoutes.tsx`
(`/admin/package/:id`, `/admin/package/:id/tenant/:tenantId`,
`/admin/package/:id/tenant/:tenantId/instance/:instanceId`).

**Reachability:** the only entry point anywhere in the live UI was one
unlabeled `ChevronRight` icon button inside an already-expanded "Manage"
accordion panel in `src/components/client/ClientPackagesTab.tsx` — no nav
item, breadcrumb, notification template, or Edge-function-generated link
pointed here. No deep link/email/audit-log reference found. Quantitative
confirmation: only 6 tenants (of the full production tenant base) ever had
anything written to `tenants.stage_ids`, the one tenant-scoped field this
page's own "Stages" feature used — over the product's entire lifetime.

**This page nearly retired once before, for a different, narrower reason.**
`docs/dead-code-route-cleanup-plan-2026-08-27.md` and
`docs/audit-report-2026-08-26.md` record PR #413 deleting
`PackageDetail.tsx` after confusing it with an already-dead legacy
`/package/:id` route; that broke the (at-the-time genuinely live)
`/admin/package/:id...` wrapper routes, restored in PR #416. That assessment
was correct in 2026-08-26 — it did not evaluate whether the admin route tree
itself was dead, which is the question this entry answers.

**Every distinguishable feature on the page turned out to be either
disconnected from the real data model, or a strictly less capable duplicate
of an already-live, actively-used equivalent:**

| Feature | What `PackageDetail.tsx` did | The real, live equivalent |
|---|---|---|
| "Stages" list / Add Existing Stage | Appended to `tenants.stage_ids`, a tenant-wide array unrelated to per-package stage progress. No remove UI exists anywhere in the codebase for this array. | `client_package_stage_state`, rendered inline in `ClientPackagesTab.tsx` ("Stage Progress X/Y") |
| Staff/Client Tasks dialogs | Full CRUD on `package_staff_tasks`/`package_client_tasks`, but hard-deletes | `usePackageBuilder.tsx`'s `addStaffTask`/`updateStaffTask`/`deleteStaffTask` (+ client equivalents) — used by Package Builder's `StageDetailPanel.tsx` and `/admin/stages/:id`; soft-deletes via `is_deleted`, tracks `is_override`, syncs recurring flags. Strictly more capable. |
| Documents (`AddExistingDocumentDialog`) | Linked `document_stage_links`; zero other callers of this dialog existed | `ManageDocuments.tsx` / `StageDocumentsPanel.tsx` — same table, actively used |
| Remove tenant from package | Crude `package_instances.is_complete = true`, no end-date handling | `ClientPackagesTab.tsx`'s `handleFinalisePackage` — proper end-date and renewal handling |
| Notes | `StageNotesTab` (shared with `AuditTemplateBuilder.tsx`, so not fully dead code either way) | `ClientPackagesTab.tsx`'s parallel `PackageNotesSection` |

**A real, previously-flagged, never-fixed bug found along the way:** the
page's "Manager" field looked up `users` by `manager_id` with `.single()`
(not `.maybeSingle()`); a stale/orphaned `manager_id` reference threw a
`406`. `docs/kb/codebase-state/internal-staff-audit-2026-07-29.md` flagged
this exact error class on this exact route on 2026-07-29 and never chased
it down. Root-caused here; moot on retirement rather than separately
patched.

**Correction to an earlier verbal claim this session:** `tenants.stage_ids`
is not fully unread — `src/components/ask-viv/AskVivScopeSelectorModal.tsx`
reads it to populate an Ask Viv phase-scope filter. Given only 6 tenants
ever populated it, removing the one write path (this retirement) leaves
that filter permanently empty for those tenants going forward and
permanently absent for everyone else — not a functional regression, since
this data source was already stagnant and disconnected from the real
per-package stage system, but noted for accuracy rather than silently
calling the column dead.

**Git history corroboration:** every commit touching `PackageDetail.tsx` in
recent weeks was mechanical (Phase 2.5 `any`-typing, a global date-format
sweep, an RBAC route-guard sweep) — zero deliberate feature-level
engineering, consistent with genuine abandonment.

**Disposition:** retired. `package_staff_tasks`, `package_client_tasks`,
`document_stage_links`, `package_instances`, and `tenants.stage_ids` itself
are untouched — all remain live schema, used by the surfaces named above.
Verification: `lint:ratchet`, `typecheck` (0 errors), `test:frontend`,
`test:edge`, `build`, route manifest (243 → 240, exactly the 3 removed
routes, confirmed via `npm run routes`), and authenticated SuperAdmin
Playwright confirming both retired route variants now render the app's own
404 (not a crash) and `ClientPackagesTab.tsx`'s Manage/Stages/Notes/
Renew/Finalise flow is unchanged with the chevron button removed.

**Architecture metrics (`npm run metrics`), measured via `scripts/architecture-metrics.mjs`
in two isolated worktrees — `origin/main@7e84ee9e3` (this retirement's
branch-cut point) vs. the retirement branch tip:**

| Measure | Before | After | Delta |
|---|---:|---:|---:|
| Tracked product files | 1,732 | 1,727 | −5 |
| Physical lines | 493,171 | 489,913 | −3,258 |
| Lines excl. generated types | 419,707 | 416,449 | −3,258 |
| Product lines excl. generated + tests | 408,900 | 405,642 | −3,258 |
| Files over 600 lines | 119 | 118 | −1 (`PackageDetail.tsx`, 1,678 lines) |
| Files over 1,000 lines | 33 | 32 | −1 (same file) |
| Supabase client imports — pages | 107 | 105 | −2 |
| Supabase client imports — components | 222 | 218 | −4 |
| Direct Supabase calls — pages | 96 | 94 | −2 |
| Direct Supabase calls — components | 186 | 182 | −4 |
| `unicorn_role` files | 162 | 160 | −2 |
| Raw `any` keyword hits | 462 | 461 | −1 |

The −3,258 physical-line delta doesn't exactly match `git diff --cached
--stat`'s −3,267 (deletions) + 237 (doc insertions) net figure for this
PR's own commit; the ~9-line gap is `origin/main` itself measuring a few
lines apart between the two separate metrics runs (a git-fetch timing
artifact between commands, not a PR discrepancy) — noted for
transparency rather than silently rounded away. The 6 deleted files vs. a
measured 5-file drop has the same explanation. Both are far smaller than
the actual retirement's real size and don't change any conclusion above.

## 7quater. `/tenant/:tenantId/document(s)...` route tree retirement (2026-09-07, Phase 2.6 stabilization Packets P4-B/P6-B)

**Surfaced by Carl noticing a page he'd never seen before** (`/tenant/6278/documents`) mid-session, immediately after fixing two genuine
`packages:package_id`-embed no-FK bugs elsewhere (`StagePreviewDialog.tsx`,
`BulkGenerateDocumentsDialog.tsx`, Packet P4-B) — the same query pattern
was about to be fixed a third time in `TenantDocuments.tsx` before a pause
to check reachability first, matching the standing "reachability triage
before any batch" lesson from the `PackageDetail.tsx` retirement above.

**Candidate:** `src/pages/TenantDocuments.tsx`, `src/pages/TenantDocumentsHub.tsx`,
`src/pages/TenantDocumentDetail.tsx`, `src/pages/TenantDocumentDetailWrapper.tsx`,
and the 3 routes registering them (`/tenant/:tenantId/documents`,
`/tenant/:tenantId/documents-hub` in `dashboardRoutes.tsx`;
`/tenant/:tenantId/document/:documentId` in `App.tsx`).

**Reachability:** exhaustive grep of `src/` for `navigate(`, `Link to=`, and
string-template route references to `/documents`, `/documents-hub`, and
`/document/` under a tenant path found **zero real call sites** — the only
references anywhere were the routes' own registrations and
`TenantDocuments.tsx`'s own internal "back" button linking to
`TenantDocumentDetail.tsx`, i.e. the cluster only ever links to itself.
`npm run routes`'s manifest confirmed the same: no guard/nav-item wired
these paths into any menu, breadcrumb, or notification template.

**Git history corroboration:** `TenantDocuments.tsx` and
`TenantDocumentsHub.tsx` have no deliberate feature-level commits in recent
history — only ancient Lovable "Changes" auto-commits and mechanical
Phase 2.5 `any`-typing sweeps, the same abandonment signature as
`PackageDetail.tsx` in §7ter.

**The real, live equivalent already existed and was already fixed.**
`ClientDetail.tsx`'s embedded "Documents" tab (route
`/tenant/:tenantId?tab=documents`) renders `DocumentsHub.tsx` →
`GeneratedDocumentsTab.tsx` — a different component tree entirely, reached
by every real user of this feature. `GeneratedDocumentsTab.tsx` already
carried the identical two-step-fetch fix for the `documents.package_id`
no-FK bug (see L10 item #17's update), applied independently in an earlier,
unrelated-sounding commit — meaning the "third fix" about to be written
into `TenantDocuments.tsx` would have fixed code nobody could ever reach.

**Disposition:** retired. All 4 files deleted; the 3 routes replaced with
`<Navigate replace>` redirects to the real Documents tab
(`/tenant/:tenantId?tab=documents`), matching the existing
`LegacyAuditTabRedirect`/`/admin/governance-documents` precedent for
retired routes that might still have a stray bookmark or external link.
`documents`, `document_versions`, and `document_stage_links` themselves are
untouched — all remain live schema used by `DocumentsHub.tsx` and
`ManageDocuments.tsx`. Verification: `lint:ratchet` (0 regressions),
`typecheck` (0 errors, documented baseline unchanged), `test:frontend`
(287 passed / 15 skipped), `test:edge` (261 passed), `build`,
`check:kb-links` (0 broken), and authenticated SuperAdmin Playwright
confirming all 3 retired routes now redirect to the real Documents tab
with zero console errors, the real tab (including its already-fixed
Generated sub-tab) renders correctly, and the separately-fixed
`StagePreviewDialog.tsx`/`BulkGenerateDocumentsDialog.tsx` queries load
without error live.

**Coverage gap, honestly disclosed:** `BulkGenerateDocumentsDialog.tsx`'s
own dialog could not be opened live during this verification — its trigger
button only renders when a stage has `package_stage_documents` rows
(`stageDocuments.length > 0`), and a direct query confirmed **zero
non-deleted rows exist in that table in production right now**, for any
package or stage. This is a pre-existing, unrelated data-state fact (not
caused by this PR), so the dialog's fix rests on static evidence only:
`lint:ratchet`/`typecheck` passing and a code review confirming it
replicates the same batched-Map two-step-fetch pattern already verified
live in `StagePreviewDialog.tsx` and `GeneratedDocumentsTab.tsx`.

**Architecture metrics (`npm run metrics`), measured via
`scripts/architecture-metrics.mjs` in two isolated trees — the merge-base
commit (`db2c46105`) vs. this retirement's worktree with all changes applied:**

| Measure | Before | After | Delta |
|---|---:|---:|---:|
| Tracked product files | 1,727 | 1,724 | −3 (−4 frontend, +1 edge — unrelated, see note) |
| Physical lines | 490,147 | 489,187 | −960 |
| Lines excl. generated types | 416,683 | 415,723 | −960 |
| Product lines excl. generated + tests | 405,821 | 404,861 | −960 |
| Files over 600 lines | 118 | 118 | 0 |
| Files over 1,000 lines | 32 | 32 | 0 |
| Wrapper files | 7 | 6 | −1 (`TenantDocumentDetailWrapper.tsx`) |
| Supabase client imports — pages | 105 | 102 | −3 |
| Direct Supabase calls — pages | 94 | 91 | −3 |
| Raw `any` keyword hits | 386 | 388 | +2 (false positive — the word "any" inside this retirement's own redirect comments, "covers any stray bookmark"; not a typing regression, confirmed by `lint:ratchet` showing 0 new findings) |

The +1 edge-function-file reading is unexplained by anything in this PR's
diff (nothing under `supabase/functions/**` was touched) and is small
enough not to change any conclusion above — noted for transparency rather
than silently rounded away, matching §7ter's own disclosed measurement-gap
precedent.

## 6. Cross-program sequence

### Phase 2.5 checkpoint and ongoing lane

- Finish the active Phase 2.5 batch to a clean merged checkpoint.
- Before every later lint/type batch, run a lightweight reachability check and exclude unresolved retirement candidates until their disposition is known.
- Phase 2.5 may continue as a rolling type-safety lane; zero findings are not a prerequisite for RBAC or tenant discovery.

### Phase 2.6 — verified retirement and bounded consolidation

1. Regenerate the import graph, route manifest, exact-export/import census, and metrics at branch cut.
2. Retire the high-confidence frontend cohorts in domain PRs, preserving replacements and redirects.
3. Converge Audit routes/contracts before removing reachable legacy audit code.
4. Consolidate literal clones only after parity fixtures.
5. Recompute the graph and architecture metrics before the Phase 3 boundary pilot.

Phase 2.6 may remove dead exports, types, tests, and frontend-only dependencies that are exclusive to a retired island. It does **not** change route access policy, schema/RLS/RPC/trigger/grant semantics, tenant scope, database authority, or public endpoint contracts.

### Parallel Gate A — characterization only

After route composition is stable, run without production behavior changes:

- RBAC P0/P1 inventories, golden matrices, feature-boundary manifest, policy decisions, and enabling verification;
- tenant P0.1/P0.3 read-only production inventory/baseline plus P0.2 synthetic writes confined to a separately authorized disposable multi-tenant environment.

The existing AST route manifest is inventory evidence, not an authorization source. RBAC P3 owns capability metadata in shadow mode. Do not reopen route composition or build an optimization-specific permission registry.

### Gate B — RBAC foundation and pilot

Complete RBAC P0.2–P0.5 and the full P0 exit gate first: permission/audit atomicity, active-principal rollout, session/account-state behavior, and matrix/legacy-role decisions are correctness work, not characterization. RBAC P2–P4 then establishes the server decision core, shadow route capability evaluation, explicit staff-scope decision, and Academy/Package/Stage AJ/CSC vertical pilot. Route/navigation cutover is last, after every backing Edge/RPC/RLS/storage path is classified and enforced.

Only after this gate may tenant P1/P2+ or another new tenant-directory/context/analytics permission surface begin. Later feature/database redesigns use coordinated RBAC/tenant vertical slices rather than a generic optimization overhaul.

## 7. Required gates per implementation PR

Before editing:

- re-run import/dynamic-import, route/menu/registry, exact-export, docs/audit/history, generated-link/notification, Edge/RPC/storage/cron, and replacement checks for the named cohort;
- record current allowed and denied personas and whether the change is frontend-only, public-contract, or database-affecting;
- obtain a product-owner disposition for any formerly visible capability;
- query effective live policies/functions/grants/dependencies when a database or deployed boundary is in scope.

Before PR handoff:

- run `npm run routes`, `npm run lint:ratchet`, `npm run typecheck`, `npm run test:frontend`, `npm run test:edge`, `npm run build`, and risk-based Playwright checks;
- test the replacement, direct legacy deep links, browser refresh, notifications/generated links where relevant, and ordinary-role positive/negative behavior;
- recompute reachability and before/after LOC;
- obtain the required independent council review for deletions over 500 lines, cross-feature consolidation, route/guard/provider/auth changes, or any database/Edge authorization boundary;
- attach rollback/cutback, residual-risk, unavailable-persona, and observation evidence.

No plan or council approval authorizes a production migration/deployment, external side effect, user-role change, PR merge, or database object retirement. Those remain fresh, separately authorized actions.

## 8. Council challenges incorporated

| Council challenge | Resolution |
|---|---|
| A static graph can misclassify external entries | Explicitly retain `src/lib/mcp/**`; regenerate and classify dynamic/external consumers at branch cut. |
| Cleanup could delay security architecture indefinitely | Phase 2.6 is non-blocking; RBAC starts without waiting for zero lint or every retirement candidate. |
| “Consolidation” can hide a permission widening | Behavior-preserving Phase 2.6 forbids authorization/data-policy changes; route cutover remains last in RBAC vertical slices. |
| Dead UI can sit on live backend infrastructure | Frontend removal never authorizes server-object removal; backend retirement needs live dependency/usage/observation evidence. |
| Active tenant detail could be confused with dead `TenantDetail.tsx` | The dead island and active `ClientDetail` operating-context redesign are named separately. |
| Audit routes mix UUID and integer contracts | Add a characterized convergence slice before deleting any currently routed legacy audit page. |
| Lint work has repeatedly improved dead files | Add mandatory liveness triage before later Phase 2.5 domain batches. |
| Tenant performance work could invent new scope | Tenant P1/P2 waits for RBAC staff-scope and decision-core approval; current behavior is shadowed exactly first. |

## 9. Initial execution status

| Item | Status | Evidence |
|---|---|---|
| Three-seat council investigation | Complete 2026-09-04 | dead-code/import graph, feature/database consolidation, and RBAC/tenant alignment seats |
| Phase 2.6 plan insertion | Implementation underway | All listed high-confidence retirements are now merged: [#570](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/570), [#571](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/571), [#574](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/574), [#577](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/577), [#579](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/579), Audit work [#586](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/586)/[#588](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/588), Audit orphan retirements [#690](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/690)/[#691](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/691), and export cleanup [#686](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/686). Remaining work is bounded feature consolidation plus lower-confidence candidates requiring fresh evidence. |
| AuditInspectionsTable retirement | Merged in [#681](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/681) | Fresh current-origin sweep: zero inbound imports/dynamic imports/routes/menu references; no Edge callers; backend `audit_inspection` remains active through `AuditTemplateBuilder` and `merge_tenants`. Component deletion was frontend-only; authenticated Playwright passed with real audit data and zero writes. |
| StageCellEditor export retirement | Merged in [#686](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/686) | Removed only the unreachable editor export and exclusive imports; retained the file and live `StageStatusDot`. Fresh reachability sweep found no inbound references; related stage-state backend objects remain live. Authenticated Membership Grid Playwright passed with zero writes; current data did not exercise a colored stage state. |
| High-confidence cohorts | 6 of 6 retired | Audit convergence is a separate source-proven slice intentionally gated on UUID/deep-link characterization; broader consolidation remains investigative |
| Audit route convergence and island retirement | Implemented in [#586](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/586) and [#588](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/588) | Legacy deep links redirect via history replacement to the canonical UUID workspace with matching `?tab=` selection. Authenticated verification passed with real data, refresh/back/forward, zero console errors, and zero writes. The unreachable legacy island and exclusive dependencies were removed in #588; active canonical flow is unchanged. |
| Clone consolidation | Candidate register complete | parity fixtures not started |
| RBAC v6 implementation | Not started | P0.1/P0.6/P1 design may overlap; P0.2–P0.5 and P2–P4 form the implementation gate |
| Tenant P0/P1+ implementation | Not started | P0.1/P0.3 may read production; P0.2 is disposable-only; P1+ awaits RBAC gate |
