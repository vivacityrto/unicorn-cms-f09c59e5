# Audit: 2026-08-17 — SharePoint CORS regression

**Trigger:** drift-surfaced — document creation/import began returning an Edge Function error after the security remediation merges.
**Scope:** Production logs and deployed source for `import-sharepoint-template`; the CORS change in PR #303. No database objects, SharePoint content, or credentials were changed.

## Findings

- The SharePoint connection was healthy. Production logs showed a successful Graph site lookup before the failure.
- PR #303 correctly changed the shared CORS helper from a static header object to `corsHeaders(req)` so the response origin can be allowlisted.
- `handleBrowse` in `import-sharepoint-template` is a nested helper and did not receive `req`. The PR #303 mechanical call-site conversion introduced `corsHeaders(req)` in that helper, causing `ReferenceError: req is not defined` on SharePoint template browsing.
- The same post-deployment log sweep found the identical missing request context in the nested import, publish, and drift-check handlers. Import and publish had already failed in production; the drift-check path was proactively corrected before users encountered it.
- The browse failure prevented document-template selection/import and surfaced as a SharePoint connection error in the UI, despite the Microsoft Graph call succeeding.

## KB changes shipped

- no changes

## Code changes (if this entry accompanies one)

- Pass `req` from the Edge Function handler to all four action helpers and declare it in each helper signature.
- Add a Node regression test asserting that every action helper retains request context for CORS responses.
- Deployed `import-sharepoint-template` as production Edge Function version 407 after the targeted test passed.

## Decisions

- Treat nested helpers using `corsHeaders(req)` as a dedicated post-#303 regression-sweep category, rather than assuming the CORS hardening was behavior-preserving.

## Open questions parked

- Complete the broader security-remediation consequence audit: map all CORS helper conversions and other security merges to their user-facing flows, then resolve verified regressions through PRs.
