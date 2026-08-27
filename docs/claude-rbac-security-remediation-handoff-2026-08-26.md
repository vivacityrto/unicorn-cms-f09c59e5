# RBAC and security remediation handoff — 2026-08-26

## Branch and state

- **Branch:** `hotfix/rbac-security-remediation-20260826`
- **Base at branch creation:** the shared checkout's `main`.
- **Commit state:** no commit, push, deployment, migration, or production-data mutation has been made.
- **Important:** this checkout is shared with other coding tools. Do not switch branches in the shared checkout. Preserve unrelated untracked artifacts: `conclude-before-share.png`, `long-phrase.png`, `opc-live.png`, `prs_404.json`, and `prs_404_condensed.txt`.
- **Primary audit report:** [`audit-report-2026-08-26.md`](audit-report-2026-08-26.md).
- **RBAC v6 plan updated:** [`kb/handoffs/rbac-v6-gate-closure-plan.md`](kb/handoffs/rbac-v6-gate-closure-plan.md).

Read `AGENTS.md` before acting. In particular: Supabase is hosted production, Edge Functions must be deployed using the Supabase MCP workflow, any schema/RLS/trigger migration needs an audit-log entry, and never push/merge without an explicit current-session instruction.

## Completed local source changes

### RBAC and core UI

| Finding | Files | Change | Status |
|---|---|---|---|
| F-001 | `src/hooks/useRBAC.tsx`, `src/components/ProtectedRoute.tsx`, `src/test/rbac/useRBAC.test.ts` | Added one exact/prefix-aware `isClientAccessibleRoute()` classifier shared by the helper and guard. Client users can access exact `/dashboard`, `/settings`, `/profile`, `/my-exit-interview`, `/academy`, plus `/client/*` and `/academy/*`; unclassified routes fail closed. This blocks `/settings/*`, `/settings-evil`, and `/client-portal/:id/documents`. | Source changed; needs real client persona deep-link verification. |
| F-011 | `src/hooks/useAuditWorkspace.ts` | Detects and throws `sync_audit_actions_to_client_items` RPC errors instead of silently reporting zero actions. | **Partial:** audit completion still happens before sync outcome. Design a sync-before-complete or transactional solution. |
| F-012 | `src/App.tsx`, `src/pages/ClientEosOverview.tsx` (deleted), `src/components/eos/client/*` (deleted), `src/hooks/useAuth.tsx` | `/client/eos` was orphaned/half-built (staff `DashboardLayout` shell, no nav link anywhere) — confirmed abandoned and deleted outright, along with the `client_id` profile field/select added only to feed it. | Resolved by complete removal; the compatibility redirect was also removed on 2026-08-28. No Demo RTO verification is needed for a retired route; use `/client/home` for client-portal verification. |
| F-013 | `src/components/layout/ClientLayout.tsx` | Passes `openDocumentRequest` through context instead of a no-op. | Source changed; verify Client Home and TGA request dialog. |
| F-014 | `src/components/audit/workspace/AuditSidebar.tsx` | Uses `/tenant/:tenantId?tab=packages&stageInstance=:id`, matching `ClientDetail`. | Source changed; verify with an audit having a linked stage. |
| F-016 | `src/hooks/useAuth.tsx`, `src/components/ProtectedRoute.tsx` | Exposes `profileError`; adds retry/sign-out recovery rather than permanent loading for failed/missing profiles. | Source changed; add mocked failure test. |
| F-018 | `src/components/client/ClientPackagesTab.tsx` | Checks `end_date` and renewal `start_date` update errors before success. | Source changed; test injected update failure. |
| F-020 | `src/pages/admin/QASmokeTest.tsx` | Corrected stale smoke paths. | Authenticated browser check passed. |
| F-036 | `src/pages/Login.tsx` | Removed invalid `fetchPriority` prop. | Source changed; verify fresh login console. |

### XSS

| Finding | Files | Change | Status |
|---|---|---|---|
| F-029 | `src/components/academy/builder/LessonEditorPanel.tsx` | Uses existing `sanitizeHtml()` before lesson preview `dangerouslySetInnerHTML`. | Add component payload test. |
| F-030 | `src/components/stage/StageSimulationDialog.tsx` | Uses existing `sanitizeEmailHtml()` before email preview `dangerouslySetInnerHTML`. | Add component payload/merge-value test. |

### Edge Function authorization

| Finding | Files | Change | Status |
|---|---|---|---|
| F-028 | `supabase/functions/add-missing-packages/index.ts` | CORS preflight plus `requireSuperAdmin()` before service-role client and package mutation. | Source only; check deployed external usage before deploy/retirement decision. |
| F-032 | `supabase/functions/get-organisation-details/index.ts`, `supabase/functions/search-organisations/index.ts` | `requireCaller(... FeatureKeys.staffTga)` before request parsing/TGA calls. | Source only; ensure external callers are intended to be staff-only. |
| F-033 | `supabase/functions/calculate-phase-completeness/index.ts` | Replaced custom bearer handling with `requireCaller(FeatureKeys.staffInternal)` plus `hasTenantAccessSafe` fallback; verifies tenant/package and package/phase relationship before service-role reads. | Source only; function has `verify_jwt=false` in config, so deploy and request tests are mandatory. |
| F-034 | `supabase/functions/research-evidence-gap-check/index.ts` | Uses `requireCaller(FeatureKeys.staffResearch)` plus `hasTenantAccessSafe`; resolves `stage_instances -> package_instances` and requires tenant match before creating jobs, reading files, or writing results. | Source only; deploy and negative request tests are mandatory. |
| F-035 | `supabase/functions/create-client-audit/index.ts` | Replaced truthy `unicorn_role` test with `requireCaller(FeatureKeys.staffInternal)` plus canonical tenant-access fallback; validates optional linked stage belongs to the subject tenant. | Source only; deploy and client/staff matrix required. `caller.via === 'permission'` controls staff-only intelligence trigger. |

## Verification already run

- `npx tsc --noEmit` passed after the latest changes.
- `git diff --check` has no whitespace errors (only Windows line-ending warnings).
- Local Vite server was run using `npm run dev -- --host 127.0.0.1`; `curl.exe -I http://127.0.0.1:8080/dashboard` returned 200.
- Authenticated Playwright via a persistent Chrome/CDP session loaded `/admin/qa/smoke`. It displayed the corrected canonical links: `/dashboard`, `/profile`, `/manage-users`, `/manage-tenants`, and `/eos/risks-opportunities`.
- `npx vitest run src/test/rbac/useRBAC.test.ts --reporter=dot` stalled after Vitest started. This is an existing F-025 verification issue; do not misreport it as a passing test.
- `npm run build` is blocked on this Windows host because its script requires `bash`; this is F-004.
- Deno is not installed locally, so Edge Function type checking was not possible here.

## Required next plan

1. **Review the current diff first.** Confirm the Edge Function feature keys and `hasTenantAccessSafe` fallback match product policy. Pay special attention to `calculate-phase-completeness`: it validates `package_instances(tenant_id, package_id)` and `phase_stages(package_id, phase_id)`, but the component is legacy/unmounted according to council review. Preserve intended behavior or formally retire it.
2. **Add focused regression tests.**
   - RBAC: test the exported classifier or real `ProtectedRoute` with client Admin/User for all allowed exact routes, allowed prefixes, `/settings/calendar`, `/settings-evil`, `/client-portal/:id/documents`, `/clients`, unknown route, and staff outcomes.
   - Profile recovery: mock profile error/no row; assert Retry invokes fetch and Sign Out clears session/navigates.
   - XSS: include `<img src=x onerror=...>`, script tags, unsafe URLs and malicious merge values; assert preview sanitizer removes executable markup while retaining intended formatting.
   - Edge functions: add to `supabase/functions/_shared/tenant-body-id-gate.test.mjs` where applicable, plus function behavior tests for unauthenticated, tenant-A targeting tenant-B, mismatched stage/package, valid tenant member, and valid staff. Denials must make no writes/upstream calls.
3. **Use real client personas in isolated browser contexts.** Ask the user to sign into Demo RTO in a fresh persistent/browser context. Do not rely on SuperAdmin "View as Client". Verify RBAC deep links, `/client/eos`, document-request dialog from Client Home/TGA, and a linked-audit stage link. Use only read-only flows unless an explicitly safe disposable test tenant and cleanup plan are available.
4. **Implement remaining high-risk findings before release.**
   - F-026/F-027 SharePoint: `browse-sharepoint-folder` must require `staffSharepoint` for global `site_purpose`; tenant browsing must use `hasTenantAccessSafe`; `get-sharepoint-parent-folder` must require `tenant_id`, validate caller access, resolve only SharePoint hosts, and bind drive/ancestry to the tenant root. Read the existing resolver and its tests first. A stronger global root boundary needs a configured `sharepoint_sites.root_item_id`, which means migration/backfill/audit entry.
   - F-031: add a shared URL validator for `research-scrape`, `research-public-snapshot`, `research-tas-context`, and `research-enrich-tenant`. Reject non-HTTPS, credentials, localhost, loopback, private/link-local/metadata IP literals; enforce `training.gov.au` only where applicable. DNS rebinding/redirect policy needs a Firecrawl-side control too.
   - F-015/F-017/F-019/F-021–F-025: decide scope and implement separately. F-019 needs a transactional reorder RPC/migration; do not ship a partial client-only workaround.
5. **Deploy only after review and test preparation.** Edge Function deployment is required for F-028/F-032–F-035. Use configured Supabase MCP deployment tools, then run direct authenticated negative requests. No migration is currently required for completed changes. Do not deploy without explicit user authority if the current task only intended local code changes.
6. **Update the audit report.** Mark findings as source-remediated, deployment-verified, or still open; do not call any Edge Function finding closed until deployed tests pass.
7. **Commit/PR only with explicit user instruction.** Suggested commit grouping: frontend/RBAC/XSS, then Edge Function gates, then tests/docs. Do not include unrelated untracked files.

## Council conclusions

- The council confirmed the route helper’s original fall-through was unsafe, but warned that raw `startsWith` client prefixes were also too broad. The current shared exact/prefix classifier is the intended narrow fix.
- Client-side guards are UX/deep-link controls only. RLS and Edge Function authorization remain the enforcement boundary.
- `users.client_id` is a UUID and must not be replaced with numeric `tenant_id` for the EOS RPC.
- `stage_instances` has no `tenant_id`; validate ownership through `stage_instances.packageinstance_id -> package_instances.tenant_id`.
- `hasTenantAccessSafe` is the canonical fail-closed tenant check. Avoid raw `tenant_users` membership reads for new service-role gates.
- The UI's unmounted/legacy phase and evidence components do not prove the Edge endpoints are unused; deployment logs and caller contracts still need review.

## Claude Code starter prompt

```text
Continue the RBAC/security remediation on branch hotfix/rbac-security-remediation-20260826 in the Unicorn 2.0 repo. Read AGENTS.md and docs/claude-rbac-security-remediation-handoff-2026-08-26.md end-to-end before changing anything. Do not switch the shared checkout branch, commit, push, deploy, run migrations, or modify production data without my explicit approval.

First inspect and review the existing uncommitted diff; preserve unrelated untracked files. Treat docs/audit-report-2026-08-26.md as the current finding ledger and docs/kb/handoffs/rbac-v6-gate-closure-plan.md as the future RBAC design context.

The first source tranche already fixes RBAC route fail-closed behavior, client EOS/auth profile data, audit links, package finalisation errors, profile failure recovery, QA links, two preview XSS sinks, and authorization gates for add-missing-packages, the two legacy TGA functions, calculate-phase-completeness, research-evidence-gap-check, and create-client-audit. These Edge changes are NOT deployed or production-verified.

Work in this order:
1) add focused tests for the existing RBAC classifier/ProtectedRoute, profile recovery, XSS payload sanitization, and Edge tenant/stage denial behavior;
2) ask me to authenticate Demo RTO in a fresh browser context, then run read-only Playwright checks for real client deep links, client EOS, document request dialog, and linked-audit navigation;
3) implement the remaining high-risk SharePoint root-scoping findings F-026/F-027 and Firecrawl URL validation F-031, after source/test review;
4) run type checks, focused tests, and browser checks; record any pre-existing hangs/failures honestly;
5) update the audit report with exact source/deployment/verification status.

Use `hasTenantAccessSafe` for tenant-bound service-role gates. `stage_instances` has no tenant_id, so resolve through package_instances. UI guards do not replace RLS/Edge authorization. Any schema/RLS/trigger migration must have docs/audit-log entry and be deployed through Supabase MCP only. Never use a SuperAdmin “View as Client” session as proof of client behavior.
```
