# Codebase Optimization and KB Renewal Plan

> **Last updated:** 2026-08-28 · **Reconsider by:** 2026-11-28 · **Confidence:** high on repository measurements and the May–August change history; medium on effort and net-LOC forecasts until each slice completes its characterization pass.
>
> **Reflects commit:** `unicorn-cms-f09c59e5@e91d013d` (`origin/main`, measured 2026-08-28 after PRs #457–#458).
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

## 3. Baseline at `origin/main@e91d013d`

Counts below were refreshed after the council caught `main` advancing during review. Physical lines use a deterministic Git-tracked-file/`ReadAllLines` pass; P0.5 will replace this one-off measurement with the committed metrics tool. Do not compare counts produced by a different exclusion or newline method without labeling the difference.

### Code footprint

| Metric | Baseline | Interpretation |
|---|---:|---|
| Tracked files under `src/**` + `supabase/functions/**` | 1,837 | Repository inventory after the final two Edge Function folders were removed |
| Physical lines under those paths | 506,181 | Includes generated types, tests, fixtures, and final-line differences from older `wc`-style counts |
| Lines excluding generated `src/integrations/supabase/types.ts` | 432,150 | Better all-tracked human-maintained baseline, still including tests/fixtures |
| Product TS/TSX/JS, excluding generated types and tests | 413,945 | Deterministic current net-LOC baseline; 1,735 files |
| Frontend product code | 334,143 lines | 1,468 files under the declared filter |
| Edge Function product code | 79,802 lines | 267 TS/JS files, including shared modules |
| Product files over 600 lines | 120 | 95 frontend, 25 Edge Function |
| Lines held by files over 600 lines | 118,204 | Roughly 29% of product code |
| Product files over 1,000 lines | 36 | Highest cognitive-load group |
| Parsed long-function inventory | Refresh in P0.5 | The prior 1,123/501 count came from an ad-hoc parser and is not carried forward as current truth |
| Route declarations found by the route generator | 244 | Includes one duplicate path registration |
| `*Wrapper.tsx` files | 71 / 1,369 lines | Many are layout-only adapters |
| Frontend test files | 22 | Small relative to 1,464 frontend product files |
| Edge Function test files | 56 | 39 Node `*.test.mjs` files currently execute; 17 TypeScript/Deno files are unexecuted by configured commands |

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

### Active/new, adoption volume uncertain

- Current Audits (`client_audits`) were exercised in live QA and remain under active repair, but client adoption volume is not proven.
- Ask Viv staff/client redesign shipped across late July and early August. The replacement had been fully rolled out with real usage for 22 days by 28 August; `compliance-assistant-client` was then retired. Protect the active staff/client replacements and preserve their telemetry before architecture changes.
- KPI/KPI-v2 is routed and data was verified in July. The superseded reviewer-admin UI has already been removed.
- PDP and its Academy analytics are recent. Optimize observability and boundaries first; usage maturity is still developing.

### Retired or verified absent

- Legacy Compliance Auditor frontend, function, and three tables are removed.
- Stage Documents bulk-upload-with-AI UI and its four RPCs are removed; `document_ai_audit` remains a schema candidate.
- The deprecated Academy Solo/Team/Elite tier UI is removed; its enum/column residue is a schema candidate.
- The dead-code plan's PR #455 has merged as `b8933727`; `test-mailgun`, `tga-product-lookup`, and `import-vimeo-training` are retired.
- `compliance-assistant-client` and `bootstrap-bulk-generate-system-account` were retired/deleted in `cfdeec0f`; their repository/config absence must remain durable because Supabase's GitHub sync can resurrect a deployed function whose folder remains on `main`.

### Unknown/investigate or explicitly retained

- `academy-backfill-course-thumbnails` is explicitly retained: two of 100 Academy courses still lacked a thumbnail during the 28 August investigation. It is not a retirement candidate.
- Use four unambiguous lifecycle states throughout implementation: `active/protect`, `unknown/investigate`, `retirement-approved`, and `retired/verified absent`. “Parked” never means removal-ready.

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
| P0.2 | Add canonical `typecheck`, `test:frontend`, `test:edge`, and `test` scripts | No `test` script; 39 MJS Edge test files run under Node, while 17 TypeScript/Deno test files are reached by neither that command nor Vitest | One obvious verification entry point that names every source/test class it covers | Inventory executable and orphaned tests; choose a supported runner/conversion for all 17; aggregate command reports each class and never calls 220 passing MJS tests “all Edge tests” |
| P0.3 | Diagnose Vitest worker teardown and establish a fast focused-test mode | Passing single files can take 27–90 seconds and report fork termination timeouts | Predictable local feedback | Record before/after wall time; no worker-timeout warning on a passing focused test |
| P0.4 | Introduce a lint ratchet rather than attempting a global cleanup | Existing lint has thousands of historical findings and unused-variable checking is disabled | New/changed code cannot add debt | Diff-scoped or baseline-aware lint passes; enable unused rules in one bounded directory first |
| P0.5 | Add a repeatable architecture metrics script | Current measurements required ad-hoc commands | Every PR can report files/LOC/large files/direct Supabase imports | Script excludes generated types, migrations, and audit history and produces stable JSON/Markdown |
| P0.6 | Replace the `App.tsx`-only regex route inventory with a module-aware check | The current script reads only `src/App.tsx`, scans indentation-sensitive 4,000-character windows, reports 244 routes while the KB says 249, and will silently omit extracted route modules | Route/KB drift fails automatically before route extraction begins | Typed manifest or AST/multi-file traversal emits ordered path, component, redirect target/`replace`, exact guard props, layout, lazy import, params, and duplicates; fixtures prove no route module is omitted |
| P0.7 | Establish a repeatable browser-verification harness | There is no Playwright dependency, config, E2E directory, or browser script; prior evidence is agent/manual | Reproducible, production-safe browser evidence | Public journey, staff deep link, real-client deep link, and academy-only redirect run from one documented read-only command with persona isolation and failure collectors |
| P0.8 | Define browser personas and disposable-data rules | Localhost uses hosted production Supabase; staff preview does not exercise client RLS | Tests cannot silently mutate real data or claim unsupported personas | Every journey records real/preview identity, read/write class, fixture owner, unique run ID, external-side-effect allowlist, cleanup, and post-cleanup assertion; credentials/artifacts remain outside Git |

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

### Post-Phase 2 — lint-debt retirement (planned)

The full ESLint baseline was re-measured on 2026-09-03 from the clean shared
checkout with `npx eslint . --format json`: **4,059 findings across 651 files**
(3,861 errors and 198 warnings). This is real maintenance debt, but it is not
one homogeneous problem:

| Rule family | Findings | Share | Initial interpretation |
|---|---:|---:|---|
| `@typescript-eslint/no-explicit-any` | 3,776 | 93.0% | Type-contract debt; concentrated across frontend and Edge Function code, and often needs schema/RPC knowledge rather than mechanical replacement |
| `react-hooks/exhaustive-deps` | 153 | 3.8% | Behavior-sensitive; fix with characterization tests and browser checks, not blanket dependency insertion |
| `react-refresh/only-export-components` | 38 | 0.9% | Module-boundary cleanup; mostly low risk but should be handled alongside affected component/module changes |
| `prefer-const` | 37 | 0.9% | Low-risk correctness/readability cleanup; suitable for opportunistic batches |
| All other rules | 55 | 1.4% | Triage individually; do not hide with broad disables |

A committed, machine-readable baseline superseding the summary table above —
broken down by rule, source class (`src`, `supabase/functions`, tooling),
directory, and file, plus a reviewed exception list — now lives at
[`lint-baseline.json`](lint-baseline.json) (regenerate with
`npm run lint:baseline`); its exception criteria are in
[`lint-exception-policy.md`](lint-exception-policy.md). See §22's Phase 2.5
subsection for that baseline's own measured totals and drift from the table
above.

The council conclusion is to start this program **after the Phase 2 route and
layout work has reached its exit gate**, once route boundaries and mount
lifetime are stable. Starting earlier would make route extraction and hook
dependency fixes compete for the same files and would blur whether a change is
structural or purely lint-driven. The existing P0.4 ratchet remains the guard
through Phase 2; it prevents new debt but is not a retirement plan.

Retirement should be a small, measured program rather than a global autofix:

1. Produce a committed, machine-readable baseline by rule, source class
   (`src`, tooling, and `supabase/functions`), directory, and file; record
   intentional generated/external/runtime-boundary exceptions explicitly.
2. Clear the 253 non-`any` findings first, prioritizing hook dependency and
   rules-of-hooks findings with behavior tests. This removes the signal most
   likely to indicate a real defect before tackling the large type-contract
   population.
3. Replace `any` by bounded domain batches, beginning with high-churn or
   security/data-boundary files and shared types. Use generated Supabase types,
   Zod/runtime validation at external boundaries, and explicit `unknown`
   narrowing where the input is genuinely dynamic. Do not replace `any` with
   `unknown` without adding the narrowing that makes the code safe.
4. Treat frontend and Deno/Edge code as separate workstreams with their own
   supported checks. A frontend type improvement must not silently assume that
   Deno runtime types, generated database types, or RPC contracts are current.
5. Expand the existing `no-unused-vars` pilot and other strict rules by
   directory only after each batch has a zero-regression result. Keep the
   diff-scoped ratchet active throughout.

Suggested acceptance gates per batch are: the targeted rule count decreases;
no other rule count increases; focused behavior tests and the relevant
frontend/Edge suite pass; the diff-scoped ratchet passes; and before/after
files, findings, LOC, and any new assertions or boundary types are recorded.
The eventual program exit is a zero-finding `npm run lint` (or a documented,
reviewed exception baseline) plus ratchets that prevent reintroduction. This
is a quality/type-safety program, not an excuse to refactor unrelated modules
or to make the route-composition work wait on a global cleanup.

### P3 — central platform responsibilities

| ID | Candidate | Evidence | Intended result | Notes |
|---|---|---|---|---|
| P3.1 | Split authentication session, profile loading, memberships, and RBAC helpers | `useAuth.tsx` owns all four plus navigation and a `setTimeout` workaround | Smaller provider contract; queryable/retryable profile state; pure access helpers | Preserve the profile-failure recovery added after F-016 |
| P3.2 | Consolidate role and permission predicates | `unicorn_role` appears in 133 files; raw checks coexist with `isVivacityStaffRole`, `isSuperAdmin`, `usePermission`, and route guards | One vocabulary for identity class vs feature permission | Do not replace feature permission with broad role checks |
| P3.3 | Standardize typed feature errors and empty/forbidden states | Recent audits found data failures rendered as legitimate empty content | UIs distinguish empty, loading, forbidden, and failed | Start with current Audits and document delivery, where failures are consequential |
| P3.4 | Tighten TypeScript by directory | Frontend strictness is off, `any` is widespread, and generated Supabase types currently advertise RPCs already dropped live | Stop new unsafe contracts without letting `tsc` bless a stale schema | First regenerate/diff live types without hand-editing; then ratchet flags by directory and prove the pre/post typechecked file universe covers every intended frontend, Node, and Deno class |
| P3.5 | Standardize React Query keys and invalidation per feature | Hundreds of query-hook files and many direct page/component calls | Predictable caching and smaller mutation blast radius | Measure duplicate query keys and stale-cache incidents before choosing a library |
| P3.6 | Break the client-timeline import cycle | `useClientManagementData.tsx` and timeline helpers depend on types owned by the React hook | Move shared timeline types to a React-free module | Low-risk first dependency-inversion cleanup |

### P4 — consolidate rules with demonstrated drift

| ID | Rule family | Incident/evidence | Target state |
|---|---|---|---|
| P4.1 | Package usage and renewal-window calculations | August fixes found independent formulas; `rpc_get_package_usage` still sums raw entries while views/functions and `ClientTimeTab` use allocations; browser renewal is multi-request and non-atomic | Design gate first: prove parity and ownership, then an idempotent transactional renewal command with locking and explicit core-vs-best-effort side effects |
| P4.2 | Conversation participant insertion and broadcast delivery | One invalid auth FK row dropped a batch; broadcast claiming, conversation/message creation, attachment metadata, notifications, recipient status, and totals are non-atomic and race-prone | Design gate first: decide eligibility and notification guarantees, then atomic claiming/idempotency, explicit per-user outcomes, and durable observable delivery results |
| P4.3 | Timeline event types/titles | Multiple August fixes updated event projections and labels in several places | Canonical event contract plus exhaustive rendering test |
| P4.4 | Audit type labels/templates | Frontend canonical maps coexist with local Edge Function copies | Generate or validate cross-runtime maps from one small data contract; fail a drift check when values diverge |
| P4.5 | System-account/staff predicates | Nine call sites were patched for `is_system_account`, followed by a grant incident | One query/helper policy per list use case; schema grants included in the same migration |
| P4.6 | Document lifecycle/status and publication | Documents, versions/current pointer, stage releases, bulk jobs/items, generation, delivery, and legacy visibility flags are separate aggregates; SharePoint publication currently performs non-atomic archive/publish/pointer/audit requests | Inventory owners/consumers and compatibility projections first; define bounded state machines, then a transactional locked publish command with pointer/status invariants |

P4 candidates are reliability work first and LOC work second. Consolidation can add validation code while still reducing the number of sources of truth.

P4 target states are design hypotheses, not implementation instructions. Before selecting database, Edge, or pure-domain ownership for P4.1, P4.2, P4.5, or P4.6, write a short ADR/design packet and perform the live read-only object/caller sweep. Separate characterization, additive transactional contract, caller switches, observation, and old-contract retirement. Auth mechanics and permission-policy changes are likewise separate PRs.

### P5 — Edge Function consistency

| ID | Candidate | Evidence | Intended result |
|---|---|---|---|
| P5.1 | Adopt `_shared/response-helpers.ts` in bounded batches | About 10 adopters; dozens of local response helpers with different argument orders and envelopes | One CORS/cache/error response implementation, smaller functions |
| P5.2 | Define a standard handler skeleton | 200 tracked top-level function `index.ts` files use several auth/helper families | Authentication and validation visibly precede every DB/external action |
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

1. `document_ai_audit` is Tier C, not removal-ready: `analyze-document` still inserts into it, while its current frontend caller appears to send mismatched request field names. Repair or retire that caller/function contract, check deployed/external invocations and logs, remove the writer in one observed PR, then consider a later drop migration.
2. Deprecated Academy tier enum/columns after a column-privilege and dependency sweep.
3. `get_client_eos_overview` after confirming no external consumer.
4. Legacy document flags such as `isclientdoc` / `is_released` after all current consumers are reconciled.
5. Unknown Edge Functions only when production logs, repository/deployed state, external callers, observation window, and owner decision all support retirement.

Do not reopen the old Tasks Phase 6/7 compatibility cleanup without a new live-lineage audit. The `stage_task` union, released-task compatibility columns/branches, backfill RPC, and old `rpc_publish_stage_tasks` package write were already removed; current `client_action_items.package_id` is a deliberate package-template foreign key.

Every schema/RPC/trigger candidate requires a migration, the live RPC/trigger scans in `AGENTS.md`, explicit grants where relevant, an audit entry, and post-apply verification. Never bundle speculative schema cleanup into a frontend refactor PR.

## 7. Documentation and KB renewal

### Current findings

- At least 22 KB documents are beyond their own reconsider/review date.
- A mechanical audit found about 230 broken local KB links. The dominant cause is post-consolidation paths such as `../src/...` from `docs/kb/codebase-state/**`, which no longer reach the repo root.
- `docs/audit-log/INDEX.md` contains 151 links using the former `audit/...` directory even though entries now live in `entries/...`.
- `architecture.md`, `module-status.md`, and `codebase-map.md` reflect April/May commits and materially predate the May–August feature stream and the August deletion program.
- Their inventories are stale: old docs cite 117–124 Edge Functions, about 187 pages, and about 895 migrations; the current repository has 200 tracked top-level function `index.ts` files, 292 page TS/TSX files, 296 hook files, and 1,534 migrations. Repository directory count must not be mislabeled as the production deployed-function count.
- Several KB meta-docs still describe the old three-repository model after the 6 August consolidation.
- The pinned set is already at its 1,500-line budget. Refresh it by replacing stale text, not adding another large pinned guide.

### Immediate truth-safety pass

Perform before architectural refactors:

1. Add explicit stale/currentness banners to the three May-era current-state docs.
2. Correct the three-repo language in KB README/source-precedence/hygiene files.
3. Mark the April Clean Architecture proposal as superseded by this evidence-led plan; retain it as decision history.
4. Close the dead-code plan through PRs #457–#458, record the final 18-retired/one-retained disposition, and replace its “pending merge” summaries with the merged `e91d013d` state.
5. Repair `docs/audit-log/INDEX.md` entry paths mechanically and verify every target.
6. Add a local Markdown link checker covering README, KB, audit index, and code-adjacent docs.
7. Add `docs/kb/reference/README.md` as the lifecycle registry for long plans/handoffs; until this proposal is merged and explicitly accepted, label it `planning`, never `active`.

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

### Phase 0 — baseline and verification (three or more independent PRs)

1. **P0-A — executable baseline:** cross-platform build guard; named frontend/Node-MJS/Deno test universe; canonical typecheck/build/test commands; Vitest teardown investigation. Prove the guard with a negative fixture and disclose every unexecuted test class.
2. **P0-B — deterministic checks:** architecture metrics; module-aware route manifest; KB freshness/link/anchor checks. Keep this free of Playwright dependency and lockfile churn.
3. **P0-C — browser harness:** optional committed Playwright dependency/config/scripts/persona contract in its own PR. Default is read-only; hosted-production mutation remains separately authorized.
4. **P0-D — CI decision, if approved:** the repository currently has only Bash security guard workflows and no build/test CI. Define runner, secrets policy, cost, browser availability, and which read-only checks are safe before claiming anything “passes in CI.”

**Exit gate:** a Windows developer or agent can run one documented command that reports the complete intended source/test universe, typechecks/builds, and runs every supported harness; metrics are reproducible; route checking remains valid after route modules split. Browser infrastructure and CI each have an explicit accepted scope rather than being smuggled into the baseline PR.

### Phase 1 — KB truth restoration (2–4 PRs)

1. Repair meta-doc consolidation language and broken links.
2. Regenerate module status and codebase map from source/history.
3. Reconcile architecture with source plus the deployed Edge Function list.
4. Add the active-system evidence matrix and classify historical handoffs.

**Exit gate:** no broken links in routed KB files; current-state docs reflect a current SHA and distinguish repository inventory from production state.

### Phase 2 — route/composition simplification (3–5 PRs)

1. Remove only the later duplicate `/support-tickets` registration and verify the still-wrapped canonical route.
2. Add route/redirect/guard characterization.
3. Land the module-aware route manifest/check before any route leaves `App.tsx`.
4. Remove stale navigation config only after caller and persona checks.
5. Extract one route family without layout, guard, metadata, or auth-provider changes.
6. Convert one layout/guard family to nested routes per PR after explicit mount-lifetime decisions.
7. Consolidate metadata last, only for facts genuinely shared by router/navigation/tests.

**Exit gate:** route count and guards unchanged except intentional cleanup; wrapper LOC reduced; route inventory check passes.

Do not combine route-module extraction, nested layouts, auth-provider splitting, or metadata consolidation. Preserve a last-known-good normalized route manifest and browser evidence so each family can roll back with one revert.

### Phase 2.5 — lint-debt retirement (after Phase 2; several small PRs)

1. Publish the rule/source-class baseline and exception policy.
2. Remove non-`any` correctness findings, with characterization coverage for
   hook dependency and rules-of-hooks changes.
3. Retire `any` in bounded frontend and Edge batches, starting at shared
   contracts and high-risk data/auth boundaries.
4. Ratchet strict rules by directory as each batch reaches zero regressions.

**Exit gate:** the targeted baseline is lower with no compensating increase in
other rules; supported frontend and Edge checks pass; the lint ratchet passes;
and each batch has before/after metrics and reviewed exceptions. Route/layout
work is not considered blocked by residual lint debt, and this phase does not
begin until Phase 2's route/composition exit gate is met.

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
| Human-maintained product LOC | 413,945 under the refreshed product filter | Net reduction of 5–8%, excluding generated types/tests/migrations |
| Product files over 600 lines | 120 | Below 80, with no arbitrary split-only files |
| Product files over 1,000 lines | 36 | Below 20 |
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

Start with Phase 0, not a large-file refactor. Do not bundle Phase 0 into one change: P0-A establishes the executable baseline, P0-B adds deterministic architecture/route/KB checks, and P0-C separately proposes the safe Playwright harness. The first KB truth-safety PR should follow or proceed in parallel without changing code behavior. Only then begin route composition and the feature-boundary pilot.

That sequence improves every later human and AI change: there is one way to verify, one trustworthy map of the system, and fewer opportunities to preserve or optimize the wrong code.

## 14. Claude Code implementation contract

Claude Code should treat this plan as a queue of independent investigations and PRs, not one authorization to refactor the repository. Every implementation turn begins by writing a small execution packet and ends with an evidence report.

### Required execution packet before editing

```markdown
## PR execution packet

- Packet ID / status / owner / risk / reconsider-by:
- Candidate IDs and dependency PRs:
- Current `origin/main` SHA / exact measured baseline SHA / timestamp:
- Branch / absolute worktree path:
- Node / npm / browser / runner versions:
- Problem and observable user impact:
- Evidence tier and last verified date:
- In-scope files, imports, routes, redirects, guards, layouts, and public contracts:
- Known callers/consumers with evidence, confidence, and last-verified timestamp:
- Query keys, invalidation, retries, caches, and failure/empty-state behavior:
- Tables/views/RPC signatures/triggers/RLS/grants/storage/realtime/generated types:
- Edge endpoint method/status/body/headers/CORS/auth/config/idempotency contract:
- Cron, `pg_net`, webhooks, OAuth/email/add-in/manual callers, external dashboards, and telemetry:
- Behavior freeze: success, empty, forbidden, error, timeout, and retry invariants:
- Explicit non-goals:
- Characterization test and independent oracle to add/run first:
- Playwright real-vs-preview persona, route, viewport, fixture, read/write class, assertions, prohibited side effects, cleanup:
- Non-Playwright evidence required:
- Expected production/test/total LOC, largest module/function, direct-import, fan-in/out/cycle, duplicate-rule, bundle/request/runtime change:
- Dependency/lockfile policy and allowed new indirection:
- Rollback/compatibility boundary, observation window, signals, and stop thresholds:
- Documentation matrix: current docs to update, historical docs not to edit, generated inventories to refresh:
- Deployment/production-mutation authority (normally none):
- Stop conditions specific to this PR:
```

If the packet cannot name the affected public behavior and an independent oracle, the candidate remains investigation-only.

### Required implementation discipline

1. Fetch `origin/main` and create a new isolated worktree/branch from the current tip. Never switch the shared checkout.
2. Record `git status`, baseline SHA, package/tool versions, and the exact verification commands before editing.
3. Run the focused baseline behavior first. A later failure cannot be called pre-existing without this evidence.
4. Add or strengthen characterization coverage before structural movement when the affected behavior is not already observable.
5. Make one coherent change. Do not opportunistically fix unrelated findings discovered during the pass; record them as follow-ups.
6. Inspect the complete diff, including generated lockfile changes and documentation, before verification.
7. Run focused checks, then affected suites, then build/type/lint checks, then browser verification against the final diff.
8. Re-run the blast-radius searches after the edit. A pre-edit caller search is insufficient when imports, routes, or signatures moved.
9. Ask a read-only council to review the final diff from independent axes before declaring it ready.
10. Stop after PR creation unless Carl explicitly asks to merge in that session.

### Change-size limits

- One candidate family or one user workflow per PR.
- A structural refactor and a schema change are separate PRs unless the code cannot compile against either state independently and a phased compatibility design is documented.
- A route-family extraction and an auth-policy redesign are separate PRs.
- A shared Edge Function helper and broad adoption are separate: land/test the helper first, then migrate small contract-compatible batches.
- TypeScript flag changes are separate from business refactors. Fixing unrelated newly surfaced errors in the same PR hides scope.
- Deletion candidates are grouped by one feature/domain, never as a mixed grab-bag after the first dead-code program.

## 15. Second-round blast-radius checklist

### Program freshness and lifecycle gate

This council pass caught `origin/main` advancing while the plan was being reviewed. Treat that as a mandatory control, not a one-off inconvenience:

- Record both `current origin/main SHA` and `measured baseline SHA`, with timestamp, at packet creation and again immediately before PR handoff.
- If `main` advanced, inspect every intervening commit and refresh affected candidate state, metrics, route/schema inventories, and evidence. “Docs-only upstream change” must be demonstrated, not assumed.
- This plan remains `planning` until it is reviewed, merged, and explicitly accepted. An implementation branch created from `main` cannot depend on an unmerged plan unless the PR is intentionally stacked and says so.
- Create a lifecycle registry for KB plans/handoffs. Current implementation context may include only documents marked active; planning, historical, completed, and superseded material is evidence, not an instruction queue.
- Before the first architecture PR, remove or quarantine current KB instructions that conflict with `AGENTS.md`. The warning added to `cadence.md` is only an interim safety measure.

### Test-universe gate

The current Edge test inventory is heterogeneous:

- 39 `*.test.mjs` files are executed by `npm run test:edge-functions`; the council ran 220/220 successfully.
- 17 TypeScript/Deno-style test files are reached by neither that Node command nor `vitest.config.ts`, which includes only `src/**`.
- Static source-pattern assertions are useful guardrails but do not prove a handler's runtime behavior.

Phase 0 must inventory every intended source/test class, select a supported runner or conversion path for the 17 unexecuted files, and make the aggregate output name what ran and what did not. Scoped TypeScript configs must likewise compare their pre/post file universe so project references cannot silently make errors disappear by excluding files.

### Build and verification infrastructure

Look out for:

- The current email-redirect guard uses a Bash pipeline whose exit/output semantics must be preserved when rewritten in Node. Prove both a clean tree and a deliberately bad fixture.
- Use npm only. Do not regenerate `bun.lock` as a side effect of adding Playwright or another dev dependency.
- Adding `@playwright/test` changes `package.json` and `package-lock.json`; isolate that infrastructure change and review the lockfile for unrelated churn.
- Build, Vitest, Playwright, and Vite can share caches/output directories. Serialize commands until isolation is proven; do not run multiple browser/build jobs that race on the same worktree.
- A green build says nothing about route authorization, RLS, realtime cleanup, external webhook contracts, or data accuracy.
- The current frontend test setup does not suppress console output, which is useful. Do not add global suppression to make noisy tests appear green.

### Route modules, metadata, and nested layouts

Callers and hidden coupling:

- `App.tsx` is also the provider composition root. Preserve the order of Query Client, router, auth, error boundary, tenant/client-preview/view-mode contexts, chunk boundary, Suspense, page-title provider, and routes.
- Route order matters for redirects, parameterized paths, duplicate registrations, and the catch-all.
- Lazy modules differ between default exports and named-export adapters. A manifest conversion can compile while producing runtime chunk failures.
- Wrappers are not all mechanical. Some own inner Suspense, loader UI, data setup, or layout variants; classify each before deletion.
- Nested layouts require `<Outlet>` and can change component mount lifetime. Longer-lived layouts may preserve stale local state/subscriptions; shorter-lived layouts may reset forms and query observers.
- Moving `ProtectedRoute` above or below a layout changes whether unauthorized users mount layout queries, navigation, preview state, and side effects before redirect.
- Preserve path params, search params, hash fragments, `Navigate replace`, browser back behavior, titles, scroll position, error boundaries, and deep links from emails/timeline events.
- Navigation visibility is not authorization. Do not derive RLS or Edge permissions from UI metadata.

Required evidence:

- Generated before/after route table: path, component, redirect target, guard props, layout, lazy import, and unique path count.
- Unit/integration coverage for route classification and each guard tier.
- Playwright direct deep links, redirects, back/forward navigation, refresh, chunk-load errors, layout count, title, and representative query loading.
- A real client session for client denial/allowance; staff preview is only a comparison.

Concrete route findings from this pass:

- The first `/support-tickets` registration renders `SupportTicketsWrapper` and therefore `DashboardLayout`; the later duplicate renders the page directly. P1.1 should remove the later registration only, then verify one dashboard shell, route heading, staff tabs/filter/modal, reload/back/forward, and real-client denial. Removing the first registration would expose the previously dead unwrapped branch.
- Preserve special public/nonstandard surfaces during `App.tsx` extraction: OAuth/Outlook/Xero callbacks, password reset, activation, invitation acceptance, `/addin` JWT-holder behavior, `/teams` meeting mode, and the catch-all.
- Characterize static/dynamic route pairs so extraction cannot reorder them: `/audits/create-template` vs `/audits/:id`, `/processes/new` vs `/processes/:id`, Support Ticket new/detail routes, Academy course/lesson/assessment/result routes, and package/stage/job details.
- `ClientLayout` owns tenant context/guarding, Ask Viv state, page-view tracking, forced-light cleanup, a realtime message channel, document-request modal, and notification surfaces. `AcademyLayout` owns a second tenant provider, access gate, forced-light behavior, preview banner, and sidebar state. Moving either to a persistent parent layout changes all of those lifetimes.
- Before nested layouts, decide whether dialogs/sidebar/scroll persist across route changes, whether page tracking fires per route, whether subscriptions persist without duplicate toasts, whether disabled-account state is refreshed, and whether page titles reset immediately.
- Current `ClientRouteGuard` tries to detect layout leakage using `[data-layout="dashboard"]`, but no such marker exists. Add real stable layout markers before treating that diagnostic as evidence.
- Current guard order prevents unauthorized users from mounting shell queries. Never place a data-fetching parent layout outside a stricter child guard merely to reduce wrapper count.

### Unreachable-file and deletion candidates

Static reachability can miss:

- literal and computed dynamic imports;
- route strings opened from email, notifications, timeline records, bookmarks, or external systems;
- components loaded by registries or `import.meta.glob`;
- Edge Functions invoked by string, cron, database webhooks, OAuth redirect configuration, Mailgun/Microsoft/Xero dashboards, Supabase GitHub sync, or manual operational runbooks;
- database functions, views, triggers, and policies whose consumers do not contain the object name in frontend code;
- types imported only through generated declarations or tests that represent a still-required contract.

Deletion gate:

1. Prove zero source importers and zero route/menu/registry consumers.
2. Search documentation, audit history since May, email templates, migrations, function configuration, and external callback references.
3. For database/Edge candidates, run the live object/log/deployment/caller checks appropriate to the object.
4. Verify the intended replacement route/workflow with Playwright before deletion.
5. Delete one domain cluster, build/test, and verify old deep links intentionally redirect or 404.
6. Record capability loss and product-owner confirmation for anything once user-visible.

### Clone consolidation

Look out for semantic differences hidden in small diffs:

- role/tenant authorization;
- query keys and invalidation;
- toast/error wording that signals different recovery;
- default values and validation;
- audit/timeline attribution;
- modal focus/reset/close behavior;
- public endpoint response shape and rate/auth policy.

Prefer a shared pure core with thin adapters over one component with many boolean props. Run parity tests against both original behaviors before removing either implementation.

### God-component extraction

Moving JSX alone reduces file size but not cognitive load. Trace these responsibilities separately:

- server data and query keys;
- local draft/form state;
- derived view models and calculations;
- mutations, optimistic state, invalidation, and toasts;
- URL/search-param synchronization;
- modal/drawer portals and focus management;
- realtime/channel subscription lifetime;
- permission and feature-flag decisions;
- export/download/browser APIs;
- logging/audit/timeline side effects.

Common refactor regressions:

- stale closures after callbacks move;
- effects reordered or invoked twice;
- forms reset because the extracted child remounts;
- dialogs lose controlled open state, initial focus, Escape behavior, or scroll containment;
- React Query keys change identity and duplicate requests or retain stale data;
- optimistic updates no longer roll back;
- realtime channels leak or subscribe twice;
- an error becomes an empty state;
- loading indicators disappear before all dependent data is ready.

Use pure reducers/view models and focused hooks only where they make these lifecycles explicit. Playwright must exercise interaction and remount behavior; unit/contract tests must cover calculations and failure branches.

### Auth, profile, membership, and RBAC split

The current provider intentionally coordinates `onAuthStateChange`, initial `getSession`, profile loading, memberships, profile failure recovery, sign-out navigation, and a zero-delay callback used to avoid a Supabase auth callback deadlock.

Preserve and verify:

- no flash of protected content before profile/role is resolved;
- no infinite spinner when profile loading fails;
- Retry refetches profile and memberships;
- Sign Out clears all auth/profile/membership state and reaches Login;
- initial session and auth-state callbacks cannot race into stale/null profile state;
- token refresh and browser refresh preserve the session;
- membership changes become visible after the documented refresh/invalidation action;
- Super Admin legacy/current role equivalence remains intentional;
- real client Admin/User, staff roles, Academy builder roles, and add-in/Teams shells retain their separate behavior;
- ClientPreview/ViewMode contexts do not become proof of database access;
- splitting context values does not create excessive rerenders or stale selectors.

Playwright covers public navigation/session behavior. Unit tests with controlled auth events are required for callback ordering, profile-error recovery, and race conditions. RLS must be verified as the real role, not through staff impersonation.

Write an authority map before moving code. The current sources are intentionally non-equivalent:

| Authority | Current responsibility |
|---|---|
| Supabase session / `useAuth` | authenticated identity and session events |
| `users` profile | global/primary Unicorn role, disabled/profile state |
| `tenant_members` | tenant memberships and tenant-admin helpers |
| `tenant_users.access_scope` / `useUserAccess` | full versus Academy-only tenant access |
| `role_permissions` plus extra `user_roles` / `usePermission` | database-backed additional permissions |
| static `ROLE_PERMISSIONS` / `useRBAC` and route lists | frontend policy vocabulary that does not include every extra role |

Do not silently select one of these as canonical during a provider split. The disabled-account lookup currently fails open on query error; changing that to fail closed is a separate security/availability decision. Add generation/cancellation protection for async profile/membership loads only with tests for rapid account/session changes. Existing RBAC tests reimplement policy constants/helpers inside the test, so progressively replace shadow-copy assertions with tests of exported pure policies plus real `ProtectedRoute` integration.

### Supabase query/API boundary migration

For every moved query or mutation, capture before/after:

- table/view/RPC/function name;
- selected columns, joins, aliases, filters, ordering, limits, and pagination;
- `.single()` versus `.maybeSingle()` semantics;
- null/default mapping and date/timezone conversion;
- error propagation versus swallowed/best-effort behavior;
- caller identity (browser JWT, service role, dedicated worker, shared secret);
- query key, stale time, enabled condition, retry policy, and invalidation set;
- storage bucket/path/content-type and signed URL lifetime;
- response contract consumed by UI and any other callers.

Do not generalize a repository method across queries with different RLS visibility. An adapter returning `[]` for both “no data” and “forbidden/error” recreates a known failure class. Playwright can show a blank screen but cannot establish why; retain network/error-state assertions and direct role-bound data checks.

### TypeScript strictness and unused-code ratchets

- Never enable `strict`, `strictNullChecks`, `noImplicitAny`, or unused checks repo-wide in a feature PR.
- Exclude generated Supabase types from hand fixes and metrics.
- Keep Vite frontend, Node scripts/config, and Deno Edge Functions in their correct type environments.
- Review casts added merely to silence the new flag; replacing `any` with `unknown` without narrowing only moves the problem.
- `noUnusedLocals` can expose side-effect imports, JSX/runtime conventions, generated declarations, and intentionally exported public types. Classify before deletion.
- A typecheck pass does not validate runtime JSON, database nullability in production, or an Edge Function deployed with a different bundle.

### Shared Edge Function response/auth helpers

Before migrating a function, snapshot its actual contract:

- status codes and method handling;
- raw JSON versus `{ ok, data }` envelope;
- error code/message/detail fields;
- `Content-Type`, `Cache-Control`, CORS origin/header/method behavior, and `Vary`;
- OPTIONS response body/status;
- auth mode and exact placement before DB/external actions;
- caller context forwarded to helpers;
- retry/idempotency semantics expected by the caller.

`response-helpers.ts` changes the response envelope for `jsonOk`; adopting it mechanically can break otherwise green callers. Header spread order can also accidentally replace request-aware CORS. For deployment, include the full shared dependency tree; earlier MCP deployments failed when shared files were not bundled.

Playwright proves only browser-consumed happy paths and visible CORS failures. Use direct request contract tests for unauthenticated, forbidden, malformed, wrong-tenant, unsupported-method, preflight, success, and internal-error cases. Run `npm run test:edge-functions` after every auth/helper refactor.

### Calculation, messaging, document-state, and schema work

- Package/time: compare UI numbers to an independently calculated fixed fixture and a direct canonical SQL result. Cover period start/end, open-ended period, carry-in, date-only edit, split allocations, child instances, source breakdown, billable filters, and exact timezone boundaries. `rpc_get_package_usage` currently sums raw `time_entries.duration_minutes`, unlike allocation-aware views/functions and `ClientTimeTab`; treat parity as a live correctness investigation.
- Renewal: the browser currently updates dates, closes/inserts periods, creates carry-over, resets stages/tasks, and appends audit/note in separate requests, with ignored errors. Design an idempotent server-side command with package-row lock, expected-renewal precondition/idempotency key, and one transaction for core state. Define best-effort/outbox work separately. Failure-inject every boundary and preserve exactly one open period, matching bounds, monotonic numbering, no duplicate carry/timeline entry, and recurring `na` stages.
- Messaging: test a mixed batch containing valid auth users and one missing auth user; assert valid participants survive, skipped rows are logged, notifications fan out once, and retry is idempotent. Add an atomic campaign/tenant claim and stable delivery key before promising exactly-once behavior. Explicitly decide whether notification fan-out is atomic or best-effort because its trigger currently catches errors and warns.
- Messaging eligibility: conversation participation controls RLS visibility, while notification delivery excludes Academy-only users. Define a product/security matrix for full, Academy-only, pending/orphaned, disabled/archived, missing-auth, staff-sender, and client-sender cases. Verify conversation readability as well as notification appearance.
- Document lifecycle: enumerate separate aggregates and compatibility projections before proposing one state machine: `documents.document_status`; `document_versions.status` and `current_published_version_id`; stage/release generation status; bulk job/item status; delivery status; and legacy `isclientdoc`/`is_released`. Current consumers intentionally differ.
- Document publishing: SharePoint import archives old version, publishes draft, updates pointer, and writes activity as separate requests with ignored errors and no partial unique constraint for one published version. Characterize Graph drift-check semantics, then move publication behind a locked transactional RPC that preserves pointer/status invariants. Land DB command, Edge switch, caller switch, and retirement as separate expand/contract steps.
- Schema/RPC/trigger: run frontend writers plus `pg_proc`, trigger, grant, overload, cron, and external caller checks. Test in a transaction where possible, inspect lock impact, write the audit entry, and deploy only through the configured Supabase MCP workflow with explicit authority.
- Never combine a destructive schema drop with the frontend cleanup that supposedly made it orphaned. Observe the compatible code state first.

Universal live-data preflight for a table/view/RPC/trigger change:

- frontend and Edge reads/writes;
- `pg_proc` bodies for select/insert/update/delete and exact identity arguments;
- triggers, views/materialized views, policies (`qual` and `with_check`), table/column grants, function owner/security/search path/execute grants, and `pg_depend`;
- cron/`pg_net`, realtime publication, storage, generated types, deployment/source drift, production logs, and external owner confirmation;
- representative allowed and denied JWT calls, not service-role-only queries;
- current row counts/invariants, performance plan for high-cardinality paths, and exact pre-change definitions/grants for rollback.

Use expand/contract sequencing: additive DB contract with grants/RLS/audit → live verification → generated type refresh → backward-compatible Edge change → one caller family → observation → remaining callers → separate removal migration. A Git revert is not a production database rollback.

Stop immediately if generated types disagree with live schema, authenticated and service-role results differ unexpectedly, a mutation spans multiple requests without a partial-failure model, an external caller/response/config is unknown, a trigger swallows errors required for the claimed guarantee, or a destructive change has no executable rollback.

### KB and documentation changes

- Do not rewrite dated audit entries to make current code look consistent; add current-state docs or correction addenda where appropriate.
- Relative-link rewrites must preserve anchors, case, and whether the destination is a directory or file.
- A file can exist while its heading anchor is broken; the link checker should validate fragments where practical.
- Update generated current-state inventories from the final branch, not the pre-refactor baseline.
- Keep the pinned set under its context budget by replacing stale content rather than appending long incident narratives.
- Mark implementation plans `planning`, `active`, `completed`, `superseded`, or `historical` so Claude does not execute an old prompt as current direction.

## 16. Playwright verification architecture

### Current limitation

This repository currently has no `@playwright/test` dependency, no `playwright.config.*`, and no committed E2E suite. Historical browser verification was performed through agent-controlled browser sessions. That evidence can be useful, but it is not automatically reproducible by the next agent or CI.

Phase 0 should establish a dedicated Playwright infrastructure PR:

1. Add `@playwright/test` with npm and commit only the expected `package.json`/`package-lock.json` changes; do not touch `bun.lock`.
2. Add a config with a controlled Vite `webServer`, deterministic Chromium desktop/mobile projects, and one worker for authenticated production-backed checks. Do not silently reuse an existing server. Record worktree, branch, SHA, PID, port, and base URL and assert a branch/build identity before the first test.
3. Add scripts such as `e2e:unauth`, `e2e:smoke`, and `e2e:changed`; keep the aggregate default read-only.
4. Ignore `playwright/.auth/**`, traces, videos, HTML reports, and test results. Authenticated storage state contains live tokens and must never be committed. For production-backed authenticated runs, keep screenshots/traces off by default and enable them only under an explicit local evidence policy with PII review.
5. Provide interactive/global setup for approved QA sessions through environment variables or locally generated storage state. Never commit usernames, passwords, magic links, cookies, tokens, or service keys.
6. Make write-capable tests opt-in with an explicit flag, fresh authority, approved disposable tenant/records, deterministic `TEST — <run-id>` identifiers, captured row IDs, external-side-effect allowlist, cleanup in `finally`, and a post-cleanup data assertion. Cleanup failure fails the run loudly. Default Playwright must be read-only.
7. Document how agent-driven browser checks map to the same route/persona/oracle matrix when the test package is unavailable.

Because the local frontend talks to hosted production Supabase, even localhost browser tests are production data access. Run mutation tests only with explicit permission and an approved cleanup plan.

Shared Edge CORS currently allows `http://localhost:8080` and `http://127.0.0.1:8080`, not arbitrary free ports or `[::1]`. Therefore Edge-consuming browser journeys use `localhost:8080 --strictPort`; if another worktree owns 8080, stop and resolve ownership rather than auto-incrementing or killing processes. A configurable alternate port is acceptable only for an explicitly UI-only suite that does not claim Edge behavior. Never use system-wide Node termination without confirmation.

### Browser contexts and personas

Use isolated contexts, never role-switching inside one shared authenticated context as the only evidence:

| Persona | Purpose | Minimum checks |
|---|---|---|
| Unauthenticated | Public routes and redirect boundary | Login/reset/activate; protected deep link returns Login without protected content flash |
| Super Admin | Full shell and Super Admin routes | Dashboard, QA route, representative admin/Academy builder, sign-out |
| Vivacity operational staff | Broad staff without SA bypass | Representative WORK/CLIENTS/EOS routes and denial from SA-only routes |
| Client Admin | Real tenant JWT and admin affordances | `/client/home`, users/invites/settings, staff-route denial, own-tenant data |
| Client User | Non-admin tenant JWT | Shared client routes work; admin affordances and routes denied |
| Add-in/Teams context | Shells with alternate auth/loading assumptions | `/addin` and `/teams` load without accidentally inheriting full-app route guards |

Operational-staff coverage should include real CSC and Integrator sessions where available, plus BGT/CET behavior when affected. Do not claim Team Leader as live-verified from the existing audit evidence: the 28 August investigation found no real Team Leader account. Add Academy-only and disabled-user contexts when guard/auth work is in scope. Staff preview remains its own persona class and cannot be substituted for either client persona.

There are no seeded credentials in this environment. Use the standardized production QA accounts only when the operator has access. Ask the user to authenticate interactively when needed. “View as Client” can compare presentation but never proves client RLS or role behavior.

### Safe browser instrumentation

For every test page:

- fail on uncaught `pageerror`;
- collect `console.error` and reviewed `console.warn` events;
- collect failed requests and HTTP 4xx/5xx responses, with explicit allowlists only for intentional negative cases;
- assert the final pathname, a stable page-specific heading/landmark, and one meaningful data or empty-state marker;
- assert the app 404 and generic error boundary are absent unless intentionally tested;
- wait on stable UI/data locators, not `networkidle`—realtime subscriptions and polling can prevent network idleness;
- verify refresh and direct deep link for changed routes;
- use semantic assertions instead of broad screenshots or pixel snapshots against changing production data;
- run the changed workflow at desktop and 375px mobile; run the full shallow route inventory at desktop only unless layout changed;
- capture traces/screenshots locally on failure, but do not commit authenticated production traces or screenshots containing client/staff information.

A page that returns HTTP 200 and renders a shell has not passed. Vite returns the SPA entry document for unknown routes, and many components hide on missing data. The oracle must distinguish expected populated, expected empty, forbidden, failed, redirect, and not-found states.

Common false passes to reject:

- invitation acceptance in a browser still authenticated as staff can bind the wrong identity;
- cached React Query data can conceal a failed refetch;
- same-account tabs prove transport propagation, not cross-user realtime authorization;
- a success toast can precede failed fan-out or later database work;
- service-role SQL bypasses the RLS/grants being claimed;
- local browser calls exercise deployed Edge Functions and applied schema, not edited-but-undeployed local source;
- dev/HMR success does not prove production chunking/build;
- Playwright retry can hide a race unless the first failure is classified;
- screenshots miss stale titles, wrong data, duplicate subscriptions, and hidden network failures.

The existing `docs/ui-smoke-tests.md` and in-app `QASmokeTest` are evidence to repair, not acceptance truth: both classify `/documents` incorrectly for current clients, the page's stated access differs from its Super Admin route guard, and its popup viewport control cannot reliably test responsive behavior. Regenerate that matrix from the route/persona contract; use Playwright viewport control.

### Baseline-versus-branch method

For every refactor PR:

1. Run the focused semantic smoke on the baseline commit in its own clean worktree.
2. Record routes, persona, fixture identity, visible values/state, console/page errors, failed responses, and command/tool version.
3. Run the same check on the final branch using the same backend state and persona as soon as practical.
4. Explain every difference. Do not auto-approve screenshot changes.
5. If production data changed between runs, use invariant assertions or a direct data snapshot instead of claiming a visual regression.
6. Do not retry a failure until green without classifying it first.

### What Playwright cannot prove alone

- RLS cross-tenant safety unless run as the real restricted JWT with known fixtures.
- An Edge Function's negative auth branches, secret/cron/webhook callers, or raw response contract.
- Transaction atomicity, race safety, idempotency, locks, retry recovery, or trigger ordering.
- A calculation is correct unless expected values come from an independent fixture/formula/SQL result.
- A deleted function has no external caller.
- A migration is safe to apply, reversible, grant-correct, or free of function overloads.
- Type correctness, unused-code absence, bundle compatibility, or all dynamic imports.
- Accessibility beyond the assertions actually run.

Use Playwright as the user-workflow layer of a larger evidence stack, not the release verdict by itself.

For P5 specifically, a Playwright run against the local frontend invokes the deployed production Edge Function. It can pass while the edited local function is broken and undeployed. Before a separately approved deployment, use runtime/pure-service tests, auth/schema negatives, direct HTTP contract tests where an approved environment exists, CORS tests, static auth checks, and the full declared Edge test universe. Browser evidence becomes relevant to the new Edge source only after deployed/source versions are reconciled. The same rule applies to unapplied migrations.

## 17. Phase-specific Playwright matrix

| Candidate/phase | Required browser coverage | Required non-browser evidence |
|---|---|---|
| Phase 0 scripts | Unauthenticated Login smoke after build/dev startup | Negative build-guard fixture, typecheck, both test runners, timing evidence |
| Route duplicate cleanup | `/support-tickets`, `/support-tickets/new`, one detail deep link, browser back | Generated unique route table and intended-component source/history proof |
| Route modules | Direct/refresh navigation for every changed route family; representative redirect and guard tier; chunk/error monitoring | Exact path/component/guard/layout manifest diff; route unit tests |
| Nested layouts/wrapper retirement | Staff/client/Academy shell appears once; navigation works; local form/tab state across sibling navigation; mobile shell | Wrapper classification, provider/mount analysis, import graph/build |
| Navigation metadata | Visible/hidden item per relevant role; every changed item navigates to canonical path | Authorization tests independent of menu; route inventory drift check |
| Lifecycle pilot | SA list/tabs; open/create/edit dialog and cancel; client/staff denial; write only with approved disposable record | Query/adapter contract, validation/error tests, direct-import metrics |
| Auth split | cold login, refresh, protected deep link, sign-out, client/staff/SA redirects, interactive profile failure only if safely inducible | Controlled auth-event unit tests, race/recovery tests, context-consumer audit |
| Documents | Manage list/filter/detail; bulk-job list/progress; stage document section; client released-document view | Worker/transition contract tests, delivery/RPC evidence, known job fixture |
| Identity/invitations | Staff users/invites, real Client Admin users screen, Client User denial; open/cancel dialogs by default | Role/capacity/RPC tests, FK mixed-batch test, invitation role ceiling |
| Packages/time | Staff package detail and real client package/time displays; compare exact displayed minutes/hours to fixture | Independent calculation/unit/property tests and canonical SQL result |
| Messaging | Staff communications and client inbox/read state; read-only by default | Participant/notification/idempotency integration tests and trigger evidence |
| Academy | Client learner dashboard/course/lesson and allowed Academy builder role; denied non-builder role | Entitlement/facilitator/resource contract tests; no production course mutation by default |
| EOS | Meeting list/summary; live view read-only; facilitator controls only with disposable meeting and two isolated contexts | Pure state-transition tests, realtime subscription/fallback evidence, RPC authorization |
| Current Audits | List/workspace/template builder/report read paths; linked-stage deep link; error vs empty | Status/action sync tests, RPC error behavior, report contract |
| Edge helper batches | One real browser consumer per migrated contract, including CORS-visible path | Direct request matrix, static auth adoption, full edge suite |
| Type/lint ratchet | Changed route smoke only | Scoped type/lint outputs and cast/ignore review |
| Documentation | None unless routes/runbooks changed | Link+anchor checker, generated inventory, source citation review |

## 18. Verification verdict and evidence report

Claude's final comment for each PR must use two independent verdicts:

- **Specification verdict:** Pass / Partial / Fail / Inconclusive against the execution packet's behavior invariants.
- **Engineering-quality verdict:** Pass / Partial / Fail / Inconclusive across readability, architecture, security, performance, operability, and test quality.

Required evidence table:

| Requirement or risk | Observable behavior | Best evidence | Result | Gap |
|---|---|---|---|---|
| One row per invariant/risk | Public state, response, calculation, or route outcome | Direct environment > E2E > contract > unit > static | Pass/Partial/Fail/Inconclusive | Missing persona, fixture, environment, or branch |

Maintain a detailed ledger behind that summary:

`E-ID | claim/risk | command/query/source | commit + environment/project + timestamp | raw artifact location | result | severity | confidence | expiry | PII/redaction handling | reviewer`

Keep the command, exit code, and material output. Rebaseline deterministic metrics after every merged PR using the same tool version, file ordering, and exclusions. Report production LOC, test LOC, total changed LOC, largest module/function, dependency fan-in/out/cycles, direct-call sites, duplicated-rule sites, and relevant bundle/request/runtime signals; LOC movement alone is not improvement.

Classify every failed check as one of:

- implementation defect;
- test defect;
- environment limitation;
- flaky result, supported by conflicting identical runs;
- pre-existing failure, supported by a baseline run;
- unresolved.

An implementation defect blocks. A test defect blocks until the oracle/setup is repaired or explicitly re-scoped. An environment limitation yields Partial/Inconclusive, not Pass. “Flaky” requires conflicting results from identical runs. “Pre-existing” requires the same failure signature on the exact baseline. Any unresolved medium/high-risk failure blocks handoff as merge-ready.

Do not call a result flaky because one retry passed. Do not call it pre-existing because AGENTS says “some tests fail” without reproducing the same failure on the baseline.

Final evidence report must include:

- baseline/final SHAs and branch/worktree;
- changed files and diff statistics;
- before/after architecture metrics;
- commands with exit codes and material output;
- Playwright version/mode, browser, base URL, persona class, viewport, fixture prerequisites, routes, and results;
- console/page/network failures and allowlist rationale;
- database/Edge deployment state and whether source differs from production;
- specification and quality verdicts;
- residual gaps and actions deliberately not performed;
- documentation/audit updates;
- rollback instructions.

## 19. Council checkpoints for implementation

Use these checkpoints:

- **C0 — program acceptance:** refresh/rebase to current `main`; reconcile source/history/live read-only evidence; user reviews the plan; merge only on a fresh explicit ask; then mark the plan `active`.
- **C1 — per-PR go/no-go:** execution packet complete; dependencies merged; exact baseline captured; caller/contract matrix complete; characterization oracle exists; production authority stated. Unknown external caller or ambiguous product behavior means investigation-only.
- **C2 — independent pre-code council for medium/high risk:** behavior archaeology, security/data, browser/test, and KB/currentness reviewers inspect raw requirements independently and record dissent.
- **C3 — implementation and independent final-diff review:** implement one packet; inspect the exact committed diff, test sensitivity, rollback, and post-edit caller searches.
- **C4 — runtime gate:** run the same semantic journey on baseline and final branch with exact personas and fixtures; add contract/SQL/auth evidence that the browser cannot provide.
- **C5 — PR handoff:** complete ledger, two-axis verdict, metrics, residual risk, and rollback; open the PR and stop.

For medium/high-risk PRs, the read-only council covers four axes after implementation and before handoff:

1. **Behavior reviewer:** compares the execution packet and final diff, checks caller/consumer coverage, and evaluates whether tests would catch the old behavior changing.
2. **Security/data reviewer:** checks auth/RLS/tenant binding, response/schema contracts, migrations/triggers/grants, external callers, concurrency, and recovery.
3. **Browser/operability reviewer:** checks the Playwright evidence, console/network failures, route/persona coverage, responsive behavior, logs, and rollback observability.
4. **KB/currentness reviewer:** checks that the final implementation agrees with `AGENTS.md`, active lifecycle documents, generated inventories, and immutable audit history; stale plans are not silently executed.

Council reviewers inspect the raw diff and requirements independently; do not prime them with “the implementation is correct.” The coordinator resolves disagreements against direct evidence. Parallel reviews do not replace one integrated final check on the exact committed state.

Mandatory council triggers:

- route/guard/provider/auth changes;
- schema, RLS, trigger, RPC, grant, cron, or Edge auth changes;
- shared helper adoption across more than one function;
- package/time formulas;
- messaging participant/notification behavior;
- document job state transitions;
- deletion over 500 lines or any externally callable candidate;
- a PR touching more than one major feature area;
- any Partial/Inconclusive verification verdict proposed for merge.

## 20. Rollback and observation rules

- Prefer refactors that can be reverted with one PR commit and no data migration.
- Keep old and new API/schema shapes compatible during staged changes; remove compatibility only after consumers are verified.
- Feature flags are useful only when both paths are tested and the rollback path remains deployable.
- Record which Edge Functions or migrations require deployment; merging source does not prove production changed, while MCP deployment can make production lead source.
- For Edge retirement, deploy a contract-preserving deprecation/410 stage only when appropriate, observe logs for the agreed window, remove the repository folder so GitHub sync cannot resurrect it, then verify hosted absence.
- For destructive schema work, take dependency/object definitions needed for rollback, prefer reversible/transactional steps, and document irreversible data loss explicitly.
- After high-risk changes, define an observation window with the exact logs, tables, error rates, stuck states, or support signals to inspect. “No complaint received” is not sufficient telemetry.
- Stop and roll back when a real restricted persona loses data/access, error/empty states become ambiguous, job retries duplicate work, auth negatives regress, or source/deployed state cannot be reconciled.

## 21. Definition of done for each implementation PR

- The exact committed diff is scoped, the worktree is clean, the lockfile/generated artifacts/full diff were reviewed, and the branch is still based on the intended current-main baseline.
- Every packet invariant and material risk maps to evidence and a result; no test, console, page, request, data, or council failure remains unclassified.
- Focused characterization, affected suites, named frontend/Node/Deno test classes, type/build/lint/route/docs checks, and the risk-based Playwright matrix pass, or the evidence report shows the exact baseline failure signature. Unexecuted test classes are disclosed.
- Real restricted personas are used for any authorization claim. Browser evidence is not used to prove SQL/RLS/grants, transactions, triggers, raw Edge contracts, external callers, or migration safety.
- Security/data and KB/currentness reviews pass when triggered; current docs/generated inventories are refreshed and historical documents retain explicit lifecycle status.
- Reproducible before/after metrics show why readability and change safety improved; net-positive LOC or indirection has a reliability justification.
- Rollback is executable, compatible intermediate states exist for DB/API changes, and the observation signals/window/stop thresholds are named.
- Repository source and deployed Supabase state are explicitly reconciled. No migration, Edge deployment, email/external side effect, or production mutation occurred without fresh separate authority.
- The PR description includes packet ID, base/final SHAs, evidence ledger, residual risks, docs/audit links, and rollback. The PR is opened but not merged; merging still requires a fresh explicit ask.

## 22. Execution progress and LOC tracking

Updated after every merged PR, in the same style as `docs/dead-code-cleanup-plan-2026-08-27.md`'s "Lines of code progression" — this section is the running record of what actually shipped against this plan, not a restatement of the candidate register above.

### Measurement method (read before trusting a number below)

Numbers below come from `scripts/architecture-metrics.mjs`, run against a **disposable detached worktree** at the exact commit being measured (`git worktree add --detach <path> <sha>`, then `node scripts/architecture-metrics.mjs --json` invoked with a path *relative to that worktree*, e.g. after `cd`-ing into it). Two gotchas found while building this tracker, both now load-bearing for anyone re-running these numbers later:

1. **The script resolves its own root from `import.meta.url`, not `process.cwd()`.** Running it via an absolute path into a different checkout (e.g. invoking the main checkout's copy of the script while `cd`'d into a worktree) silently measures the *main checkout*, not the worktree — producing a false "0 delta" that looks like a clean measurement but isn't. Always invoke the script using a path that resolves inside the worktree you actually want measured (a bare relative `scripts/architecture-metrics.mjs` after `cd` works; an absolute path into another checkout does not).
2. **The script walks the filesystem (`readdirSync`), not `git ls-files`.** Any local, gitignored, untracked directory sitting in whichever checkout you measure gets counted as if it were repository code. The shared main working directory used for day-to-day sessions has one such directory, `supabase/functions/mcp/` (local MCP tooling scaffold, `!!` in `git status --ignored`, not part of the repo) — it inflates `edgeFunctions.files`/`edgeFunctions.lines` by +1 file / +9 lines versus a true clean measurement. A disposable detached worktree never has this problem, because `git worktree add` only ever materializes tracked content. **Prefer a fresh detached worktree over the shared main checkout for any number that will be written down here.**

Also note: the shared main working directory's local `main` branch had drifted 5 merged PRs behind `origin/main` for the entire Phase 0/1 window (all work happened in feature worktrees branched directly from `origin/main`, so nothing ever fast-forwarded local `main`). Harmless for the actual PRs — each was branched fresh from `origin/main` — but it means `git log -1` in the shared checkout is not a reliable way to check "what's currently on main"; use `git log --oneline -1 origin/main` after a `git fetch`, and pull local `main` (`git pull --ff-only origin main`, safe when the tree is clean) before trusting an in-place measurement.

### LOC and structure progression

| Checkpoint | SHA | Tracked product files | Product LOC (excl. generated/tests) | Files >600 lines | Files >1000 lines | Wrapper files |
|---|---|---:|---:|---:|---:|---:|
| Phase 2 start (= Phase 1 exit) | `ea3ffbfa` | 1,816 | 416,318 | 120 | 36 | 71 |
| After P1.1 (dedupe `/support-tickets`, PR [#482](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/482)) | `94ec75c6` | 1,816 | 416,316 (−2) | 120 | 36 | 71 |

The plan's original 28 Aug baseline (`e91d013d`) measured 413,945 product LOC / 120 files >600 / 36 files >1000 / 71 wrappers. The 416,318 reading above is higher not because Phase 0/1 added product code (both phases were tooling + docs, plus one comment-only line fix) but because ordinary feature work landed on `main` between 28 Aug and 1 Sept alongside this program — expected, and the reason every phase re-measures from the current tip rather than trusting the plan's original numbers. Files >600/1000 and wrapper counts are unchanged from the original baseline, which is coincidence, not evidence nothing moved — P1.1 is route dedup, not a size-reduction slice; the later route-extraction/nested-layout slices are where the wrapper/file counts are expected to move.

### Phase 0 — baseline and verification (complete, 2026-09-01)

8 sub-items across independent PRs (#465–#472). Not re-derived here since none of it touched `src/`/`supabase/functions/**` product code (build/test/lint/metrics/route-manifest/Playwright tooling only — 0 product LOC impact by design).

### Phase 1 — KB truth restoration (complete, 2026-09-01)

5 PRs (#476, #478, #479, #480, #481), `docs/kb/**` and `docs/audit-log/INDEX.md` only, plus one corrected code comment (`ClientLayout.tsx`) and one corrected RLS template inside a doc. 0 product LOC impact by design — this phase fixed documentation truth, not code structure.

### Phase 2 — route/composition simplification (complete, with one known gap — see below)

| ID | Candidate | Status | PR | LOC delta |
|---|---|---|---|---:|
| P1.1 | Remove duplicate `/support-tickets` registration | ✅ Done | [#482](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/482) | −2 |
| P0.6 (already shipped in Phase 0) | Module-aware route manifest/check | ✅ Confirmed still passing after P1.1 (`npm run routes` shows exactly one `/support-tickets` row) | #472 | — |
| P1.5 | Remove stale `navigationConfig.ts` exports after caller/persona check | ✅ Done | [#484](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/484) | −166 |
| — | Characterize legacy `/suggestions → /support-tickets` redirects before extraction | ✅ Done | [#485](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/485) | (tests only) |
| — | Extract one route family out of `App.tsx` (Support Tickets, 11 routes, 3 previously non-adjacent locations) | ✅ Done | [#486](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/486) | — |
| — | Convert Academy Wrapper routes to a nested layout route (11 files) | ✅ Done | [#487](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/487) | −170 |
| — | Convert Client Portal Wrapper routes to a nested layout route (20 files) | ✅ Done | [#488](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/488) | — |
| — | Convert DashboardLayout Wrapper routes to a nested layout route (27 files, 32 routes) | ✅ Done | [#489](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/489) | — |
| — | Fix guard-ordering regression in #489 (`/admin/stages*` mounted the shell before its SuperAdmin child guard ran) | ✅ Done | [#490](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/490) | — |
| — | Consolidate route metadata (title/guard-tier/layout) | ⏳ Not started — flagged as the highest-risk remaining item; no concrete well-scoped candidate yet | — | — |
| — | DashboardLayout direct-composition migration (child plan, 19 core PRs across "orders" 0–18) | ✅ Core sequence done, 2 in-scope files missed — see gap note below | [#492](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/492)–[#503](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/503), [#505](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/505), [#508](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/508), [#510](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/510), [#514](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/514), [#516](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/516)–[#518](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/518) | `grep -rl "<DashboardLayout" src/pages` dropped from 122 files to 9 at the `main` tip this row was written against (`ab356c7c`). See gap note. |

Phase 2 exit gate (from §8): route count and guards unchanged except intentional cleanup; wrapper LOC reduced; route inventory check passes. The mechanical-wrapper slice is complete (Academy/Client/Dashboard, PRs #487–#489, plus the #490 guard-ordering correction) — 58 wrapper files retired across the three portals. LOC deltas above are per-PR, not re-derived from a fresh whole-repo measurement; see the note below on why a full re-measurement is deferred.

**Direct-composition migration, verified 2026-09-03 (this entry corrects a documentation gap: Phase 2.5 had already started on the premise this was fully done, without this table ever recording it):** the child plan [`dashboard-direct-layout-migration-plan-2026-09-01.md`](dashboard-direct-layout-migration-plan-2026-09-01.md) proposed 19 core slices ("orders" 0–18) plus 2 explicit design-decision exceptions and a 5-file dead-code cleanup, deliberately left for a separate, evidenced PR. Mapping each merged PR's file list to the plan's §6 slice table confirms all 19 core slices landed (PR #492 = order 0 through PR #518 = order 18), and the two decision items — `AuditTemplateBuilder.tsx` and `SettingsWrapper.tsx`/`/client/settings` — remain correctly untouched pending their own design decision, exactly as planned. The 5 dead/unrouted candidates from §5.10 (`Audits.tsx`, `AuditWorkspace.tsx`, `eos/EosIssues.tsx`, `NewSuggestionForm.tsx`, `SuggestionRegister.tsx`) are also still present and still genuinely unrouted (confirmed via `grep` against `src/routes/*.tsx` and `src/App.tsx` — none of the five are imported by any route), so leaving them alone is correct, not an oversight.

**Real gap found by this verification, not previously documented (fixed same day, [#525](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/525)):** `src/pages/ProcessDetail.tsx` and `src/pages/ProcessForm.tsx` were part of the plan's own §5.3 inventory (26 "EOS and processes" files, routed at `/processes/:id`, `/processes/:id/edit`, `/processes/new` in `App.tsx` — still live, not dead code) but landed in neither PR #502 (EOS overview/read-only, 12 of its planned 14 files) nor PR #503 (EOS interactive/detail, exactly its planned 12 files, all `Eos*`). Both files composed `<DashboardLayout>` directly across their multiple render branches, so those three routes fully remounted the staff shell on every navigation — the exact defect this program exists to fix. This was never caught because the child plan's own §12 "final documentation PR" step (regenerate the baseline, report remaining exceptions) was never done. Filed and fixed as its own small follow-up PR (2 files, same mechanical pattern as #502/#503) rather than inline in this docs correction, per the plan's own change-size discipline (§14). The migration is now genuinely 115/115 planned files.

A full LOC re-measurement (per the methodology above — disposable detached worktree, `scripts/architecture-metrics.mjs`) has not been re-run since the P1.1 checkpoint; the mechanical-wrapper PRs' own descriptions record their individual file/line deltas, which is treated as sufficient until the next natural checkpoint (either Phase 2's close, or a specific request for an updated whole-repo table) rather than re-running the full measurement after every single merge.

### Phase 2.5 — lint-debt retirement (starting)

The DashboardLayout direct-composition migration (Phase 2's own prerequisite exit gate for this phase, tracked in [`dashboard-direct-layout-migration-plan-2026-09-01.md`](dashboard-direct-layout-migration-plan-2026-09-01.md)) had its 19-PR core sequence land at PR [#518](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/518), unblocking this phase per §8's ordering rule. A 2026-09-03 verification (see that document's §12) found this was 113/115 planned files, not 115/115 — `ProcessDetail.tsx`/`ProcessForm.tsx` were missed and still directly composed `DashboardLayout`. Fixed same day in [#525](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/525); the migration is now genuinely 115/115.

| ID | Candidate | Status | PR | Notes |
|---|---|---|---|---|
| Phase 2.5 PR 1 | Publish committed, machine-readable rule/source-class/directory/file baseline and exception policy | ✅ Done | [#519](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/519) | `scripts/generate-lint-baseline.mjs` → [`lint-baseline.json`](lint-baseline.json); policy at [`lint-exception-policy.md`](lint-exception-policy.md). Measured at branch-cut SHA `3f419e29`: 647 files with findings, 3,827 errors, 191 warnings (rule-attributable) — a small, expected drift from PR #515's 2026-09-03 doc-table snapshot (4,059/651) since `main` moved between the two measurements. One exception recorded: `src/integrations/supabase/types.ts` (generated). |
| Phase 2.5 PR 2 | Zero-behavior-risk mechanical cleanup: `prefer-const`, `no-useless-catch`, `no-useless-escape`, `no-empty-object-type`, `no-require-imports`, `ban-ts-comment`, `no-control-regex` (50 findings, 35 files) | ✅ Done | [#520](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/520) | ESLint's own `--fix` handled 34/37 `prefer-const` sites; the rest (a destructure mixing a reassigned and non-reassigned binding, 5 pass-through try/catch wrappers, 3 unnecessary regex escapes, 2 empty-interface→type-alias conversions, a `require()`→`import` swap in `tailwind.config.ts`, a `@ts-ignore`→`@ts-expect-error` swap in `vite.config.ts`, one deliberate `no-control-regex` suppression with a comment) were hand-verified. Baseline dropped 3,827→3,772 errors; `lint:ratchet` showed zero regressions across all 34 touched files; full frontend (298/298) and edge (254/254) suites pass; `npm run build:dev` confirmed the Tailwind config change. **Discovered mid-batch:** `src/integrations/supabase/previewAuthStorage.ts` is a second generated file (Lovable preview-auth brokering, marked "do not edit directly") carrying one `prefer-const` finding — left untouched; added to the exception policy and baseline in this same PR rather than hand-fixed. One `no-empty` finding in `ManageDocuments.tsx` (a file otherwise touched in this batch) was also left alone as out of this batch's declared scope. |
| Phase 2.5 PR 3 | Clear remaining non-`any` correctness findings needing per-site judgment: `no-case-declarations` (10), `no-empty` (6), `no-non-null-asserted-optional-chain` (8) | ✅ Done | [#522](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/522) | `no-case-declarations`: wrapped 4 switch-case bodies in block scopes after confirming each ends in `return` with no fallthrough. `no-empty`: added explanatory comments to 6 intentional best-effort catch blocks (ESLint treats a commented empty block as deliberate). `no-non-null-asserted-optional-chain`: replaced `profile?.field!` with an explicit throwing guard at 6 sites across 5 hooks, and a plain non-null assertion on the already-`enabled`-gate-protected parent object at 1 site — each of these could previously have silently written `undefined` into a required DB column instead of failing loudly. Baseline dropped 3,772→3,748 errors; zero ratchet regressions across 13 touched files; full frontend (298/298) and edge (254/254) suites pass. |
| Phase 2.5 PR 4 | `react-refresh/only-export-components` (38) — module-boundary cleanup, alongside affected component/module changes | ⏳ Not started (deliberately — the baseline's own guidance says this rule should ride alongside other component changes, not get a standalone sweep) | — | — |
| Phase 2.5 hooks batch 1 | `react-hooks/rules-of-hooks` (4) + `exhaustive-deps` (2), all in `BulkInvite.tsx` | ✅ Done | [#523](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/523) | Genuine bug, not just lint debt: two early returns sat before 4 hook calls, throwing React's "Rendered more hooks" error on every real Super Admin page load once `profile` resolved. Fixed by moving the guard after all hooks (each hook already no-ops internally via `isSuperAdmin`); verified live via Playwright (SuperAdmin persona, zero console errors, correct data). Baseline dropped 3,748→3,744 errors, 191→189 warnings. |
| Phase 2.5 hooks batch 2 | `react-hooks/exhaustive-deps` (10), 3 files, one feature area (SuperAdmin Academy admin pages: `AcademyCertificatesPage.tsx`, `AcademyTenantAccessPage.tsx`, `workforce-pdp.tsx`) | ✅ Done | [#528](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/528) | Each a genuine "memo doesn't actually memoize" bug: `now`/`thirtyDaysFromNow` were recreated every render (not memoized) in the first two files — fixed by snapshotting `now` once per mount via its own `useMemo`; `workforce-pdp.tsx`'s `rows = data ?? []` created a new array reference every render whenever `data` was falsy, defeating 4 downstream memos — wrapped in its own `useMemo` per ESLint's suggested fix. Verified live via Playwright: all 3 pages render correctly with real data and their interactive filters were exercised end-to-end, zero console errors. Baseline dropped 189→179 warnings (all-warnings batch, no errors). |
| Phase 2.5 hooks batch 3 | `react-hooks/exhaustive-deps` (6), 3 files, one feature area (audit creation/workspace: `AuditFormTab.tsx`, `SendEvidenceRequestDrawer.tsx`, `NewAuditModal.tsx`) | ✅ Done | [#530](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/530) | 3 of 4 `NewAuditModal.tsx` findings were the same guarded-default-setter pattern as batches 1/2; the 4th (`resetForm` missing from an effect gated on `!open`) was a real footgun — `resetForm` was a plain function recreated every render that reset state to new array/object literals, so blindly adding it to deps would have caused continuous re-renders while the modal was closed. Fixed by wrapping `resetForm` in `useCallback` first. `SendEvidenceRequestDrawer.tsx` reused the same documented "reset on open, not on every object-reference change" `eslint-disable` pattern from batch 1. Verified live via Playwright on `/audits`: opened/closed/reopened the New Audit modal, advanced through card selection and client selection (lead auditor correctly auto-defaulted), confirmed `resetForm` actually cleared state with no stale data or re-render symptoms. Baseline dropped 179→173 warnings. |
| Phase 2.5 hooks batch 4 | `react-hooks/exhaustive-deps` (8), 7 files, one feature area (EOS dialogs: meetings, rocks, QC — `ApplyTemplateDialog.tsx`, `MeetingScheduler.tsx`, `RockFormDialog.tsx`, `QCSectionCard.tsx`, `IDSDialog.tsx`, `MeetingCloseValidationDialog.tsx`, `SaveStatusIndicator.tsx`) | ✅ Done | [#531](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/531) | Deliberately excludes `AttendancePanel.tsx`/`LiveMeetingView.tsx` (the plan's own "active workflow" flagged files) for their own separate batch. 4 files safe to fix directly (self-guarding via ref/flag, or the effect only sets an idempotently-recomputed value); 3 files suppressed with a documented `eslint-disable` (reading `issue`, `validateClose`/`userRating`, or `state` only as a guard — adding them would wipe an in-progress edit, refire a real mutation API call every render, or cancel an idle-revert timer). Verified live via Playwright: edited two different Rocks (confirmed no data bleed between them), exercised `MeetingScheduler`'s auto-template-select on type change. `IDSDialog` only reachable from an active live meeting — deferred to the LiveMeetingView batch; reuses the already-verified id/status-narrowing pattern. Baseline dropped 173→165 warnings. Also surfaced (not fixed here): an unrelated pre-existing `main` typecheck regression, `AcademyAddCoursePage.tsx` duplicate identifier — confirmed via empty diff against `origin/main`, flagged separately. Remaining `react-hooks/exhaustive-deps` (127) findings are still queued as further small, one-file/feature-at-a-time batches. |
| Phase 2.5 hooks batch 5 | `react-hooks/exhaustive-deps` (4), `AttendancePanel.tsx` + `LiveMeetingView.tsx` — the plan's own "active workflow" flagged files, deferred from batch 4 | ✅ Done | [#533](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/533) | 3 of 4 safe to fix directly (ref-guarded mutation calls, same pattern as batch 4); the 4th (phrase-draft seeding) was a real trap where the obvious "just add the missing dep" fix would let a user's deliberate field-clear get silently undone — suppressed instead. **Live-verified without touching a real meeting**: created a throwaway `eos_meetings` row (clearly-labeled test title, minimal agenda, one participant) via direct SQL, drove it through the real UI — `AttendancePanel`'s auto-seed correctly seeded all 13 real Vivacity team members, the facilitator-confirm-then-start flow genuinely flipped the meeting to `in_progress`, and `LiveMeetingView`'s auto-add-current-user effect correctly marked the tester's own attendance row `attended` (confirmed via DB query) — zero console errors throughout. Deleted the test meeting afterward; cascade delete confirmed via query to leave zero orphaned rows in any child table. Baseline dropped 165→161 warnings. |
| Phase 2.5 hooks batch 6 | `react-hooks/exhaustive-deps` (9), 4 files, one feature area (admin pages: `CohortAccessSenderJob.tsx`, `RolePermissionsEditor.tsx`, `StaffEngagementDetail.tsx`, `RecentDraftsTable.tsx`) | ✅ Done | [#535](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/535) | 3 files were the familiar `x = data ?? []` pattern, wrapped in `useMemo`. `CohortAccessSenderJob.tsx` was a real risk if fixed naively — its mount effect's missing dep was a plain `refresh` function recreated every render that itself calls setters with fresh objects, so adding it directly would have created a fetch-render-fetch loop; wrapped in `useCallback` first. Verified live via Playwright: Role Permission Editor matrix + category filter, AI Drafting Insights real stats, a Staff Engagement checklist's real completion counts, and a cohort job detail page — plus a 3-second network-request watch confirming zero repeated fetches after the `refresh` fix. Baseline dropped 161→152 warnings. |
| Phase 2.5 hooks batch 7a | `react-hooks/exhaustive-deps` (14), 14 files, `src/components/client` sub-batch 1/2 | ✅ Done | [#536](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/536) | Two new risk patterns beyond prior batches: `PackageStagesManager.tsx`/`StartPackageDialog.tsx`/`TenantInviteDialog.tsx`/`ClientProfileForm.tsx` each had a plain function recreated every render feeding a mount effect or parent callback — wrapped in `useCallback`. `PackageDataManager.tsx`'s `DatePickerCell` computed `date = new Date(...)` fresh every render fed into `setDisplayMonth` — since `Date` objects never compare equal by reference, adding it directly as suggested would loop forever; memoized `date` on the actual `value` string first. `ClientAddressSection.tsx`'s `fetchAddresses`/`seedFromTga` mutually recurse, hitting a TDZ ordering problem if both were memoized — suppressed instead. Verified live via Playwright on a real tenant: stages/date-picker/diagnostics/start-package/integrations all rendered correctly with real data, zero console errors, page stayed responsive (no freeze) after opening the date picker. Baseline dropped 152→138 warnings. Remaining `src/components/client` findings (6) queued as batch 7b; `react-hooks/exhaustive-deps` total (100) still queued overall. |
| Phase 2.5 hooks batch 7b | `react-hooks/exhaustive-deps` (6), 2 files, `src/components/client` sub-batch 2/2 (final) — `ClientStructuredNotesTab.tsx`, `ClientTimeTab.tsx` | ✅ Done | [#537](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/537) | `ClientTimeTab.tsx`'s two findings were the familiar patterns: a conditional expression rebuilding an object every render (`effectiveWindow`) and a `data ?? []` array, both wrapped in `useMemo`. `ClientStructuredNotesTab.tsx` produced a genuine cascade: adding `scopeTag`/`toast` to a `useCallback` that already depended on `resetForm` surfaced a *new* finding (confirmed absent on `origin/main`) that `resetForm` itself — a plain function — needed memoizing; wrapping it in turn surfaced a second new finding on an *earlier* effect (the URL `initNote=true` auto-open handler) that also called `resetForm` and now needed it in its own deps. Since that earlier effect is declared before `resetForm`'s original position in the file, adding the dependency as flagged would have been a TDZ `ReferenceError` at runtime — fixed by relocating `resetForm`'s `useCallback` definition (unchanged, deps `[]`) to just before that effect rather than leaving it in place. Verified live via Playwright on Demo RTO's Notes tab: `?initNote=true` opened the Add Note dialog with all fields at their true reset defaults and no console errors, then the Time tab loaded cleanly. Baseline dropped 138→132 warnings. `src/components/client` cluster (20 findings across both sub-batches) is now fully clear; `react-hooks/exhaustive-deps` total is 94, still queued overall. |
| Phase 2.5 hooks batch 9 | `react-hooks/exhaustive-deps` (11), 7 files, `src/pages/Tenant*.tsx` sub-page cluster (`TenantDetail`, `TenantDocumentDetail`, `TenantDocuments`, `TenantLogins`, `TenantMembers`, `TenantNotes`, `TenantUsers`) | ✅ Done | [#538](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/538) | All followed the established "wrap fetch/filter function in `useCallback`, relocate it ahead of the effect that needs it" pattern. `TenantDetail.tsx` was the most involved: its mount-only package-list fetch effect is deliberately narrowed to `tenantId` (suppressed); its real-time document-subscription effect now depends on the memoized `fetchTenantData`, which actually fixes a latent stale-closure bug — switching the active package after the channel first subscribed used to keep re-fetching the old package's task count on later realtime events. **Found during verification, not previously known:** `TenantDetail.tsx` is dead code — nothing imports it (`App.tsx`'s own comment confirms its wrapper was already "removed — consolidated into ClientDetailWrapper"). Fixed anyway since the change is harmless and correct, but it could not be live-verified and is a candidate for future deletion, not done here to avoid scope creep. The other 6 files are all live-routed; verified live via Playwright on all of them with zero console errors, including switching to the ClickUp Task Comments note source (exercising `fetchClickupTasks`) and typing a search filter on `/admin/tenant-users` (confirmed correct row filtering via `applyFilters`). Note: PR #538 branched before #537 merged, so its own "138→127" delta is relative to pre-#537 `main`, not chained after batch 7b — the true post-both-merges total is tracked by the regenerated `lint-baseline.json`, not by summing these two deltas. Batch numbering (7b, 9) reflects creation order, not merge order — #538 merged first. |
| Phase 2.5 hooks batch 10 | `react-hooks/exhaustive-deps` (11), 8 files, `src/pages/Manage*.tsx` / `AdminManage*.tsx` admin cluster (`AdminManagePackages`, `AdminManageStages`, `ManageCategories`, `ManageDocuments`, `ManageInvites`, `ManageStages`, `ManageTenants`, `ManageUsers`) | ✅ Done | [#539](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/539) | All followed the established "wrap fetch/filter function in `useCallback`, relocate it ahead of the effect that needs it" pattern. `ManageDocuments.tsx` needed a two-level fix: memoizing `applyFiltersAndSort` surfaced a new missing-dependency finding for `applyNonFileStatusFilters` (a helper it calls internally), which needed memoizing in turn with its own accurate dependency list. **Found during verification, not previously known:** `AdminManagePackages.tsx` is dead code — nothing routes to it, same situation as `TenantDetail.tsx` in batch 9 (see [`dashboard-direct-layout-migration-plan-2026-09-01.md`](dashboard-direct-layout-migration-plan-2026-09-01.md) for that precedent). Fixed anyway since harmless and correct, but could not be live-verified. The other 7 files are live-routed; verified live via Playwright with zero console errors on each, including confirming correct filter narrowing on `/manage-documents` (20→18 rows), `/manage-tenants` (→1 row), and `/manage-users` (→4 rows, with only the filter effect re-firing on keystroke, not a duplicate fetch). Baseline dropped 121→110 warnings. Two files now confirmed dead code across this cluster of batches (`TenantDetail.tsx`, `AdminManagePackages.tsx`) — worth a dedicated dead-code sweep at some point, not done here to avoid scope creep. |
| Phase 2.5 hooks batch 11 | `react-hooks/exhaustive-deps` (11), 10 files, `src/hooks/*` shared-data-hooks cluster (`useAuditWorkspace`, `useEmailTemplates`, `useMissingMergeFields`, `useNotes`, `useOutlookCalendar`, `useSharePointBrowser`, `useStageDocuments`, `useStageEmails`, `useStageNotes`, `useTenantPacks`, `useTimeInbox`) — the last clustered group before remaining findings are scattered one-offs | ✅ Done | [#540](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/540) | Mostly the established `useCallback` pattern, plus three real finds: `useAuditWorkspace.ts`'s debounced score-save closed over a `useMutation()` result object (a fresh object every render) — destructured just the stable `.mutate` function instead of adding the whole object to deps, avoiding a refire-every-render trap. `useTimeInbox.tsx`'s `fetchDrafts` was missing `showOverdueOnly` — a genuine bug where toggling the "Overdue only" switch never refetched with the filter applied; confirmed fixed live via a fresh network request after toggling. `useNotes.tsx`'s `parentType` is deliberately tracked via its serialized `parentTypeKey` — suppressed rather than widened. `useStageNotes.ts`'s `packageId` is accepted but never used in its query — dropped from deps to match reality, after wrapping it in `useCallback` surfaced its own new "unnecessary dependency" finding. Verified live via Playwright: `useStageDocuments`/`useStageEmails`/`useStageNotes` via a real stage on Demo RTO (279 docs, 3 emails, 4 notes), `useAuditWorkspace` on a real completed audit, `useOutlookCalendar` on `/calendar/time-capture`, `useTimeInbox`'s specific fix via network-request confirmation, `useEmailTemplates`/`useMissingMergeFields` module-load checks. `useSharePointBrowser`/`useTenantPacks` are gated behind client-portal-only routes — verified via lint/typecheck/tests only (both fixes are purely mechanical, adding already-declared primitives to a deps array). Baseline dropped 110→98 warnings. |
| Phase 2.5 hooks batch 12 | `react-hooks/exhaustive-deps` (4), 3 files, `src/pages/client/*` cluster (`AcademyAssessmentPlayerPage`, `ClientTgaDetailsPage`, `SupportTicketsPortalPage`) | ✅ Done | [#541](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/541) | `AcademyAssessmentPlayerPage.tsx` reused the `useAuditWorkspace.ts` pattern from batch 11: `submitMutation` (a `useMutation()` result) is a fresh object every render, so `handleSubmit` destructures just the stable `.mutate` function before being safely added to the auto-submit timer effect's deps. **Known gap found during verification, NOT fixed here (out of scope, confirmed by direct instruction to file and continue rather than fold in an unrelated architectural fix):** `AcademyAssessmentPlayerPage` currently crashes to a full "Something went wrong" screen for every client attempting an academy assessment — it calls `useBlocker`, which requires a React Router data router (`createBrowserRouter`), but the app uses a plain `<BrowserRouter>` (`App.tsx:110`). Confirmed via `git diff origin/main` that the `useBlocker` line is untouched by this PR and identical on `main` — predates this program entirely. Needs a real fix (swap to a data router, or replace `useBlocker` with a different unsaved-changes guard) in a dedicated follow-up, not a lint-debt PR. Verified live as the real Demo RTO client persona (not SuperAdmin "View as Client"): `/client/support-tickets` and `/client/tga` both render correctly with zero console errors; the assessment page itself couldn't be interactively verified due to the crash above. Baseline dropped 98→94 warnings. |
| Phase 2.5 hooks batch 13 | `react-hooks/exhaustive-deps` (3), 3 files, `src/pages/Executive*.tsx` cluster (`ExecutiveClientCommitments`, `ExecutiveDecisionQueue`, `ExecutiveFinancialControls`) | ✅ Done | [#543](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/543) | Identical pattern across all three: `fetchRecords` only reads `toast`, wrapped in `useCallback` and relocated ahead of its mount effect. Verified live via Playwright (SuperAdmin persona) on all 3 routes, zero console errors. Baseline dropped 94→91 warnings. Remaining findings are now single/double-finding one-offs scattered across ~47 files; no more large clusters left. |
| Phase 2.5 hooks batch 14 | `react-hooks/exhaustive-deps` (4), 2 files, `src/pages/Team*.tsx` cluster (`TeamSettings`, `TeamUsers`) | ✅ Done | [#544](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/544) | Same established pattern. Verified live via Playwright (SuperAdmin persona), including confirming the search filter on `/admin/team-users` correctly narrowed 24→2 rows. Baseline dropped 91→87 warnings. |
| Phase 2.5 hooks batch 15 | `react-hooks/exhaustive-deps` (3), 3 files, `src/components/stage/*` cluster (`EmailAttachmentsManager`, `StageQualityIndicator`, `StageSimulationDialog`) | ✅ Done | [#545](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/545) | `EmailAttachmentsManager.tsx`: `data ?? []` pattern (`rows`), memoized. `StageQualityIndicator.tsx`/`StageSimulationDialog.tsx`: `useCallback` on the missing functions; the latter's `clearSimulation`/`fetchPackagesUsingStage`/`fetchTenantsForSimulation` (from `useStageSimulation`) were already individually stable inside that hook, safe to add directly. **Found during verification, unrelated, not fixed**: "Simulate Stage" logs a pre-existing 400 — `package_stages.package_id` has no FK to `packages.id` in the current schema, so PostgREST can't resolve the embed in `useStageSimulation.tsx` (confirmed untouched by this PR via `git diff`). The dialog handles it gracefully ("No packages found," no crash) — flagged as a separate minor bug, not fixed here. Verified live via Playwright: stages list quality indicators render, simulate dialog opens cleanly, email-attachments editor renders with zero console errors. Baseline dropped 87→84 warnings. |
| Phase 2.5 hooks batch 16 | `react-hooks/exhaustive-deps` (2), 2 files, `src/pages/Eos*.tsx` cluster (`EosQCSession`, `EosRocks`) | ✅ Done | [#546](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/546) | Both plain-boolean primitives missing from an already-self-guarded effect — safe to add directly, no relocation. Verified live via Playwright: `/eos/rocks`'s user filter correctly auto-defaults to the logged-in user; `/eos/qc/:id` loaded real data cleanly. Baseline dropped 84→82 warnings. |
| Phase 2.5 hooks batch 17 | `react-hooks/exhaustive-deps` (2), 2 files, `src/components/package-builder/*` cluster (`BulkGenerateDocumentsDialog`, `StagePreviewDialog`) | ✅ Done | [#547](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/547) | Established pattern. **Found during verification, unrelated, filed not fixed**: `StagePreviewDialog`'s usage-count queries 400 on every stage — `documents`/`package_client_tasks`/`package_stage_emails`/`package_staff_tasks` all lack an FK from `package_id` to `packages.id`, so the PostgREST embed fails and the dialog silently shows "0 configured" regardless of real content (confirmed with a stage that has 2 real linked documents showing 0). Same root cause as batch 15's `useStageSimulation.tsx` finding. Audit entry: `docs/audit-log/entries/2026-09-04-stage-preview-missing-package-id-fks.md`. Baseline dropped 82→80 warnings. |
| Phase 2.5 hooks batch 18 | `react-hooks/exhaustive-deps` (42), 38 files, all remaining scattered one-off findings — closes out the rule repo-wide | ✅ Done | [#550](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/550) | Per the workflow-efficiency-checkpoints practice, consolidated into one PR with 4 internal commits (18a dialogs/shared components, 18b messaging/profile/tenant, 18c invitation/audit/calendar/client pages, 18d remaining pages) instead of ~40 micro-PRs, using one reused worktree and parallelized typecheck/test:frontend/test:edge runs after each commit rather than a fresh install + sequential verification per file. Several real bugs beyond lint appeasement: a genuine stale-closure cycle in `celebration.tsx` (`dismiss` permanently captured the first render's `showCelebration`, so toggling reduced-motion mid-session while a celebration was queued kept using stale settings — fixed with a ref to break the circular `useCallback` dependency); a broken suppression in `KpiDeveloperTicketQueue.tsx` (`/* eslint-disable-next-line */` sat mid-statement on the same line as the effect it was meant to guard, disabling nothing — the fetch never re-ran when it should have); an unstable inline-array prop in `AddTimeDialog.tsx` (`activePackages` rebuilt as a new array literal every render) that would have made the receiving `NoteFormDialog` effect wipe user input on unrelated parent re-renders had it been fixed naively — memoized at the source instead; two more `data ?? []`-shaped unstable references (`useDocumentReadiness`'s `validateDocument`/`validateReleaseReadiness`, `MyOnboardingPage`'s `instances`); and `TasksManagement.tsx`'s real-time subscription effect, which would have re-subscribed to Postgres changes on every render had its called functions not been memoized before being added to deps. `PackageDetail.tsx` needed the most structural rework — three ~200-line fetch/filter functions were defined after the effects that called them, so the effects had to move below the functions rather than relocating the function bodies. Verified live via Playwright (SuperAdmin persona): Dashboard, Tasks Management (search filter), Package Detail (search filter, exercising the restructured fetch/effect chain), Settings + Team Profile tab — zero new console errors on any of them. Regenerated `lint-baseline.json`: 598 files with findings, 3744 errors, 38 warnings (all `react-refresh/only-export-components`) — **`react-hooks/exhaustive-deps` is now 0 repo-wide.** |
| Phase 2.5 any-batch 1 | `@typescript-eslint/no-explicit-any` (24), `src/types` EOS/audit shared-contract cluster (`eos.ts` 22, `audit.ts` 1, `eosAlerts.ts` 1) | ✅ Done | [#551](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/551) | First `any`-retirement batch, following the plan's own priority (shared contracts / high-risk boundaries first, not raw directory size). Every field checked against real usage before typing — not guessed: `EosMeetingSummary`'s array fields got real snapshot interfaces read directly off `generate_meeting_summary()`'s actual `jsonb_build_object` calls in the migration SQL (not inferred from partial frontend usage, which would have missed fields the UI doesn't render); VTO builder fields (`core_values`/`proven_process`/etc.) confirmed genuinely mixed-shape at runtime via existing `Array.isArray`/`typeof` guards in `VtoEditor`/`VtoViewer`, typed as the real generated `Json` union rather than a fabricated single shape; several fields (`EosVtoDraft.draft_json`, `EosAccountabilityChart.chart_data`, `EosMeeting.scorecard_data`/`rock_reviews`/`headlines`, both audit-log `details` fields) confirmed zero-consumer via grep before typing `Json`, zero behavioral risk. Fixing `eos.ts` surfaced 4 real consumer-side type errors (via `tsc`, not guessed) in `VtoEditor.tsx`/`VtoViewer.tsx`/`EosMeetingSummary.tsx`/`useEosAlerts.tsx`, each fixed with the minimal correct cast or (for `VtoViewer`) by applying a narrowing pattern the same file already used two sections above for a sibling field. Deliberately deferred `qc.ts`'s 1 finding — its `value_json` field has real consumers across 4 files that need their own narrowing, better scoped as its own QC-feature batch. Baseline dropped 3744→3720 (exactly the 24 targeted, no compensating increase). Verified live via Playwright (SuperAdmin persona): `/eos/vto` view and edit modes both render real production Core Values / "What Makes Us Different" data correctly, zero console errors. |
| Phase 2.5 any-batch 2 | `@typescript-eslint/no-explicit-any` (2), QC (quarterly conversations) `value_json` cluster — `src/types/qc.ts`'s `QCAnswer.value_json` (deferred from batch 1) + its sibling in `useQuarterlyConversations.tsx`'s upsert mutation | ✅ Done | [#552](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/552) | `value_json` is genuinely `{ value: X }` by write-side convention, but X's real type varies by prompt type (text/textarea/boolean/rating/list/checklist) — typed the real generated `Json` union rather than a guessed shape, matching batch 1's precedent for anything flowing into a Supabase RPC/insert. Typing it surfaced 6 real consumer-side errors across `QCSectionCard.tsx`/`EosQCSession.tsx`/`qcPdfExport.ts` (3 direct property-access sites plus 3 more downstream of `getOtherValue`'s changed inferred return type) — each fixed with a narrow `{ value?: string }` cast matching how that site already used the value. Baseline dropped 3720→3718 (exactly the 2 targeted). Verified live via Playwright (SuperAdmin persona) against a real completed Quarterly Conversation: Core Values answers/notes, the Summary & Sign-off prefill, and a full PDF export all rendered every real field correctly with zero console errors. |
| Phase 2.5 any-batch 3 | `@typescript-eslint/no-explicit-any` (15), `src/hooks/useEosConfigurations.tsx` | ✅ Done | [#555](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/555) | All 15 were `(supabase as any)` client-level casts, a different pattern from batches 1-2's JSON-field casts — used to bypass generated-schema checking on 4 tables (`eos_configurations`, `eos_configuration_segments`, `accountability_seats`, `accountability_seat_assignments`) that turned out to already exist in the generated types, so the casts were unnecessary legacy escape hatches, not a real gap. Removed all 11 client-level casts + 4 now-redundant map-callback annotations. Deliberately did not expand into sibling files `useEos.tsx`/`useEosOptions.ts` (73 findings across the wider EOS-hooks cluster) — those cast insert/update *payloads*, not the client, a different and more involved pattern needing per-table Insert/Update type verification; left as a clearly scoped future batch. Baseline dropped 3718→3703. Verified live via Playwright (SuperAdmin persona): all 4 EOS meeting-type configurations, a config's 7 real agenda segments, and the Facilitator Seat dropdown's real seat/holder-name join all render correctly, zero console errors. |
| Phase 2.5 any-batch 4 | `@typescript-eslint/no-explicit-any` (24), `src/hooks/useEos.tsx` (12) + `useEosOptions.ts` (12) — closes out the pair deferred from batch 3 | ✅ Done | [#556](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/556) | `useEosOptions.ts`'s 12 were unnecessary casts on 6 views/tables whose own code comments incorrectly claimed generated types were missing them — all 6 confirmed present, comments stale. `useEos.tsx`'s 12 required checking each table's real Insert/Update contract against the hand-written `EosX` interfaces: `createRock`/`createMeeting`/`createMetric` all destructured `tenant_id` out and never re-added it (the exact bug class already fixed once in this file for `createIssue`/`createTodo`, per a referenced prior audit entry) — confirmed via grep that none of the three affected mutations has any real caller (dead code, harmless today) before fixing anyway to match the established pattern. Removing the casts also surfaced two real type-accuracy bugs in `EosIssue`/`EosRock` (checked against real consumers, not guessed): a `priority` string-union arm no caller ever used (DB column is purely numeric), and a `progress` field with zero DB column or consumer at all (removed). Baseline dropped 3703→3679. Verified live via Playwright (SuperAdmin persona): `/eos/rocks` (134 real rocks, milestone progress bars), `/eos/risks-opportunities` (60 real items, priority badges from the now-numeric field), and the Add Item form's Category dropdown (8 real options) all render correctly, zero console errors. |
| Phase 2.5 any-batch 5 | `@typescript-eslint/no-explicit-any` (38), EOS Rocks/MeetingSummary component cluster — `MeetingSummaryCard.tsx` (14), `RockFormDialog.tsx` (14), `RockProgressControl.tsx` (1), `QuarterlyRocksSection.tsx` (8), `RockCard.tsx` (1) | ✅ Done | [#557](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/557) | Deliberately chosen to follow directly on from batch 1's `EosMeetingSummary` types and batch 4's `EosRock.milestones` fix while that schema context was still warm. Most findings were now-redundant casts droppable once the underlying types were correct; `RockProgressControl`'s `rock` prop was narrowed from the full `EosRock` to `Pick<EosRock, 'id'\|'status'\|'title'\|'description'\|'priority'>` (exactly what it reads) so a caller with a partial rock projection can pass one without a cast — this single change let two downstream files resolve their own findings without any casts. One real fallout bug caught by the compiler: `MeetingSummaryCard`'s cascade-message fallback used to silently render a whole raw object if `message` was falsy; now that `message` is a required string per the real type, that dead branch was removed rather than cast around. Baseline dropped 3679→3641. Verified live via Playwright: `/eos/rocks` (real status controls on every rock, a real rock's Edit dialog correctly loads its 3 real milestones), `/eos/flight-plan` (21 real rocks with working milestone sections), and a real meeting's summary page (real attendance/rocks-reviewed data) — zero console errors. |
| Phase 2.5 any-batch 6 | `@typescript-eslint/no-explicit-any` (71), 22 files — closes out the entire remaining EOS feature cluster (`LiveMeetingView.tsx` 10, `useEosHealth.tsx` 8, `useEosSegueShares.tsx` 7, `useEosAgendaTemplates.tsx` 6, `ApplyTemplateDialog.tsx` 5, `QCSectionCard.tsx` 4, `MeetingScheduler.tsx`/`useEosConfigMeetingActions.tsx`/`useEosReadiness.tsx` 3 each, `useEosDrafts.tsx`/`useEosRocksHierarchy.tsx`/`QCScheduler.tsx` 2 each, plus 10 files with 1 each) | ✅ Done | [#TBD] | Full sweep consolidating every remaining EOS `any` finding into one PR, reusing the compounding methodology from batches 1-5 (grep real consumers, check real DB/RPC shapes before typing, `Json`/`TablesInsert`/`TablesUpdate` for anything flowing into a Supabase call). Found a second live bug this phase (first was batch 4's dead-code tenant_id drop): `useEosHealth.tsx`'s `eos_rocks` query never selected `seat_id`, but `calculateRockDiscipline` reads `r.seat_id` to penalize the Health Score's Rocks dimension — every tenant's score was wrongly treating 100% of rocks as seat-less regardless of the real value, confirmed via direct SQL (4 of 42 real current-quarter rocks do have a seat). Fixed by adding `seat_id` to the select. Also found two stale-type gaps matching batch 4's pattern: `EosConfiguration.facilitator_seat_id`/`visionary_seat_id`/`integrator_seat_id` were hand-typed as `string \| undefined` when the real DB columns are nullable (`string \| null`) — widened to match, only consumers were a truthiness check and an `?? ''` fallback, both null-safe already; and a stale "types.ts not regenerated" code comment in `useEosMeetingSegments.tsx` next to `go_to_previous_segment`, which has in fact been in generated types for some time (same drift class as batch 4's `useEosOptions.ts` comments). `useEosReadiness.tsx`'s nested aliased `accountability_charts` embed needed 3 hand-written interfaces (`ReadinessFunction`/`ReadinessSeat`/`ReadinessSeatAssignment`) since the Supabase client can't infer types for aliased nested relationships. Deliberately deferred `ImportVideosPanel.tsx` (2 findings, `src/components/academy/builder/`) — out of EOS scope, candidate for a future academy-focused batch. Baseline dropped 3641→3570 (71 targeted, no compensating increase). |
| Phase 2.5 any-batch 7a | `@typescript-eslint/no-explicit-any` (39), `src/hooks/academy` sub-batch 1/2 — `useAcademyWorkbooks.ts`, `useEnrolCourse.ts`, `useAcademyTagManagement.ts`, `useMyEnrolledCourses.ts`, `useAcademyCourseResources.ts`, `useAcademyPackageRules.ts`, `useAdminAcademyCourses.ts` | ✅ Done | [#TBD] | First batch of the `src/hooks/academy` cluster (153 findings, 12 files total) — took the smaller/medium files first. Confirmed every table/RPC referenced by a removed cast exists in generated types before dropping it (`academy_course_resources`, `resource_library`, `fn_academy_rule_dashboard_stats`, `fn_academy_backfill_enrollments_for_rule`). New fallout pattern: Supabase's typed `.update()` builder rejects a variable whose *declared* type includes a property incompatible with the target even when no caller actually sets it — `AdminCourse.id: number` clashed with `academy_courses`' Update type declaring `id` as never-updatable; fixed by typing the payload as `Partial<Omit<AdminCourse, 'id' | 'module_count' | 'lesson_count' | 'enrollment_count'>>` instead of `Partial<AdminCourse>`. Verified live via Playwright (SuperAdmin): `/superadmin/academy/builder` loads all 115 real courses, and the search filter correctly narrows 115→3, zero console errors. Remaining 114 findings across 5 files (`useTenantAcademyAccess.ts`, `useAcademyCertificates.ts`, `useAcademyAssessmentBuilder.ts`, `useAcademyModulesLessons.ts`, `useAcademyEnrollments.ts`) queued as 7b. **Process correction this batch:** `lint-baseline.json` had not actually been regenerated/committed since batch 5 (#557) — batches 6 and the caching PR both landed without it, so the file's "3641→3641" narrative-tracked numbers in this table had silently drifted from the real committed baseline (confirmed via direct regeneration: batch 5 truly ended at 3634, not 3641 — a small, unexplained 7-count drift, likely an unrelated concurrent fix elsewhere in the repo during that window). Regenerated and committed the real baseline in this PR: 3634 (post-batch-5, confirmed) → 3530 (post-batch-7a, confirmed) — a real net drop of 104, more than this batch's own 39 because it also absorbs batch 6's un-recommitted -71 (plus whatever untracked drift happened in between). Going forward, regenerate `lint-baseline.json` and commit it in every batch's own PR — don't compute deltas by hand from the previous batch's narrative claim. |
| Phase 2.5 any-batch 7b+ | Retire remaining `any` (~3,530, confirmed via committed `lint-baseline.json`) in bounded batches — finish `src/hooks/academy` (114 findings, 5 files: `useTenantAcademyAccess.ts` 15, `useAcademyCertificates.ts` 15, `useAcademyAssessmentBuilder.ts` 18, `useAcademyModulesLessons.ts` 19, `useAcademyEnrollments.ts` 48) next; `src/hooks` more broadly (heaviest directory overall) may still need splitting into several more batches after that | ⏳ Not started | — | — |

Later batches diff against `lint-baseline.json`'s `byFile`/`byRule` data, not against re-derived counts, so "no compensating increase elsewhere" is checkable per the plan's Phase 2.5 exit gate (§8).
