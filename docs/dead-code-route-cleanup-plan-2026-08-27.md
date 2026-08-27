# Dead-code route cleanup plan — 2026-08-27

## Objective

Remove only routes and components proven to have no supported runtime, API, document, test, bookmark, or operational contract. This work was opened after PR #413 accidentally removed `PackageDetail.tsx` while active wrappers still imported it; PR #416 restored it.

## Candidate scope (not yet approved for deletion)

- `src/pages/PackageDetail.tsx`, `src/pages/PackageDetailWrapper.tsx`, and `/package/:id`
- `src/pages/ClientEosOverview.tsx` and `/client/eos`

## Decisions and evidence (2026-08-27)

- **`PackageDetail.tsx`: retain.** PR #413 deleted the file after classifying the legacy `/package/:id` route as unreachable, but `AdminPackageDetailWrapper.tsx` and `AdminPackageTenantDetail.tsx` still import the shared component for active `/admin/package/:id...` routes. PR #416 restored it after the deletion broke module resolution.
- **`/package/:id`: retire.** It has no confirmed in-app navigation, the route was already returning 404 in the live SuperAdmin check, and its shared `PackageDetail.tsx` implementation is still used by active admin routes and therefore remains.
- **`/client/eos`: retire completely.** The old page and its sole-consumer components were already removed; the remaining compatibility redirect is now removed as requested. The supported client portal is `/client/home`.
- **Security fixes included in this branch:** block IPv4-mapped IPv6 URL literals in the Firecrawl validator and bind SharePoint sharing URLs to the tenant's configured shared/root folder ancestry, not merely the same drive.

## Verification recorded

- `node --test supabase/functions/_shared/safe-fetch-url.test.mjs supabase/functions/_shared/sharepoint-global-site-gate.test.mjs` — 24 passing tests, including IPv4-mapped IPv6, trailing-dot hostnames, same-drive/root-binding, and root-item rejection assertions.
- `git diff --check` — no whitespace errors; Windows line-ending notices only.
- `npx tsc --noEmit` and `npm run test:edge-functions` remain required release checks before the PR is considered merge-ready.

## Required evidence before deletion

1. Inventory imports, lazy imports, routes, `navigate`/`Link`/`href`, tests, documentation, and generated route inventory.
2. Identify the supported replacement for each candidate. If an old bookmarked URL has no replacement, retain it as a guarded redirect or retain the page.
3. Check client and staff role behavior through `ProtectedRoute`, `useRBAC`, `usePermission`, and tenant-scoped data calls.
4. Review Edge Function/RPC/API payloads for route URLs or feature-specific contracts.
5. Obtain independent functional, RBAC/tenant, and release-test council sign-off.

## Implementation sequence

1. Make an explicit retain/remove/redirect decision per candidate and update this document with evidence.
2. If removal is approved, delete the component, wrapper, lazy import, route, navigation references, route inventory rows, tests, and obsolete docs in the same change.
3. If a bookmark remains plausible, replace the route with a purposeful `<Navigate>` redirect and test it instead of returning Not Found.
4. Run `npx tsc --noEmit`, focused route tests, `npm run test:edge-functions`, `git diff --check`, and a local authenticated browser check for adjacent package and client routes.
5. Run a second council review over the final diff. Do not commit/deploy until all direct imports and route behavior are verified.

## Known adjacent open findings

- `/client/eos` and `/package/:id` are intentionally absent after explicit retirement; the route inventory and current EOS/package documentation now record that decision.
- The `safe-fetch-url` IPv4-mapped IPv6 SSRF bypass and SharePoint same-drive/root-scoping gap are unrelated security fixes; do not mix them into a route-removal commit unless explicitly scoped and separately tested.
