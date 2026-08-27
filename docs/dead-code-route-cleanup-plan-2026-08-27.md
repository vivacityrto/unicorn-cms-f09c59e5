# Dead-code route cleanup plan — 2026-08-27

## Objective

Remove only routes and components proven to have no supported runtime, API, document, test, bookmark, or operational contract. This work was opened after PR #413 accidentally removed `PackageDetail.tsx` while active wrappers still imported it; PR #416 restored it.

## Candidate scope (not yet approved for deletion)

- `src/pages/PackageDetail.tsx`, `src/pages/PackageDetailWrapper.tsx`, and `/package/:id`
- `src/pages/ClientEosOverview.tsx` and `/client/eos`

## Decisions and evidence (2026-08-27)

- **`PackageDetail.tsx`: retain.** PR #413 deleted the file after classifying the legacy `/package/:id` route as unreachable, but `AdminPackageDetailWrapper.tsx` and `AdminPackageTenantDetail.tsx` still import the shared component for active `/admin/package/:id...` routes. PR #416 restored it after the deletion broke module resolution.
- **`/package/:id`: defer retirement.** It has no confirmed in-app navigation, but its route and feature history are documented. Do not remove it until bookmark/operational use and an intentional redirect destination are confirmed.
- **`/client/eos`: retain compatibility, not its obsolete component implementation.** The original page remains removed, but the route now redirects to the supported, protected `/client/home` client portal route so old links no longer fail with Not Found.
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

- `/client/eos` is currently absent after PR #413 and has documented client-facing semantics. It must be restored or redirected before it can be considered intentionally retired.
- The `safe-fetch-url` IPv4-mapped IPv6 SSRF bypass and SharePoint same-drive/root-scoping gap are unrelated security fixes; do not mix them into a route-removal commit unless explicitly scoped and separately tested.
