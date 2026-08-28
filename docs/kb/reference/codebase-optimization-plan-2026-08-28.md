# Codebase Optimization and KB Renewal Plan

> **Last updated:** 2026-08-28 · **Reconsider by:** 2026-11-28 · **Confidence:** high on repository measurements and the May–August change history; medium on effort and net-LOC forecasts until each slice completes its characterization pass.
>
> **Reflects commit:** `unicorn-cms-f09c59e5@176e5e55` (`origin/main`, 2026-08-28).
>
> **Status:** Planning only. This document authorizes no production deployment, migration, branch deletion, or feature retirement. Execute one bounded PR at a time, with a fresh blast-radius check and normal review.

## 1. Executive decision

The next optimization program should not be another repo-wide deletion sweep. The 27–28 August dead-code program already removed the largest set of confidently orphaned frontend files and retired multiple obsolete Edge Functions. The remaining opportunity is structural: reduce the cost of understanding and changing active code without obscuring business behavior behind extra abstraction.

The program has five outcomes:

1. Restore a trustworthy verification loop before moving active code.
2. Make routes, layout, navigation, permissions, and API boundaries easier to discover.
3. Break the largest live files along business-behavior seams, not arbitrary line counts.
4. Consolidate duplicated rules that have already caused production drift.
5. Refresh the KB so AI and humans can find current truth without loading months of stale plans and broken links.

This is an incremental program. There is no big-bang rewrite, no framework migration, and no requirement to force every feature into a textbook Clean Architecture directory tree. SOLID is applied as a design test: responsibilities should be clear, dependencies should point toward stable business rules, and adding a route or workflow variant should not require editing several unrelated sources of truth.

## 2. Scope and evidence model

### In scope

- `src/**`, excluding generated Supabase types as a reduction target.
- `supabase/functions/**`, including shared handlers and tests.
- Build, typecheck, lint, test, route-inventory, and documentation checks.
- `docs/kb/**`, `docs/audit-log/INDEX.md`, and current code-adjacent documentation.
- Residual schema/RPC cleanup only after the repository and live-database checks required by `AGENTS.md`.

### Out of scope

- Rewriting React/Vite, replacing Supabase, or changing the product stack.
- Reformatting generated `src/integrations/supabase/types.ts` for readability.
- Deleting Edge Functions because no in-repo caller was found.
- Treating low commit activity as evidence that a feature is unused.
- Refactoring `docs/audit-log/entries/**`; dated audit entries are historical evidence and should remain immutable.
- Deploying migrations or Edge Functions as part of an optimization PR unless separately approved and audited.

### Evidence tiers

| Tier | Meaning | Allowed conclusion |
|---|---|---|
| A | Production rows/logs, a real-client reproduction, or a live workflow verification | Protect as active; refactor only behind characterization tests |
| B | Current route/caller plus repeated recent maintenance | Active or newly shipped; simplify, but measure adoption before large redesign |
| C | Current source only, no usage evidence | Unknown; investigate before keeping or retiring |
| D | No callers plus DB/function/cron/trigger sweep and production evidence, or explicit product-owner confirmation | Removal or schema-retirement candidate |

Git activity is a maintenance proxy, not telemetry. The 2026-05-01–2026-08-28 history contains thousands of small Lovable commits, so raw counts are used only to locate high-change seams.

## 3. Baseline at `origin/main@176e5e55`

### Code footprint

| Metric | Baseline | Interpretation |
|---|---:|---|
| Tracked files under `src/**` + `supabase/functions/**` | 1,839 | Comparable with the existing dead-code plan |
| Lines under those paths | 505,587 | Includes generated types and tests |
| Lines excluding generated `src/integrations/supabase/types.ts` | 431,555 | Better human-maintained-code baseline |
| Product TS/TSX/JS, excluding generated types and tests | about 416,000 | Use for net-LOC targets |
| Frontend product code | about 334,700 lines | 1,464 files |
| Edge Function product code | about 80,800 lines | 269 TS/JS files, including shared modules |
| Product files over 600 lines | 120 | 94 frontend, 26 Edge Function |
| Lines held by files over 600 lines | 117,734 | Roughly 28% of product code |
| Product files over 1,000 lines | 35 | Highest cognitive-load group |
| Parsed functions at least 100 lines | 1,123 | 501 are at least 200 lines; splitting must follow responsibilities |
| Route declarations found by the route generator | 244 | Includes one duplicate path registration |
| `*Wrapper.tsx` files | 71 / 1,369 lines | Many are layout-only adapters |
| Frontend test files | 22 | Small relative to 1,464 frontend product files |
| Edge Function test files | 56 | Run with a separate harness |

Do not count the 74,000-line generated Supabase type file or historical migrations toward refactor progress. Shrinking generated truth or migration history would produce a misleading result.

### Boundary and duplication indicators

| Indicator | Baseline finding |
|---|---|
| Supabase client imports | 113 page files, 228 component files, 274 hook files |
| Direct Supabase calls | 73 pages, 137 components, 144 hooks |
| Zod adoption | 12 frontend files mention/import it |
| Role model spread | `unicorn_role` appears in 133 frontend files; permission-hook adoption is much narrower |
| Edge response helpers | Shared `response-helpers.ts` has about 10 function adopters, while dozens of functions define local `json`/`jsonResponse`/`jsonErr` helpers |
| Type strictness | Frontend `strict`, `strictNullChecks`, `noImplicitAny`, unused-local, and unused-parameter checks are disabled |
| Frontend `any` signal | Over 1,500 word hits across pages, components, and hooks; use per-slice measurement because some are comments or third-party boundaries |
| KB footprint | 56 files / about 13,100 lines; pinned set is already at 1,491 lines against its 1,500-line target |

### Largest current files

| File | Lines | Why it matters |
|---|---:|---|
| `src/pages/ManageDocuments.tsx` | 2,766 | 61 state hooks, 37 direct DB/API calls; active document-generation and delivery surface |
| `src/pages/AdminStageDetail.tsx` | 2,720 | 52 state hooks and multiple stage/document responsibilities |
| `supabase/functions/tga-sync/index.ts` | 2,674 | Large integration handler with many helper paths |
| `src/pages/AuditTemplateBuilder.tsx` | 2,351 | Builder state, persistence, validation, and UI in one module |
| `src/components/client/ClientTimeTab.tsx` | 2,035 | Active time/package workflow with repeated calculation history |
| `src/pages/superadmin/AcademyAddCoursePage.tsx` | 1,983 | Fast-moving Academy builder workflow |
| `src/components/client/ClientIntegrationsTab.tsx` | 1,957 | Several independent integrations share one component |
| `supabase/functions/ask-viv-assistant/index.ts` | 1,874 | Active/new AI orchestration; adoption still needs telemetry |
| `src/pages/TasksManagement.tsx` | 1,813 | Canonical tasks workflow after June unification |
| `src/components/client/ClientStructuredNotesTab.tsx` | 1,804 | 44 state hooks and 10 effects |
| `src/pages/AdminManagePackages.tsx` | 1,780 | Package configuration plus direct persistence |
| `src/components/client/TenantUsersTab.tsx` | 1,709 | Active identity/invitation/contact workflow |
| `src/pages/PackageDetail.tsx` | 1,662 | Shared by live admin routes; a prior cleanup incorrectly removed it and had to restore it |
| `src/components/eos/LiveMeetingView.tsx` | 1,617 | Live production EOS path with realtime behavior |

Size is a signal, not an automatic refactor order. Recent real use makes several of these files higher risk as well as higher value.

## 4. What the system actually looks like now

### Tier A — demonstrated active use; protect first

| Area | Evidence from May–August 2026 | Optimization implication |
|---|---|---|
| Client portal, users, invitations, and contacts | Real non-staff client verification and a real pending invitation in `2026-08-27-client-portal-contacts-and-swap.md` and `2026-08-27-promote-sends-real-invitation.md` | Characterize role/capacity/invite state before extracting identity services |
| Governance documents, generation, delivery, SharePoint | 23,598 generated instances in May; production bulk job with 8,637 items and more than 1,000 deliveries in August; see `2026-08-19-bulk-generate-stall-resilience.md` and `2026-08-26-deliver-to-clients-empty-job.md` | Split orchestration from rendering, but preserve resumability, lock ownership, and delivery history |
| Messaging, broadcast, notifications | A real 44-tenant campaign exposed participant failure; production notification fan-out was verified in July | Consolidate participant insertion and delivery-state rules before UI cleanup |
| Packages, time, and renewals | A real client package was used to reconcile renewal-window calculations to the minute on 20 August | Establish one canonical calculation contract before removing duplicate displays or RPCs |
| Academy | Real client facilitator-name defect; 100 courses queried and an unfinished thumbnail backfill intentionally retained | Refactor builder slices incrementally; do not infer unused from partial data |
| EOS | Production L10 configuration and real upcoming meeting exercised during the July overhaul | Protect realtime and facilitator flows; extract pure state transitions first |
| Xero | Live webhook 200s and production cache updates recorded on 11 August | Treat as active integration; isolate webhook/domain mapping rather than retire |
| Tasks/action items | June overhaul published 127 client task instances across 27 stages | Preserve `client_action_items` as the canonical client-facing record |

### Tier B — active/new, adoption volume uncertain

- Current Audits (`client_audits`) were exercised in live QA and remain under active repair, but client adoption volume is not proven.
- Ask Viv staff/client redesign shipped across late July and early August. Keep the observation-period functions parked and add telemetry before architecture changes.
- KPI/KPI-v2 is routed and data was verified in July. The superseded reviewer-admin UI has already been removed.
- PDP and its Academy analytics are recent. Optimize observability and boundaries first; usage maturity is still developing.

### Tier D — retired or cleanup-ready only after final checks

- Legacy Compliance Auditor frontend, function, and three tables are removed.
- Stage Documents bulk-upload-with-AI UI and its four RPCs are removed; `document_ai_audit` remains a schema candidate.
- The deprecated Academy Solo/Team/Elite tier UI is removed; its enum/column residue is a schema candidate.
- The dead-code plan's PR #455 has merged as `b8933727`; `test-mailgun`, `tga-product-lookup`, and `import-vimeo-training` are retired.
- `compliance-assistant-client`, `bootstrap-bulk-generate-system-account`, and `academy-backfill-course-thumbnails` are explicitly parked, not removal-ready.

## 5. Target architecture

The target is a small number of discoverable conventions, not a large number of layers.

| Boundary | Responsibility | Dependency rule |
|---|---|---|
| Route composition | Lazy page import, layout, guard, route metadata | Route modules depend on features; features do not import route modules |
| Feature UI | Rendering and user interaction for one business capability | No raw Supabase calls in large page/component orchestrators |
| Feature query/service | React Query lifecycle, command orchestration, invalidation | May call a feature API adapter; owns stable query keys |
| Feature API adapter | Supabase `.from`, `.rpc`, storage, or function invocation | Converts transport rows/errors to the smallest useful feature contract |
| Pure domain rules | Calculations, permissions, state transitions, validation | No React and no Supabase |
| Platform/shared | Auth session, typed errors, logging, response/CORS helpers | Generic only after at least two real consumers need the same behavior |
| Edge handler | Authenticate → parse/validate → authorize → execute → respond | Business work lives in named functions; every branch shares the same gate |

Prefer feature-first colocation (`src/features/<capability>/...`) when it makes an active workflow easier to load as a unit. Do not create `types.ts`, `schema.ts`, `repository.ts`, and `service.ts` mechanically for every entity. A new file must either isolate a stable responsibility, provide reuse, enable a focused test, or materially shorten the orchestrator.

### SOLID checks for every slice

- **Single responsibility:** can the module's purpose be stated without “and”? If not, extract along workflow/state ownership.
- **Open/closed:** can a new route, document mode, or integration variant be added through data/config plus one implementation, instead of parallel conditionals?
- **Liskov substitution:** do adapters return the same domain/error contract for real, empty, forbidden, and failed states?
- **Interface segregation:** does a component receive only the commands/data it uses, rather than the whole auth or page controller?
- **Dependency inversion:** are business calculations and transitions testable without Supabase, React, or a browser?

### Anti-abstraction guardrail

Each completed slice must report:

- lines and files before/after;
- largest function/component before/after;
- direct data-client imports removed;
- duplicated rule sites removed;
- tests added or strengthened;
- any new indirection introduced.

The default expectation is net-negative or LOC-neutral. A net-positive slice needs an explicit reliability justification such as replacing duplicated authorization, adding runtime validation at an external boundary, or creating missing characterization coverage.

## 6. Candidate register

### P0 — make change safe and measurable

| ID | Candidate | Evidence | Intended result | Acceptance gate |
|---|---|---|---|---|
| P0.1 | Replace the Bash-only email-redirect check with a cross-platform Node script | `npm run build` is blocked on the documented Windows environment; F-004 in `docs/audit-report-2026-08-26.md` | One build command on Windows and CI | `npm run build` succeeds on Windows and CI; negative fixture proves the redirect guard still fails closed |
| P0.2 | Add canonical `typecheck`, `test:frontend`, `test:edge`, and `test` scripts | No `test` script; the two suites use different runners | One obvious verification entry point for humans and agents | Aggregate command runs both suites and returns the first real failure without hiding either result |
| P0.3 | Diagnose Vitest worker teardown and establish a fast focused-test mode | Passing single files can take 27–90 seconds and report fork termination timeouts | Predictable local feedback | Record before/after wall time; no worker-timeout warning on a passing focused test |
| P0.4 | Introduce a lint ratchet rather than attempting a global cleanup | Existing lint has thousands of historical findings and unused-variable checking is disabled | New/changed code cannot add debt | Diff-scoped or baseline-aware lint passes; enable unused rules in one bounded directory first |
| P0.5 | Add a repeatable architecture metrics script | Current measurements required ad-hoc commands | Every PR can report files/LOC/large files/direct Supabase imports | Script excludes generated types, migrations, and audit history and produces stable JSON/Markdown |
| P0.6 | Turn route inventory generation into a check | The generator currently prints for manual paste and found a duplicate `/support-tickets` route | Route/KB drift fails automatically | `--check` mode compares generated inventory; CI or the aggregate verification command runs it |

### P1 — route, layout, and navigation simplification

| ID | Candidate | Evidence | Expected benefit | Risk |
|---|---|---|---|---|
| P1.1 | Resolve duplicate `/support-tickets` registration | Current generator identifies two components on the same path; React Router reaches only one | Remove ambiguity and one dead branch | Low after confirming intended component and deep links |
| P1.2 | Split `App.tsx` into route modules by surface | 1,244 lines, about 244 routes, and 221 lazy imports | Load one route family at a time; smaller conflict surface | Medium: route order, redirects, and guards are security-sensitive |
| P1.3 | Use nested layout routes to retire mechanical wrappers | 71 wrappers / 1,369 lines; most only render `DashboardLayout`, `ClientLayout`, or `AcademyLayout` around one child | Estimated 700–1,100 net lines removed and fewer files to inspect | Medium: preserve Suspense and provider placement |
| P1.4 | Establish one route metadata contract for guard tier, layout, title, and navigation | `App.tsx`, `DashboardLayout.tsx`, `AcademyLayout.tsx`, route inventory, and smoke links encode overlapping route facts | Fewer mismatches; easier route/access review | High if metadata starts making product authorization decisions; RLS remains independent |
| P1.5 | Split `navigationConfig.ts` by real responsibility and remove unused exports | Only `ACADEMY_ONLY_ROUTES` has an importer; most menu/footer exports are unused while live menus are hard-coded elsewhere | Remove stale configuration and prevent false sources of truth | Low after compile/import sweep |

Implementation order: P1.1, characterization tests for redirects/guards, P1.5, route-module extraction, nested layouts, then metadata consolidation. Do not combine the full route migration into one PR.

### P1b — validate the remaining unreachable islands and proven clones

The council's static import graph found 61 production TS/TSX files (about 13,700 lines) not reachable from `src/main.tsx`. This is candidate evidence only: dynamic loaders, external consumers, and incomplete graph resolution can create false positives. Validate in small domain batches using route/menu checks, exact-export grep, May–August history, runtime/build checks, and production evidence where relevant.

Highest-confidence investigation candidates:

| Candidate | Evidence | Potential |
|---|---|---:|
| `src/pages/AdminManagePackages.tsx` | 1,780 lines, zero inbound imports; `/admin/manage-packages` has routed to `PackageBuilder` since January, yet the stale file continued receiving edits | about 1,780 lines |
| `src/pages/TenantDetail.tsx` | 1,095 lines, zero inbound imports; `App.tsx` records consolidation into `ClientDetailWrapper` | about 1,095 lines |
| Legacy client suggestion pages | Three pages totaling about 580 lines; current routes redirect to Support Tickets | about 580 lines |
| `src/components/workboard/**` | Four-file, 1,286-line disconnected island | up to 1,286 lines after product/audit confirmation |
| Zero-inbound hooks | Includes `useStageReleases`, `usePortfolioCockpit`, `useMeetingSeries`, `usePackageUsage`, `useMeetingMinutes`, and others | Verify individually; hooks can have indirect or planned consumers |

The conservative first goal is 3,000–6,000 additional lines, not the full graph total. Anything externally callable or dynamically resolved remains until positively disproven.

The clone scan also found bounded consolidation opportunities:

- `AddClientTaskDialog.tsx` and `AddStaffTaskDialog.tsx` are both 335 lines and differ by only a small set of task-owner behaviors. Prefer a shared task form/controller plus thin role adapters, not a large boolean-prop component.
- `extract-note-title` and `extract-suggest-title` Edge Functions are about 135 lines each and differ by roughly a dozen lines. A shared title-extraction service could remove about 100 lines while preserving two public endpoints.
- `DraggableSeatCard` and `SeatCard` share a substantial presentation region. Extract a display core while leaving drag behavior in its adapter.
- `useStageQualityCheck.tsx` contains repeated internal evaluation blocks. Consolidate them into one pure evaluation pipeline with fixtures.

First-wave clone target: 800–1,500 net lines removed with parity tests. Similar-looking Resource Hub, communications, profile, and rock dialogs are not automatically mergeable; consolidate only when their lifecycle and authorization invariants match.

### P2 — establish one practical feature boundary

| ID | Candidate | Evidence | Intended result | Gate |
|---|---|---|---|---|
| P2.1 | Re-evaluate the Lifecycle Checklists pilot from the April Clean Architecture proposal | `src/domain`/`src/data` still do not exist; `useLifecycleChecklists.ts` still owns types, raw Supabase queries, React Query, and toasts | Prove a minimal feature API/query/domain convention without a broad rewrite | Confirm the admin feature is still used; add behavior tests first; do not add four files per type mechanically |
| P2.2 | Write `src/ARCHITECTURE.md` after the pilot, not before it | Existing proposal planned this but the pilot never landed | Give Lovable/AI a short code-adjacent convention grounded in working code | One page, examples link to real files, import rules are lintable |
| P2.3 | Add scoped import rules | 615 page/component/hook files import the Supabase client | New code follows the boundary while legacy code migrates gradually | Apply only to the pilot/new feature directories first; expand by ratchet |

The pilot succeeds if the page becomes easier to read, domain behavior is independently testable, direct data access moves behind a small adapter, and total feature LOC does not grow materially. If it produces ceremony without simplification, revise the convention before rolling it out.

### P3 — central platform responsibilities

| ID | Candidate | Evidence | Intended result | Notes |
|---|---|---|---|---|
| P3.1 | Split authentication session, profile loading, memberships, and RBAC helpers | `useAuth.tsx` owns all four plus navigation and a `setTimeout` workaround | Smaller provider contract; queryable/retryable profile state; pure access helpers | Preserve the profile-failure recovery added after F-016 |
| P3.2 | Consolidate role and permission predicates | `unicorn_role` appears in 133 files; raw checks coexist with `isVivacityStaffRole`, `isSuperAdmin`, `usePermission`, and route guards | One vocabulary for identity class vs feature permission | Do not replace feature permission with broad role checks |
| P3.3 | Standardize typed feature errors and empty/forbidden states | Recent audits found data failures rendered as legitimate empty content | UIs distinguish empty, loading, forbidden, and failed | Start with current Audits and document delivery, where failures are consequential |
| P3.4 | Tighten TypeScript by directory | Frontend strictness is off and `any` is widespread | Stop new unsafe contracts while avoiding a repo-wide flag day | Order: `noFallthroughCasesInSwitch`, unused checks, `noImplicitAny`, `strictNullChecks`, then `strict`; use scoped configs or project references |
| P3.5 | Standardize React Query keys and invalidation per feature | Hundreds of query-hook files and many direct page/component calls | Predictable caching and smaller mutation blast radius | Measure duplicate query keys and stale-cache incidents before choosing a library |
| P3.6 | Break the client-timeline import cycle | `useClientManagementData.tsx` and timeline helpers depend on types owned by the React hook | Move shared timeline types to a React-free module | Low-risk first dependency-inversion cleanup |

### P4 — consolidate rules with demonstrated drift

| ID | Rule family | Incident/evidence | Target state |
|---|---|---|---|
| P4.1 | Package usage and renewal-window calculations | August fixes found independent lifetime/window formulas across functions and views | One database-level canonical calculation contract with frontend display adapters only |
| P4.2 | Conversation participant insertion | One invalid `auth.users` FK row caused an entire batch to fail silently; the same pattern existed in another path | One server-side operation with explicit per-row outcomes and logging; callers cannot silently ignore failure |
| P4.3 | Timeline event types/titles | Multiple August fixes updated event projections and labels in several places | Canonical event contract plus exhaustive rendering test |
| P4.4 | Audit type labels/templates | Frontend canonical maps coexist with local Edge Function copies | Generate or validate cross-runtime maps from one small data contract; fail a drift check when values diverge |
| P4.5 | System-account/staff predicates | Nine call sites were patched for `is_system_account`, followed by a grant incident | One query/helper policy per list use case; schema grants included in the same migration |
| P4.6 | Document lifecycle/status | Manage Documents, bulk jobs, generation, delivery, versioning, and stage links each carry overlapping status logic | Explicit state machine or pure transition helpers with invalid-transition tests |

P4 candidates are reliability work first and LOC work second. Consolidation can add validation code while still reducing the number of sources of truth.

### P5 — Edge Function consistency

| ID | Candidate | Evidence | Intended result |
|---|---|---|---|
| P5.1 | Adopt `_shared/response-helpers.ts` in bounded batches | About 10 adopters; dozens of local response helpers with different argument orders and envelopes | One CORS/cache/error response implementation, smaller functions |
| P5.2 | Define a standard handler skeleton | Roughly 199 tracked `index.ts` files use several auth/helper families | Authentication and validation visibly precede every DB/external action |
| P5.3 | Extract service logic from the largest handlers | `tga-sync` 2,674 lines; Ask Viv 1,874; compliance assistant 1,610 | Test pure transforms and mode dispatch without invoking `Deno.serve` |
| P5.4 | Add runtime request schemas at trust boundaries | TypeScript unions do not validate attacker JSON; Zod/runtime allowlists are inconsistent | Every state-changing external request is parsed/validated before authorization-dependent work |
| P5.5 | Keep an auth-adoption check in the aggregate suite | Security guardrail already calls for this; current scripts are shell-only and not automatically run everywhere | New/modified functions cannot land without an approved caller/machine gate |

Migrate one response shape family at a time. Some callers may depend on raw JSON rather than `{ ok, data }`; shared code must preserve each public contract or version it deliberately.

### P6 — active hotspot slices

Do not create one “large-files cleanup” PR. Use one workflow slice per PR:

| Order | Slice | First seams to extract | Required characterization |
|---:|---|---|---|
| 1 | Documents/generation | filters and selection model; status transitions; delivery commands; dialog controllers | existing document list, generate, resume, deliver, and version-state behavior |
| 2 | Client identity/invitations | capacity decision; invite/promote/swap commands; contact projection | real client vs impersonation, FK failure fallback, role ceiling, pending invite |
| 3 | Packages/time | pure renewal-window calculation; allocation mutation adapter; presentation model | real renewal example, carry-in, split allocations, boundary dates |
| 4 | Messaging/broadcast | campaign command; participant resolution; notification result model | multi-tenant campaign, missing auth user, idempotency, read projection |
| 5 | Academy builder | course draft model; asset/resource commands; form sections | create/edit/publish, tenant entitlement, facilitator visibility |
| 6 | EOS live meeting | facilitator commands; client-only viewing state; realtime adapter | optimistic actor update, remote participant update, reconnect/fallback |
| 7 | Current Audits | template builder controller; status transition; report model | error vs empty, completion/action sync, linked-stage navigation |
| 8 | AI and integrations | orchestration services and telemetry | usage evidence first; preserve external contracts and timeout behavior |

Per-slice targets:

- page/component orchestrator under about 600 lines where the split is natural;
- no extracted component over about 400 lines unless it represents one coherent editor/workflow;
- direct Supabase calls removed from the page-level orchestrator;
- pure rules covered without rendering React;
- no net increase in duplicated types or labels;
- browser verification for the named critical workflow.

### P7 — residual retirement and schema candidates

These are investigation candidates, not approved drops:

1. `document_ai_audit` after checking every table/function/trigger/cron consumer.
2. Deprecated Academy tier enum/columns after a column-privilege and dependency sweep.
3. `get_client_eos_overview` after confirming no external consumer.
4. Tasks Phase-6 compatibility artifacts such as legacy released-task sources or duplicate `package_id` writes.
5. Legacy document flags such as `isclientdoc` / `is_released` after all current consumers are reconciled.
6. Observation-period Edge Functions only when the existing window, production logs, callers, and owner decision all support retirement.

Every schema/RPC/trigger candidate requires a migration, the live RPC/trigger scans in `AGENTS.md`, explicit grants where relevant, an audit entry, and post-apply verification. Never bundle speculative schema cleanup into a frontend refactor PR.

## 7. Documentation and KB renewal

### Current findings

- At least 22 KB documents are beyond their own reconsider/review date.
- A mechanical audit found about 230 broken local KB links. The dominant cause is post-consolidation paths such as `../src/...` from `docs/kb/codebase-state/**`, which no longer reach the repo root.
- `docs/audit-log/INDEX.md` contains 151 links using the former `audit/...` directory even though entries now live in `entries/...`.
- `architecture.md`, `module-status.md`, and `codebase-map.md` reflect April/May commits and materially predate the May–August feature stream and the August deletion program.
- Their inventories are stale: old docs cite 117–124 Edge Functions, about 187 pages, and about 895 migrations; the current repository has about 197 non-`_shared` function directories, 292 page TS/TSX files, 296 hook files, and more than 1,500 migrations. Repository directory count must not be mislabeled as the production deployed-function count.
- Several KB meta-docs still describe the old three-repository model after the 6 August consolidation.
- The pinned set is already at its 1,500-line budget. Refresh it by replacing stale text, not adding another large pinned guide.

### Immediate truth-safety pass

Perform before architectural refactors:

1. Add explicit stale/currentness banners to the three May-era current-state docs.
2. Correct the three-repo language in KB README/source-precedence/hygiene files.
3. Mark the April Clean Architecture proposal as superseded by this evidence-led plan; retain it as decision history.
4. Close the dead-code plan's PR #455 tracker with merge `b8933727` and record a final comparable baseline.
5. Repair `docs/audit-log/INDEX.md` entry paths mechanically and verify every target.
6. Add a local Markdown link checker covering README, KB, audit index, and code-adjacent docs.

The pass must also correct these high-impact factual errors rather than merely refreshing dates:

- `pinned/orientation.md`, `pinned/team-roles.md`, and ADR-011 still describe Lovable direct-to-main/no-review as canonical and even say Claude Code cannot write the codebase. Supersede that policy with the current branch/PR/no-auto-merge model from `AGENTS.md`; preserve ADR-011 as historical and add an amending ADR.
- `pinned/conventions.md` omits current staff/relationship roles, uses the obsolete `tenant_members.user_uuid` column in copyable RLS SQL, and teaches bespoke `auth.getUser()` handlers where shared `requireCaller`/machine-secret helpers are now canonical. Correct these before they are reused in security-sensitive work.
- Replace or reduce obsolete `pinned/README.md` and `pinned/CLAUDE.md`; the pinned set is at 1,491 lines and these files still describe the former three-repository system.
- Fix the route inventory generator/doc mismatch: the current doc still carries removed `/academy/team` and four legacy `/compliance-audits` routes.
- Mark `handoffs/ask-viv-client-mode.md` superseded by the agentic `ask-viv-assistant-client` implementation and create a short current runbook. Correct the stale `ClientLayout.tsx` comment that names the former function.
- Freeze or refresh `audit-log-inventory.md` using a live schema query; it is a May snapshot and contains objects later archived or dropped.
- Update `migration-1to2.md`: the user bridge is no longer open (`users.legacy_id` and `tenants.unicorn1_id` are implemented in current source/migrations).
- Correct status banners for the shipped EOS overhaul, mostly-complete Email Triage work, deprecated KPI-v1 plans, and completed dead-code program.

### Full current-state regeneration

Regenerate rather than patch around stale paragraphs:

| File | Required refresh |
|---|---|
| `docs/kb/codebase-state/module-status.md` | Active/observe/unknown/retired status, with evidence tier and last verified date; add documents/delivery, renewal periods, contacts, Xero, current Audits, Ask Viv redesign, Academy expansion |
| `docs/kb/codebase-state/architecture.md` | Tracked vs deployed Edge Function inventory, auth/helper model, document pipelines, messaging pipeline, package/time calculation ownership, current integrations |
| `docs/kb/codebase-state/codebase-map.md` | Correct relative links, generated inventories, feature-first lookup paths, test commands, actual page/hook/function counts |
| `docs/kb/codebase-state/audit-log-inventory.md` | Re-verify live schema before changing any table counts; keep audit history separate from current-state claims |
| `docs/kb/pinned/orientation.md` | Replace the “What's live (May 2026)” snapshot with a short routed summary; move volatile detail to module status |
| `docs/kb/reference/cadence.md` | Replace April “recent themes” and roadmap with the accepted optimization sequence once approved |
| `docs/kb/reference/dev-guardrails.md` | Fold in August incidents already canonical in `AGENTS.md`; link instead of duplicating long narratives |

### Context-efficiency rules

- Keep stable opinion pinned; keep current feature inventories fetched/on-demand.
- Add `status: active | historical | superseded | planning` to long handoffs and proposals.
- Generate lifecycle indexes for all 19 handoffs and 13 codebase-state files; their current README files list only a subset.
- Do not delete completed handoffs blindly. Mark superseded content, point to the replacement, and move it out of default routing only after links are updated.
- Prefer generated tables for routes/counts and prose for why/constraints.
- Maintain one “active system evidence” matrix rather than repeating usage claims across orientation, module status, architecture, and cadence.
- Link to audit entries for incident detail; do not paste incident narratives into pinned context.
- Add a freshness/link check to the aggregate verification command.

## 8. Execution plan and PR sequence

### Phase 0 — baseline and verification (1–3 PRs)

1. Cross-platform build guard and canonical scripts.
2. Vitest teardown investigation and focused-test profile.
3. Architecture metrics, route drift, KB freshness, and Markdown link checks.

**Exit gate:** a Windows developer or agent can run one documented command that typechecks/builds and runs both test harnesses; metric output is reproducible.

### Phase 1 — KB truth restoration (2–4 PRs)

1. Repair meta-doc consolidation language and broken links.
2. Regenerate module status and codebase map from source/history.
3. Reconcile architecture with source plus the deployed Edge Function list.
4. Add the active-system evidence matrix and classify historical handoffs.

**Exit gate:** no broken links in routed KB files; current-state docs reflect a current SHA and distinguish repository inventory from production state.

### Phase 2 — route/composition simplification (3–5 PRs)

1. Duplicate route and stale navigation-config cleanup.
2. Route characterization tests.
3. Extract route families without behavior changes.
4. Convert one layout family to nested routes; repeat after review.
5. Introduce metadata only for facts genuinely shared by router/navigation/tests.

**Exit gate:** route count and guards unchanged except intentional cleanup; wrapper LOC reduced; route inventory check passes.

### Phase 3 — boundary pilot and platform seams (3–5 PRs)

1. Lifecycle pilot characterization.
2. Minimal feature API/query/domain extraction.
3. Code-adjacent architecture guide and scoped lint boundary.
4. Auth/profile/membership split.
5. Permission predicate consolidation in one route family.

**Exit gate:** the convention is demonstrably smaller/easier than the original and can be copied without creating boilerplate.

### Phase 4 — active hotspot program (one workflow per PR)

Follow the P6 order, re-ranking when live incidents or roadmap needs change. Stop after each slice to measure whether change lead time, file size, testability, and LOC are improving.

**Exit gate per slice:** named workflow tests and browser checks pass; no permission/data-contract regression; before/after metrics recorded.

### Phase 5 — Edge Function convergence (several small batches)

Group functions by response contract and auth model, not alphabetically. Migrate low-risk/internal functions first, then public/external functions with explicit contract tests.

**Exit gate:** shared response/auth helpers are the default for new functions; local variants require a documented reason; edge suite passes.

### Phase 6 — type-safety ratchet and residual retirement

Tighten one directory or feature at a time. Run schema retirement as separate audited changes only after application architecture has made ownership clear.

## 9. Verification matrix

| Change type | Minimum verification |
|---|---|
| Docs-only | Markdown link check, freshness metadata check, generated inventory diff, manual source citation spot-check |
| Pure rule extraction | Focused unit tests with boundary/error cases, typecheck, net-LOC report |
| Page/component split | Existing/focused tests, browser smoke for the workflow, console-error check, route/permission check |
| Route/layout change | Generated route diff, every affected guard tier, direct deep links, redirects, client and staff personas |
| Query/API boundary | Success, empty, forbidden, RLS-hidden, and network-error states; cache invalidation check |
| Edge Function refactor | `npm run test:edge-functions`, request auth negatives, CORS preflight, response-contract test, no deploy unless approved |
| Package/time calculation | Fixed real-world fixture, renewal boundary dates, carry-in, split allocations, staff/client display parity |
| Messaging participant change | Missing-auth-user row, valid rows in same batch, notification fan-out, idempotent retry, logged skips |
| Schema/RPC/trigger change | Frontend write grep, `pg_proc`/trigger sweep, signature/grant verification, audit entry, hosted apply/verify workflow |

Use real client personas where role behavior is under test. “View as Client” is not a substitute for a genuine client session.

## 10. Program measures

Track outcomes quarterly, not just deletions:

| Measure | Baseline | 90-day target |
|---|---:|---:|
| Human-maintained product LOC | about 416k | Net reduction of 5–8%, excluding generated types/tests/migrations |
| Product files over 600 lines | 120 | Below 80, with no arbitrary split-only files |
| Product files over 1,000 lines | 35 | Below 20 |
| Layout wrapper files | 71 | Below 20 if nested routes prove stable |
| Direct Supabase calls in pages/components | 210 files | Reduce by at least 40% in touched/high-churn features |
| KB broken local links | about 230 | 0 in routed/current docs |
| Past-due routed KB docs | at least 22 | 0 without an explicit historical/superseded status |
| Standard build/test entry point | none | One cross-platform command |
| New Edge Functions using standard auth/response skeleton | inconsistent | 100% of newly added functions |

Do not optimize to these numbers at the expense of clarity. A smaller file count is not success if behavior is scattered across opaque indirection.

## 11. Stop conditions

Pause a slice and return to investigation when:

- production usage or external callers cannot be established;
- a supposed duplicate has different permission, tenancy, or response semantics;
- characterization tests cannot distinguish failure from empty data;
- the proposed abstraction increases LOC materially without removing duplicated behavior;
- the branch base or worktree changes unexpectedly;
- schema ownership requires a live database query that has not been run;
- the work would touch `docs/kb/**` or `docs/audit-log/**` through Lovable.

## 12. Evidence index

Primary repository evidence:

- `docs/dead-code-cleanup-plan-2026-08-27.md`
- `docs/audit-report-2026-08-26.md`
- `docs/kb/reference/clean-architecture-refactor.md`
- `docs/kb/pinned/kb-hygiene.md`
- `docs/kb/codebase-state/route-inventory-by-role.md`
- `scripts/generate-route-inventory.mjs`
- `src/App.tsx`
- `src/components/DashboardLayout.tsx`
- `src/hooks/useAuth.tsx`
- `supabase/functions/_shared/response-helpers.ts`

Representative real-use/history evidence:

- `docs/audit-log/entries/2026-05-04-angela-client-portal-packages-invitations.md`
- `docs/audit-log/entries/2026-06-16-tasks-overhaul.md`
- `docs/audit-log/entries/2026-07-24-eos-meeting-overhaul.md`
- `docs/audit-log/entries/2026-08-11-xero-invoice-timeline-events.md`
- `docs/audit-log/entries/2026-08-19-bulk-generate-stall-resilience.md`
- `docs/audit-log/entries/2026-08-20-client-portal-package-hours-views-window.md`
- `docs/audit-log/entries/2026-08-25-broadcast-notification-silent-participant-failure.md`
- `docs/audit-log/entries/2026-08-26-deliver-to-clients-empty-job.md`
- `docs/audit-log/entries/2026-08-27-client-portal-contacts-and-swap.md`
- `docs/audit-log/entries/2026-08-27-promote-sends-real-invitation.md`
- `docs/audit-log/entries/2026-08-28-drop-legacy-compliance-audit-tables.md`
- `docs/audit-log/entries/2026-08-28-drop-orphaned-bulk-upload-ai-analysis-rpcs.md`

## 13. First recommended action

Start with Phase 0, not a large-file refactor. The first PR should make the build guard cross-platform, add the canonical verification scripts, and turn the existing route inventory generator into a check. The second PR should repair KB routing/link truth. Only then begin route composition and the feature-boundary pilot.

That sequence improves every later human and AI change: there is one way to verify, one trustworthy map of the system, and fewer opportunities to preserve or optimize the wrong code.
