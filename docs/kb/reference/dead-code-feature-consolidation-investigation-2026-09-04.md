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
| Orphaned document-version hook | `src/hooks/useDocumentVersions.tsx` | Zero inbound imports; the August document-version audit records it as orphaned after `/document/:id` retirement. | 167 |
| Unused landing-page alias | `src/pages/Index.tsx`, plus its unused declaration in `src/App.tsx` | The binding has no JSX/use reference; `/` and `/login` render `Login` directly. | 18 |

The immediately actionable first-wave potential was about **6,627 lines**, already above the parent plan's original 3,000–6,000 conservative target. That was a reason to split it into domain PRs, not to raise deletion scope automatically. **Update 2026-09-04:** four retired cohorts account for about 6,442 lines; the remaining first-wave candidates (orphaned document-version hook and unused landing-page alias) total about 185 lines.

The formerly unused Audit shells and their exclusive legacy dependencies were characterized with the UUID route-convergence slice in [#586](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/586), then retired in [#588](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/588) after authenticated parity evidence. The active replacements remain `AuditsAssessments` and `AuditWorkspaceNew`.

### 3.2 Cohesive second-wave islands

| Cohort | Files / potential | Required caution before retirement |
|---|---|---|
| Workboard UI | Four files under `src/components/workboard/**` plus `src/hooks/useClientWorkboard.tsx`; about 1,751 LOC | Confirm the user-facing workboard was intentionally retired. `client_action_items` remains active elsewhere and must not be treated as dead database infrastructure. |
| SharePoint document-link UI | `LinkedDocumentsList.tsx`, `SharePointDocumentPicker.tsx`, `useDocumentLinks.tsx`; about 1,088 LOC | The frontend island is disconnected, but the hook calls `link-sharepoint-document`. Do not infer that the endpoint or `document_links` is unused. |
| Abandoned bulk-generation steps | `PackageFilterStep.tsx`, `ScopeStep.tsx`, `StageDocFilterStep.tsx`, `useTenantSharepointStatus.ts`; about 386 LOC | Verify every current wizard variant and the active targeted bulk-generation flow. |
| Reassignment island | `ReassignConsultantDialog.tsx`, `useConsultantAssignment.tsx`; about 356 LOC | Preserve active CSC assignment contracts. If retired, remove these dead predicates from the RBAC/staff-directory census rather than consolidating them. |
| Network-status island | `NetworkStatusIndicator.tsx`, `useNetworkStatus.ts`; about 302 LOC | Check build-time, preview, and development registries before deletion. |
| Compliance-score island | `ComplianceScoreBreakdown.tsx`, `useComplianceScore.ts`; about 245 LOC | Confirm product/history disposition; do not infer that its backing view or RPC is dead. |
| Old standalone UI | `client/BulkUploadDialog.tsx` and `dashboard/WeekTasksTable.tsx`; 344 and 228 LOC | Confirm no modal registry, launcher, planned restoration, or external embedding. |

### 3.3 Individual zero-inbound investigation queue

The following are candidates, not a bulk-deletion list:

- Data/workflow hooks: `useStageReleases` (396 LOC), `usePortfolioCockpit` (316), `useMeetingSeries` (285), `usePackageUsage` (266), `useMeetingMinutes` (207), `useKpiReview` (149), `useAISuggestions` (122), `useEosDrafts` (100), `useDocumentScan` (46), `useEngagementAudit` (42), and `useCompletionEligibility` (39).
- UX/platform artifacts: `useDevOverflowWarning` (234), `engagement-guardrails.ts` (187), `useYouveGotMailToast` (168), `useClientAICompanion` (142), `useProgressAnchors` (102), `stage-registry.ts` (86), and `features/pdp/components/StandardsPicker.tsx` (198).

Important dispositions:

- `usePackageUsage.tsx` has an active newer sibling, `usePackageUsageQuery.tsx`; compare behavior before retirement.
- `usePortfolioCockpit.ts` contains an old restricted-portfolio model. Preserve the recorded operating-policy decision even if the implementation is retired.
- `useStageReleases`, `useMeetingSeries`, `useMeetingMinutes`, `useAISuggestions`, and `useClientAICompanion` call server objects. Removing an orphaned frontend caller is not server-object retirement evidence.
- `StandardsPicker` may represent roadmap intent; it requires a product decision.
- PR #562 changed `useStageReleases.tsx` during Phase 2.5 even though the current source search finds no importer. Future lint/type batches must perform reachability triage first so effort is not spent improving code already queued for retirement.

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
| `extract-note-title` + `extract-suggest-title` | 137/133 LOC and about a 12-line behavioral diff | Shared internal title-extraction service while retaining both public endpoint names and response contracts | Add auth, CORS, rate, provider-failure, and response tests first. About 100 LOC potential. |
| `useStageQualityCheck.tsx` | About 745 LOC with two near-duplicated evaluation pipelines | One pure evaluator over a typed data snapshot, wrapped by the hook and standalone caller | No focused fixtures currently exist; add parity fixtures first. Roughly 250–300 LOC potential. |
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

- `src/components/audit/AuditInspectionsTable.tsx` — 324 lines;
- `src/components/audit/AuditNavCards.tsx` — 81 lines;
- `src/components/audit/AuditTemplatesTable.tsx` — 300 lines.

These are Phase 2.6 retirement candidates (approximately 705 lines), not
approved deletions. Run a fresh route, dynamic-import, history, and deployed-
caller sweep immediately before removal. Preserve the live
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
| Phase 2.6 plan insertion | Implementation underway | All highest-confidence dead-code cohorts are retired: [#570](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/570), [#571](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/571), [#574](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/574), [#577](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/577), [#579](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/579), and Audit work [#586](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/586)/[#588](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/588). Remaining work is bounded consolidation candidates. |
| High-confidence cohorts | 6 of 6 retired | Audit convergence is a separate source-proven slice intentionally gated on UUID/deep-link characterization; broader consolidation remains investigative |
| Audit route convergence and island retirement | Implemented in [#586](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/586) and [#588](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/588) | Legacy deep links redirect via history replacement to the canonical UUID workspace with matching `?tab=` selection. Authenticated verification passed with real data, refresh/back/forward, zero console errors, and zero writes. The unreachable legacy island and exclusive dependencies were removed in #588; active canonical flow is unchanged. |
| Clone consolidation | Candidate register complete | parity fixtures not started |
| RBAC v6 implementation | Not started | P0.1/P0.6/P1 design may overlap; P0.2–P0.5 and P2–P4 form the implementation gate |
| Tenant P0/P1+ implementation | Not started | P0.1/P0.3 may read production; P0.2 is disposable-only; P1+ awaits RBAC gate |
