# Unicorn 2.0 Codebase Audit — 2026-08-26

## Executive verdict

Release readiness: **not ready for a clean verification pass**.

The audit found one confirmed authorization defect, several verification blockers, and substantial coverage limitations. The most important product/security issue is that `useRBAC().canAccessRoute()` is permissive by default, despite the repository’s documented/tested deny-by-default model for client users.

## Scope and method

- Repository: `unicorn-cms-f09c59e5`, current working tree on `main`.
- Reviewed frontend routing/auth/RBAC, core EOS form behavior, Ask Viv integration, Supabase edge-function entry points, configuration, tests, and repository guidance.
- Ran static searches over `src/` and `supabase/` for auth gates, route checks, RPCs, browser sinks, storage, external fetches, and secrets.
- Started the local Vite server with `npm run dev -- --host 127.0.0.1`; `curl.exe http://127.0.0.1:8080/` returned `200 OK`.
- Started the repository security scan workflow; preflight was `ready` with delegated worker support. The scan remained in `preflight` during this session and did not produce a completed report.
- Convened four independent council reviewers covering security, core functionality, RBAC/tenant isolation, and QA. The security, core-functionality, and QA reviewers completed source-backed passes; the RBAC/tenant reviewer had not completed before the session cutoff.

## Findings

### F-001 — Client users are allowed through unlisted internal routes

- **Severity:** High for authorization correctness; Medium confidence/impact pending a route-by-route production inventory.
- **Category:** Broken access control / fail-open route authorization (CWE-862).
- **Location:** `src/hooks/useRBAC.tsx:324-336` (the `canAccessRoute` default branch).
- **Evidence:** The helper checks only `ADMIN_ROUTES` and `EOS_ROUTES`, then returns `true` for every other path. The repository’s RBAC test implementation at `src/test/rbac/useRBAC.test.ts:116-121` explicitly implements the opposite invariant: paths not in `CLIENT_ROUTES` require Vivacity-team membership and return `false` for client roles.
- **Impact:** A client user can deep-link to any newly added or omitted internal route that is not classified as an admin/EOS route. UI menu hiding is not an authorization control. Backend RLS may limit data, but the route boundary itself is not enforced and future internal screens can be exposed by omission.
- **Reproduction:** Call the production helper with a client profile and an unlisted path such as `/internal-feature`; because it matches neither admin nor EOS prefixes, it returns `true`. The same input returns `false` under the repository’s deny-by-default test model.
- **Remediation:** Make `canAccessRoute` deny by default for non-Vivacity users, explicitly allow only `CLIENT_ROUTES`, then apply admin/EOS checks. Add regression cases for an arbitrary omitted internal route and every registered route family.

### F-002 — Addin settings integration tests crash because the RBAC mock omits a required function

- **Severity:** Medium (test/verification blocker; production impact unconfirmed).
- **Location:** `src/hooks/useAskVivAssistantAccess.ts:23-55`; mock setup in `src/test/admin/addin-settings-shell.test.tsx:14-16` and `beforeEach` return value.
- **Evidence:** The hook destructures and invokes `canAccessAskViv()`. The test mock’s returned object does not provide that function. Vitest reported `TypeError: canAccessAskViv is not a function`, causing all five AddinSettings shell tests to fail.
- **Impact:** The test suite cannot verify the AddinSettings shell and emits repeated component errors. This is currently a test contract defect rather than proof that production fails, because the real `useRBAC` hook exports the function.
- **Remediation:** Update the mock to include `canAccessAskViv: () => true`, and add a typed mock factory so additions to the hook API fail at compile time.
- **Resolution (2026-08-26):** Added `canAccessAskViv: () => true` to the mock. That alone surfaced a second, unrelated pre-existing gap in the same mock (`supabase.auth.getUser is not a function`, hit by `useTeamUnreadCount`/`useNotifications` — the same class of gap AGENTS.md already documents as a known baseline issue for the *other* auth test file). Added `getUser: () => Promise.resolve({ data: { user: null }, error: null })` to the same mock's `auth` object. All 5 tests in `addin-settings-shell.test.tsx` pass now. Did not add the typed mock factory suggested in the original remediation — out of scope for this pass.

### F-003 — Risk/opportunity form retention test times out

- **Severity:** Medium (verification blocker; product defect not proven).
- **Location:** `src/test/eos/risk-opportunity-form.test.tsx:24`; component under test `src/components/eos/RiskOpportunityForm.tsx:68-119`.
- **Evidence:** Vitest timed out the test after 5 seconds while trying to type into the form. The test file mocks option hooks but does not provide a complete runtime harness for all component dependencies. The component itself intentionally initializes state once and does not resync `initialValues`.
- **Impact:** A regression test for a core EOS input-flow invariant is currently unusable. Whether this is a test harness issue or a runtime interaction defect needs an isolated reproduction with the component’s required providers and dependencies.
- **Remediation:** Isolate the test with all required providers/mocks, run it alone, and assert the value after rerender. If it still times out, investigate the specific control/event loop before changing component state behavior.

### F-004 — Production build is not runnable on the documented Windows environment

- **Severity:** Medium (release/CI issue).
- **Location:** `package.json` build script and `scripts/check-email-redirect-urls.sh`.
- **Evidence:** `npm run build` invokes `npm run lint:email-redirects`, which executes `bash scripts/check-email-redirect-urls.sh`. On this Windows host, the command failed immediately with `'bash' is not recognized as an internal or external command`.
- **Impact:** A developer following the repository’s Windows instructions cannot complete the production build, so compile-time/runtime release verification is blocked.
- **Remediation:** Either make the check cross-platform (Node/TypeScript or PowerShell) or declare/provision Bash as a required build dependency and document it. Run the full build in a clean supported environment afterward.

### F-011 — Audit completion can silently lose corrective actions

- **Severity:** High; **confidence:** High.
- **Location:** `src/hooks/useAuditWorkspace.ts:432`.
- **Evidence:** The `sync_audit_actions_to_client_items` RPC response destructures only `data` and ignores Supabase’s `error`. On failure, `syncCount` can become `0`, `actionSyncFailed` remains false, and the UI reports that there are no open actions.
- **Impact:** Auditors/clients can complete an audit while corrective actions were not transferred to client items, causing silent loss of remediation work.
- **Remediation:** Handle the RPC error explicitly; block completion or display a retryable sync-failure state.
- **Resolution (2026-08-26):** Reordered `useAuditStatusTransition` (`src/hooks/useAuditWorkspace.ts`) so the sync RPC runs *before* the `client_audits.status = 'complete'` update, not after. If the sync fails, the mutation throws and the status update never runs — the audit stays open rather than reaching "complete" with an unknown sync outcome (option (a) from the original remediation: block completion, not just display a failure toast after the fact). `sync_audit_actions_to_client_items` is idempotent per audit, so retrying "Mark Complete" after a transient failure is safe. Not a full DB-transaction guarantee (still two separate network round-trips), but closes the actual reported gap: completion can no longer happen while the sync outcome is unknown.

### F-012 — Client EOS overview uses an unpopulated auth field

- **Severity:** Medium; **confidence:** High.
- **Location:** `src/hooks/useAuth.tsx:95`; `src/pages/ClientEosOverview.tsx:28`.
- **Evidence:** The page relies on `profile.client_id`, but `useAuth` does not select/populate `client_id`. Its RPC and headline queries remain disabled, leaving the client EOS overview empty.
- **Impact:** Client portal users see an unpopulated EOS overview rather than their available data.
- **Remediation:** Use the resolved tenant ID with tenant-scoped RPCs, or reliably include `client_id` in the profile query/type.
- **Resolution (2026-08-26; compatibility follow-up 2026-08-27):** The orphaned, half-built page implementation and its four sole-consumer child components were removed, along with the `client_id` profile field/select used only by that page. The protected `/client/eos` route is retained as a compatibility redirect to `/client/home`, preventing saved links from becoming 404s. The `get_client_eos_overview` Postgres RPC remains in place and unreferenced by the frontend; dropping it is a schema change requiring its own migration/audit-log entry.

### F-013 — Client document-request actions are no-ops

- **Severity:** Medium; **confidence:** High.
- **Location:** `src/components/layout/ClientLayout.tsx:145`; callers in `src/components/client/ClientHomePage.tsx:386` and `src/pages/client/ClientTgaDetailsPage.tsx:41`.
- **Evidence:** Active callers consume `useOpenDocumentRequest`, but `ClientLayout` overrides the context with `value={() => {}}` instead of the real opener.
- **Impact:** Clicking “request document” does nothing for client home/TGA users.
- **Remediation:** Pass the real `openDocumentRequest` function and retain the shared modal.

### F-014 — Audit linked-stage navigation points to an unregistered route

- **Severity:** Medium; **confidence:** High.
- **Location:** `src/components/audit/workspace/AuditSidebar.tsx:223`.
- **Evidence:** The link targets `/clients/:tenantId?...`, but `src/App.tsx` has no generic `/clients/:id` route; only the bulk-membership route exists.
- **Impact:** “View stage tasks” lands on the not-found route for auditors.
- **Remediation:** Navigate to the existing tenant/package route or register the intended detail route.

### F-015 — Dashboard client count does not match the active scope

- **Severity:** Medium; **confidence:** High.
- **Location:** `src/pages/MainDashboard.tsx:415,435,863`.
- **Evidence:** `clientCount` is derived from current-user assignments. When no assignments exist, health scope switches to portfolio, but the Clients card continues displaying the assignment count, often `0`.
- **Impact:** Staff can see an incorrect client count while viewing portfolio health.
- **Remediation:** Track assigned and portfolio counts separately and display the count matching the active scope.
- **Resolution (2026-08-26):** `src/pages/MainDashboard.tsx` already tracked `healthMine`/`healthPortfolio` separately for the Client Health donut, which already switches correctly on `healthScope` — only the top "Clients" summary card was still reading the stale `clientCount` state (set once from the "mine" query, never updated for portfolio). Removed `clientCount` entirely and derived the card's value from the same `health` object the donut already uses (`healthy + monitoring + at_risk + critical` for whichever scope is active), plus updated its subtitle text ("active" vs "portfolio") to match.

### F-016 — Protected routes can hang indefinitely after profile-load failure

- **Severity:** Medium; **confidence:** High.
- **Location:** `src/hooks/useAuth.tsx:99`; `src/components/ProtectedRoute.tsx:80`.
- **Evidence:** A profile query error or missing profile leaves `profile` null; `ProtectedRoute` renders “Loading…” without retry, error, or sign-out recovery.
- **Impact:** Users affected by RLS, provisioning, or transient network failures cannot recover without manually clearing state/reloading.
- **Remediation:** Track profile errors separately and render retry/sign-out recovery UI.

### F-017 — Audit data failures are rendered as valid empty content

- **Severity:** Medium; **confidence:** High.
- **Location:** `src/pages/AuditsAssessments.tsx:31`; `src/pages/AuditWorkspaceNew.tsx:60`.
- **Evidence:** Audit queries can throw, but pages consume only `data` and default missing results to empty arrays.
- **Impact:** API/RLS failures appear as “No audits found” or an empty audit workspace, risking incorrect operational decisions.
- **Remediation:** Surface query errors with retry controls and distinguish failed loads from legitimate empty results.
- **Resolution (2026-08-26):** Both pages now destructure `error`/`refetch` from their query hooks (`useAuditsDashboard`, `useAudit`) and render a distinct error state (message + Retry button) before falling through to the loading/empty-state branches — "No audits found" and "Audit not found" now only render when the query actually succeeded with zero/missing rows, not when it threw.

### F-018 — Package finalisation can complete after an end-date update failure

- **Severity:** Medium; **confidence:** High.
- **Location:** `src/components/client/ClientPackagesTab.tsx:168`.
- **Evidence:** The `end_date` update result is ignored, then `transition_membership_state(..., 'complete')` runs regardless.
- **Impact:** A package can be marked complete with stale/missing end-date data.
- **Remediation:** Check the update result before completion or perform both operations in one transactional RPC.

### F-019 — Package stage reordering is non-atomic

- **Severity:** Medium; **confidence:** High.
- **Location:** `src/pages/PackageDetail.tsx:274`.
- **Evidence:** Each stage order is updated sequentially; a later failure leaves earlier updates committed.
- **Impact:** A failed reorder can leave package stages in a partially changed order.
- **Remediation:** Use a transactional reorder RPC, temporary order values, or explicit rollback.
- **Resolution (2026-08-26; cleanup follow-up 2026-08-27):** The original legacy `/package/:id` route has no confirmed in-app navigation, and its reorder handler targets the wrong `package_stages` column (`order_number` vs. `sort_order`). However, `PackageDetail.tsx` is shared by active admin wrappers (`/admin/package/:id...`), so deleting it was incorrect and caused the PR #413 regression; PR #416 restored it. The legacy route remains wired pending confirmation of bookmark/operational use and an intentional redirect destination. No migration was created.

### F-020 — Built-in QA smoke links are stale or incorrect

- **Severity:** High for QA reliability; **confidence:** High.
- **Location:** `src/pages/admin/QASmokeTest.tsx:42`; route definitions in `src/App.tsx`.
- **Evidence:** Smoke links target `/` as dashboard, `/settings/profile`, `/admin/users`, and `/admin/tenants`, while current routes map `/` to Login and use `/settings`, `/profile`, `/manage-users`, and `/manage-tenants`. Authenticated Playwright reproduced 404 pages for `/settings/profile`, `/admin/users`, and `/admin/tenants`; `/eos/issues` redirected to `/eos/risks-opportunities`.
- **Impact:** The QA screen can send reviewers to login, 404s, or the wrong page.
- **Remediation:** Generate links from the route manifest or update them and assert pathname/page heading for every link.

### F-021 — Tenant-isolation tests are placeholders and real RLS tests are skipped

- **Severity:** High; **confidence:** High.
- **Location:** `src/test/tenant/isolation.test.tsx:43-53,264`.
- **Evidence:** Eleven named isolation tests assert only `expect(true).toBe(true)`; the real RLS suite is conditionally skipped. The run reported 15 skipped tests.
- **Impact:** CI can provide false assurance that cross-tenant reads/writes are protected.
- **Remediation:** Run isolated personas against a non-production Supabase project and fail CI when required RLS tests are skipped.
- **Decision (2026-08-26):** Explicitly deferred — Carl chose to skip this pass rather than have this session provision a Supabase branch for it. Real cross-tenant RLS testing needs its own scoped session.

### F-022 — Edge-function security tests are excluded from the normal test command

- **Severity:** High for security regression detection; **confidence:** High.
- **Location:** `vitest.config.ts:8`; `supabase/functions/**` tests.
- **Evidence:** The repository contains 56 edge-function test files, but Vitest includes only `src/**/*.{test,spec}.{ts,tsx}`. The standard run executed 20 frontend test files.
- **Impact:** Edge-function auth/input-validation regressions can merge without being tested.
- **Remediation:** Add and run an explicit edge-function test command in CI and make omitted suites visible.
- **Resolution (2026-08-26):** Added `npm run test:edge-functions` (`node --test "supabase/functions/**/*.test.mjs"`) and documented it in AGENTS.md. Running the full 220+-test suite for the first time surfaced exactly the kind of drift this finding predicted: 4 tests were failing. Three were stale regexes that never accounted for the shared `json()`/`jsonErr()` helpers' `req` parameter; the fourth (`bulk-generate-documents-worker/auth-gate.test.mjs`) asserted an old JWT-decode auth model a later, well-documented architecture change (shared-secret + dedicated system account) had deliberately superseded. Fixed the three regexes, rewrote the fourth test to match the current architecture. Full suite is 224/224 passing. Added a guardrail note to AGENTS.md: changing a function's auth gate means updating its `*.test.mjs` in the same change, not just leaving it to silently drift. No CI wiring added — this session doesn't touch CI config; that's still a follow-up.

### F-023 — Auth/RBAC tests contain placeholder assertions

- **Severity:** Medium; **confidence:** High.
- **Location:** `src/test/auth/authentication.test.tsx:68+`; `src/test/rbac/role-access.test.tsx:93+`.
- **Evidence:** Tests for validation, navigation, session persistence, logout, protected routes, and role access contain assertions that only prove `true`.
- **Impact:** The most security-sensitive frontend behavior is not actually verified.
- **Remediation:** Render real Login/ProtectedRoute components and assert DOM, navigation, denial, session restoration, and logout behavior.
- **Resolution (2026-08-26):** Rewrote both files with zero placeholders remaining.
  - `authentication.test.tsx`: renders the real `Login` component (form validation via native HTML5 constraints, submit success/failure against a mocked `supabase.auth.signInWithPassword`) and the real `useAuth()`/`AuthProvider` (session persistence via `getSession`, sign-out clearing state and calling `supabase.auth.signOut()`). Protected-route access is deliberately *not* duplicated here — that's `src/test/rbac/ProtectedRoute.test.tsx`, already covering it against the real component.
  - `role-access.test.tsx`: route/module checks now use the real `useRBAC.tsx` exports (`ADMIN_ROUTES`/`EOS_ROUTES`/`isClientAccessibleRoute`); feature-level checks (Resource Hub content management, system config access) go through the real `usePermissionDetailed()` hook against `role_permissions` rows shaped like the live table (verified via a read-only query). Also fixed the fixture data itself — the placeholders used non-existent role strings ("Client Admin"/"Client User"; the real values are "Admin"/"User"). Two describe blocks ("Client Admin can manage tenant members", "Archived users are denied access") were removed rather than given fake-passing assertions: the first needs a different hook (`hasTenantAdmin`) than the fixture covers, and the second doesn't correspond to any real frontend or backend control today — verified no code reads `profile.archived` for access decisions. Both left as documented gaps in the test file, not silently dropped.
  - As a side effect, fixed a genuine bug in shared test setup: `src/test/setup.ts`'s `ResizeObserver`/`IntersectionObserver` mocks used arrow-function implementations, which aren't constructable (`new ResizeObserver()` — used by Radix's `useSize`, e.g. inside `Checkbox` — threw "is not a constructor"). Changed to real `function` implementations.

### F-024 — Route inventory is stale and incomplete

- **Severity:** Medium; **confidence:** High.
- **Location:** `docs/kb/codebase-state/route-inventory-by-role.md:3`; `src/App.tsx`.
- **Evidence:** The inventory claims 216 routes from 2026-07-29, while the current app contains approximately 251 static route paths and newer Xero, Academy bulk-import, workbook, and regulatory-update routes.
- **Impact:** Stale route classification increases the chance of missing access-control and smoke coverage.
- **Remediation:** Generate the inventory from route definitions and add a drift check.
- **Resolution (2026-08-26):** Full regeneration, per Carl's explicit direction ("full regeneration... we are not implementing that on lovable prompt anymore" — see `rbac-v6-gate-closure-plan.md`'s updated implementation-path note). Added `scripts/generate-route-inventory.mjs`, a mechanical extractor that reads every `<Route>` in `App.tsx` and its guard tier directly from the JSX — that's the "drift check" tool (no CI job wired up yet; re-running it is manual for now). Current count: 249 routes (24 public, 170 `ProtectedRoute`, 42 `requireSuperAdmin`, 2 `allowVivacityTeam`, 11 `allowedRoles=ACADEMY_BUILDER_ROLES`) — down from the doc's stale 216. Regeneration also surfaced a real bug: `/support-tickets` is registered twice in `App.tsx` (`SupportTicketsWrapper` then, later, dead-code `SupportTicketsPage`) — flagged in the doc as an open follow-up, not fixed in this pass (didn't want to make more unplanned App.tsx edits mid-regeneration). The doc's own two dead routes (`/client/eos`, `/package/:id`) are gone from the regenerated tables, consistent with their removal this session.

### F-025 — Full test execution is slow and exhibits worker-timeout symptoms

- **Severity:** Medium for verification reliability; **confidence:** Medium.
- **Evidence:** Full Vitest took roughly 144–188 seconds, failed seven tests, emitted repeated React errors, and the council observed worker-termination timeout concerns.
- **Impact:** Slow/unstable CI encourages skipped suites and obscures regressions.
- **Remediation:** Run affected files individually, inspect open handles/timers and worker settings, and enforce a bounded CI test budget.
- **Additional evidence (2026-08-26):** Reproduced directly this session — individual test files that ran in under 1s of actual test time still took 27–90s wall-clock due to transform/import/environment setup overhead, and *every* single-file `vitest run` in this environment printed `[vitest-pool]: Timeout terminating forks worker for test files ...` on exit, including fully-passing runs. This confirms the worker-termination timeout is a pool teardown/cleanup issue independent of pass/fail, not something caused by a specific flaky test. Not root-caused or fixed this pass — Vitest/Vite config investigation (worker pool settings, `pool: 'forks'` vs `'threads'`, teardown timeouts) is its own scoped task.

### F-026 — Tenant members can browse/download files from global SharePoint sites

- **Severity:** High; **confidence:** High.
- **Location:** `supabase/functions/browse-sharepoint-folder/index.ts:109-123,132-180,184-219,241-248,282-308,362-381,449-456`; `supabase/functions/_shared/requireCaller.ts:237-245`.
- **Evidence/attack path:** An authenticated tenant member can select a `site_purpose` such as `master_documents` or `governance_client_files`. The broad tenant-member fallback authorizes the request, while global-site mode bypasses tenant/root restrictions for list and download operations.
- **Impact:** Cross-tenant disclosure of SharePoint documents and pre-authenticated download URLs.
- **Remediation:** Require explicit staff/global-site permission, allowlist purposes, derive the permitted drive/site server-side, and apply ancestry checks to every list/download request.

### F-027 — SharePoint parent-folder resolver accepts arbitrary sharing URLs

- **Severity:** Medium; **confidence:** High.
- **Location:** `supabase/functions/get-sharepoint-parent-folder/index.ts:7-10,19-33,48-60,63-110`; `supabase/functions/_shared/graph-app-client.ts:333-355`.
- **Evidence/attack path:** Any authenticated user supplies a sharing URL; `tenant_id` is ignored and authentication only confirms a Supabase user before the app’s Graph credentials resolve the caller-provided URL.
- **Impact:** Cross-tenant metadata disclosure or access to resources reachable by the Graph app registration.
- **Remediation:** Resolve files only through tenant-authorized mappings, validate drive/site against tenant configuration, restrict hosts, and enforce `tenant_id`.

### F-028 — Service-role package mutation lacks in-function authorization

- **Severity:** Medium; **confidence:** High.
- **Location:** `supabase/functions/add-missing-packages/index.ts:3-7,10-14,39-64`.
- **Evidence:** The function creates a service-role client and inserts global package records without `requireCaller`, shared-secret, method, or equivalent authorization checks. Exposure depends on deployed gateway JWT settings.
- **Impact:** Unauthorized mutation of the global package catalog and repeated data manipulation.
- **Remediation:** Retire the function if obsolete; otherwise require SuperAdmin/shared-secret authorization before service-role access and make inserts idempotent.

### F-029 — Academy lesson editor renders unsanitized HTML

- **Severity:** Medium; **confidence:** High.
- **Location:** `src/components/academy/builder/LessonEditorPanel.tsx:39,161,376-389`.
- **Evidence:** Database/user-controlled lesson content is rendered with `dangerouslySetInnerHTML` without a strict sanitizer.
- **Impact:** Stored/reflected XSS against staff users, potentially enabling session compromise or privileged actions.
- **Remediation:** Render escaped text or sanitize parsed Markdown with a strict allowlist before rendering.

### F-030 — Stage email simulation renders unsanitized merged HTML

- **Severity:** Medium; **confidence:** High.
- **Location:** `src/components/stage/StageSimulationDialog.tsx:672-675`; `src/hooks/useStageSimulation.tsx:115-131,180-220,417-442`.
- **Evidence:** Database-backed email HTML is combined with unescaped tenant/client/staff merge values and assigned to `dangerouslySetInnerHTML`.
- **Impact:** XSS against staff/admin users previewing malicious templates or data.
- **Remediation:** Escape merge values, sanitize the final HTML with the existing strict email sanitizer, and consider a sandboxed preview iframe.

### F-031 — Research proxy forwards arbitrary URLs to Firecrawl

- **Severity:** Medium; **confidence:** High.
- **Location:** `supabase/functions/research-scrape/index.ts:21-28,30,39-45,47,64-84`; related `research-public-snapshot` and `research-tas-context` functions.
- **Evidence:** Research-authorized callers can supply arbitrary URLs without domain allowlisting, private-address rejection, redirect validation, or equivalent controls before server-keyed Firecrawl requests.
- **Impact:** Potential SSRF through the crawler, internal probing depending on crawler placement, paid quota abuse, and attacker-controlled content ingestion.
- **Remediation:** Allow only required HTTPS domains, reject private/link-local/metadata destinations, constrain redirects, size/time-limit responses, rate-limit, and audit requests.

### F-032 — Credentialed TGA proxy functions lack in-function authorization

- **Severity:** Medium; **confidence:** High.
- **Location:** `supabase/functions/get-organisation-details/index.ts:4-11,50-106,114-167,226-289`; `supabase/functions/search-organisations/index.ts:3-19,32-93`.
- **Evidence:** The functions use server-side TGA credentials without `requireCaller` or shared-secret validation. Public reachability depends on gateway JWT configuration.
- **Impact:** Unauthorized organisation enumeration, upstream quota abuse, and misuse of production/sandbox credentials.
- **Remediation:** Require appropriate roles, rate-limit and bound inputs, and restrict unauthenticated behavior to explicitly intended fixed-endpoint proxies.

### F-033 — Phase-completeness function permits arbitrary-tenant reads

- **Severity:** Medium; **confidence:** High.
- **Location:** `supabase/functions/calculate-phase-completeness/index.ts:43,62,94,227`; client caller `src/components/stage/StageCompletenessWidget.tsx:79`.
- **Evidence:** A service-role client uses caller-controlled `tenant_id` and `phase_id` after presence-only validation. It does not use the available fail-closed tenant helper before reading documents/tenant data and returning completeness/risk results.
- **Impact:** Authenticated callers can disclose completeness/risk data for arbitrary tenants.
- **Remediation:** Authorize canonical tenant access and validate phase/package ownership before every service-role query.

### F-034 — Research evidence-gap function permits arbitrary tenant/stage reads and writes

- **Severity:** Medium; **confidence:** High.
- **Location:** `supabase/functions/research-evidence-gap-check/index.ts:82,127,183,263`; related RLS policy migration `supabase/migrations/20260513052315_c24fc03c-a9a2-46fd-9081-8ac6eeda56bf.sql:4`.
- **Evidence:** Authenticated callers control `tenant_id` and `stage_instance_id`; the service-role function checks only presence before document/portal metadata reads and evidence-result writes. The direct RLS policy is restrictive but service-role bypasses it.
- **Impact:** Cross-tenant evidence metadata disclosure and unauthorized evidence-result changes.
- **Remediation:** Enforce tenant membership and bind each stage instance to the requested tenant before reads/writes.

### F-035 — Client users can be treated as staff when creating client audits

- **Severity:** Medium; **confidence:** High.
- **Location:** `supabase/functions/create-client-audit/index.ts:90,107,155,170`; role default in `supabase/migrations/20251002164021_37981ccf-a5bd-4bcb-9a70-a42e910f9353.sql:24`.
- **Evidence:** The function defines staff as any truthy `unicorn_role`; ordinary profiles default to `User`, so they bypass the tenant-membership branch and can submit a selected subject tenant/stage to service-role writes.
- **Impact:** Cross-tenant audit creation, stage updates, and timeline writes by ordinary client users.
- **Remediation:** Use the canonical internal-staff predicate and validate linked-stage/subject-tenant ownership.

### F-036 — Login renders an invalid `fetchPriority` DOM prop

- **Severity:** Low; **confidence:** High.
- **Location:** Login image path through `src/components/ui/card.tsx:10` (observed during Playwright run).
- **Evidence:** Playwright captured React’s warning that `fetchPriority` is not recognized on a DOM element; React advises the lowercase `fetchpriority` attribute or removal.
- **Impact:** Console noise and potential incompatibility with intended image-priority behavior.
- **Remediation:** Use the correct DOM attribute form or remove the prop from the shared image/card path.

## Test and runtime results

| Check | Result | Interpretation |
|---|---|---|
| `curl.exe http://127.0.0.1:8080/` | Pass, HTTP 200 | Vite entry document is served by the local dev server. |
| `npm run build` | Blocked | Windows host lacks `bash`, before Vite compilation. |
| `npx tsc --noEmit` | Pass | Core-functionality council reviewer confirmed TypeScript compilation. |
| `npx vitest run` | Fail: 7 tests, 17 files passed, 270 tests passed, 15 skipped | Five AddinSettings failures from missing mock API; one RBAC failure exposing F-001; one RiskOpportunity timeout. |
| Playwright unauthenticated smoke | Pass with warning | Local server returned `200`; title and Login heading were correct; no page errors; React emitted the `fetchPriority` warning (F-036). |
| Playwright authenticated smoke | Fail | SuperAdmin dashboard loaded. QA smoke screen rendered stale targets; `/settings/profile`, `/admin/users`, `/admin/tenants`, `/clients/1`, and `/audits-assessments` returned the app’s 404 page. |
| Playwright | Not executed | Neither repository nor bundled workspace runtime provided a loadable Playwright/Puppeteer package; attempted Node imports failed with module export errors/not found. |
| Supabase live flows | Not executed | No seeded/test credentials were available, and the task did not authorize production mutation. |

## Remediation progress (source changes, not yet deployed)

The following fixes were applied locally after the audit and reviewed by the remediation council. They require normal code review, Edge Function deployment where noted, and the role/tenant regression checks below before being considered closed in production.

| Finding | Local remediation | Current verification / residual risk |
|---|---|---|
| F-001 | `ProtectedRoute` and `canAccessRoute()` now share an explicit client-route classifier. Settings/profile/dashboard are exact matches; only `/client/` and `/academy/` are client prefixes. Unknown paths, `/settings/*`, and `/client-portal/:tenantId/documents` fail closed for client roles. | `npx tsc --noEmit` passes. `src/test/rbac/useRBAC.test.ts` and new `src/test/rbac/ProtectedRoute.test.tsx` (real component, not the shadow logic) cover exact/prefix matches, `/settings/calendar`, `/settings-evil`, `/client-portal/:id/documents`, unlisted routes, and staff outcomes — all pass. **Live-verified as the Demo RTO client persona (2026-08-26):** `/manage-users` and `/client-portal/7547/documents` both redirected away (to `/dashboard` and `/client/home` respectively); `/settings-evil` isn't even a registered route, so it 404s before reaching the guard; `/client/tga`, `/academy`, `/client/home` all rendered correctly for the client role. |
| F-011 | The corrective-action sync RPC error is now detected and shown rather than silently counted as zero. | Partial: the audit can still reach completion before the sync failure is known. A transactional or sync-before-complete design is still required. |
| F-012 | Retired the old `/client/eos` page and sole-consumer components, then retained a protected compatibility redirect to `/client/home` so old bookmarks resolve to the supported client portal. | Focused route/source checks cover the protected redirect. `get_client_eos_overview` remains in the DB and unreferenced; dropping it needs its own migration/audit entry if wanted later. |
| F-013, F-014, F-018, F-020, F-036 | Restored the client document-request context; corrected the audit stage link to `/tenant/:tenantId?...&stageInstance=:id`; fail on package date-update errors; corrected smoke links; removed the invalid Login image prop. | `npx tsc --noEmit` passes. Authenticated Playwright verified the corrected QA smoke links render canonical destinations. F-036 **live-verified**: fresh Demo RTO login shows no `fetchPriority` console warning. F-013's only real UI caller (`ClientTgaDetailsPage`'s "Request Update" button) is itself behind a pre-existing, unrelated `disabled` "Coming soon" stub, so the context fix cannot be exercised end-to-end via UI today — verified by reading the source, not by clicking through. F-014's `/tenant/:tenantId?...&stageInstance=:id` pattern is the same one `ClientDetail.tsx` and ~30 other components already read from; no audit in the current DB has `linked_stage_instance_id` set, so there's nothing to click through live right now — verified by source cross-reference, not an end-to-end click. |
| F-016 | `useAuth` now exposes profile-load failure state. `ProtectedRoute` presents Retry and Sign Out recovery controls instead of indefinitely rendering a spinner after a profile failure or missing profile. | `npx tsc --noEmit` passes. `src/test/rbac/ProtectedRoute.test.tsx` mocks a profile-query failure and asserts Retry calls `refreshProfile` and Sign Out calls `signOut`, with no infinite spinner. |
| F-026, F-027 | `browse-sharepoint-folder`'s `site_purpose` (global-site) mode now requires the real `staff.sharepoint.use` permission (`caller.via === "permission"`), not just the tenant-member `orAllow` fallback, plus an allowlist of the three configured `sharepoint_sites.purpose` values. `get-sharepoint-parent-folder` now requires `tenant_id` (was optional/unused), checks `hasTenantAccessSafe`, restricts `file_url` to `*.sharepoint.com` hosts, and binds the resolved drive back to that tenant's configured `tenant_sharepoint_settings.drive_id` before returning anything. | Edge Function source only, not deployed. `supabase/functions/_shared/sharepoint-global-site-gate.test.mjs` (new) statically verifies both gates and orderings. |
| F-028, F-032 | Added SuperAdmin gate to `add-missing-packages`; added `staff.tga` permission gates to the two legacy TGA proxy functions before their upstream calls. | Edge Function source only. Confirm deployed usage and redeploy before relying on these controls. |
| F-029, F-030 | Routed academy lesson previews through `sanitizeHtml` and stage email previews through `sanitizeEmailHtml`, both backed by the repository's DOMPurify configuration. | `npx tsc --noEmit` passes. New `src/lib/sanitize.test.ts` feeds both sanitizers `<script>`, `onerror`, `javascript:` URLs, and attacker-controlled merge-value payloads and asserts the executable markup is stripped while formatting survives. |
| F-031 | Added `supabase/functions/_shared/safe-fetch-url.ts` — rejects non-HTTPS, embedded credentials, and localhost/loopback/private/link-local/cloud-metadata hosts before any Firecrawl request. Wired into all four Firecrawl-calling functions (`research-scrape`, `research-public-snapshot`, `research-tas-context`, `research-enrich-tenant`); `research-tas-context`'s `training_gov_url` additionally must resolve to `training.gov.au`. | Edge Function source only, not deployed. New `safe-fetch-url.test.mjs` (14 cases, real dynamic execution against the actual `.ts` module via Node 24's native TS support) plus `firecrawl-url-validation-adoption.test.mjs` (static adoption sweep) — all pass. DNS-rebinding/redirect-time SSRF still needs a Firecrawl-side or resolver-side control; this validator only checks the literal URL/IP, as noted in its own docstring. |
| F-033–F-035 | Replaced bespoke/truthy-role authorization with `requireCaller` plus canonical tenant-access checks. Completeness validates the package/phase relation; evidence-gap and audit creation bind optional stage IDs to the requested tenant before service-role reads/writes. | Edge Function source only. New `stage-package-tenant-binding.test.mjs` statically verifies each function validates tenant/stage/package ownership *before* its service-role read/write, and that `create-client-audit` no longer treats a truthy `unicorn_role` as staff proof. Extended the existing `tenant-body-id-gate.test.mjs` sweep to include all three. Test unauthenticated, client-A-to-tenant-B, mismatched-stage, and permitted staff/client cases with real requests after deployment. |

F-026/F-027 (SharePoint global-site scoping) and F-031 (Firecrawl SSRF) are now implemented in source, closing out what was previously open higher-priority follow-up work — see rows above. None of the Edge Function changes in this report are deployed; no production data, policies, migrations, or Edge Functions were changed during this remediation pass. The full edge-function `node --test` sweep (140 assertions across all `_shared/*.test.mjs` files) and `npx tsc --noEmit` both pass clean as of this update.

## Coverage gaps and residual risk

- No authenticated browser journey could be run without credentials and a working browser automation package.
- No live Supabase/RLS verification was performed; source inspection cannot prove deployed policy state.
- The repository contains 222 edge functions in the static security review and a large SQL/migration surface. Static review identified high-risk entry points, but the hosted security scan did not reach a completed report in this session.
- Lint was not used as a release gate because repository guidance records thousands of pre-existing lint errors.
- Untracked user files were preserved and not included in the audit report’s findings.

## Recommended priority order

1. Fix F-001 and add deny-by-default route regression tests.
2. Repair the AddinSettings test mock and isolate the RiskOpportunityForm timeout.
3. Make the build check cross-platform or provide the documented Bash dependency.
4. Re-run the complete test suite and a completed security scan.
5. Install/provide Playwright in the approved test environment and exercise login, role-specific routing, tenant switching, EOS create/edit flows, communications, document generation, and logout/session expiry.
