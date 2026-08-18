# Audit: 2026-08-18 — SharePoint import drive scoping, and OAuth/upload re-verification

**Trigger:** ad-hoc — follow-up on `docs/claude-security-architecture-audit-handoff-2026-08-18.md`
open docket item "SharePoint family (`upload-sharepoint-file`,
`import-sharepoint-template`): verify cross-client folder/tenant scoping" and
the H2 OAuth carryover ("`outlook-auth` and `xero-auth`: bind exchange-code
branches to the initiating caller/state and enforce redirect URI allowlists").

**Scope:** Read both live-deployed source (via Supabase MCP `get_edge_function`)
and repository source for `upload-sharepoint-file`, `import-sharepoint-template`,
`xero-auth`, and `outlook-auth`. Read `docs/audit-log/entries/2026-08-17-sharepoint-cors-regression.md`,
`2026-08-17-tga-sharepoint-name-sync.md`, and `2026-08-15-oauth-redirect-allowlist-and-caller-binding.md`
first to avoid duplicating that work — those entries fixed CORS request-context
and TGA/folder-name issues, and OAuth caller binding, respectively; none of
them addressed the drive-scoping defect fixed here. No production deploy was
performed as part of this session.

## Findings

- **`import-sharepoint-template` (`handleImport`, real, previously-unfixed
  finding):** the `import` action accepted `source_drive_id` and
  `source_item_id` directly from the request body and passed them straight to
  `graphGet`/`graphDownload` using the app-only Graph token, with no check
  that `source_drive_id` was actually the configured Master Documents drive.
  `handleBrowse` and `computeDrift` both resolve/verify the Master Documents
  drive id from the `sharepoint_sites` table server-side; `handleImport` alone
  trusted the client. Any caller who clears the `staff.sharepoint.use` feature
  gate (internal staff, not tenant-scoped) could have pointed `source_drive_id`
  at any drive the app registration has Graph access to — including a
  client-tenant's provisioned SharePoint folder (`provision-tenant-sharepoint-folder`
  grants the same app registration access there) — and had its contents
  imported into the shared governance template catalog, or simply used the
  endpoint as a read oracle against another tenant's drive. Confirmed both in
  the repository (`supabase/functions/import-sharepoint-template/index.ts`,
  `handleImport`) and in the live-deployed source (version 425, same content,
  retrieved via `get_edge_function`).
- **`upload-sharepoint-file` — verified already resolved, no code change
  needed.** Tenant scoping is derived from the caller's own `users.tenant_id`
  row; a non-Super-Admin's `tenant_id` body field is ignored (only logged as a
  warning) and Super-Admin tenant override is an intentional privileged path,
  not a caller-controlled bypass. The upload destination
  (`parent_folder_id`) is verified against the tenant's own root via
  `verifyWithinRoot` before any Graph write. Live-deployed source (version
  217) matches the repository file exactly.
- **`xero-auth` (H2) — verified already resolved, no code change needed.**
  Independently re-checked against the same three properties the 2026-08-15
  entry established for `outlook-auth`: (1) redirect_uri is resolved via the
  shared `resolveRedirectUri("xero", …)` — env-derived, request value only
  accepted if it equals the canonical URI; (2) `exchange-code` calls
  `consumeOAuthState(supabaseAdmin, state, caller.user.id)`, which asserts
  `callerId === stateData.user_id` (`assertStateCaller`) before proceeding;
  (3) the same `consumeOAuthState` helper does the atomic
  `UPDATE ... SET consumed_at ... WHERE consumed_at IS NULL AND expires_at > now()`
  single-use claim used by `outlook-auth`. `xero-auth` and `outlook-auth`
  share the same `_shared/oauth-redirects.ts` and `_shared/oauth-states.ts`
  modules, so this was a shared-helper fix, not a per-function one — H2 is
  fully resolved for both providers, not partially. Live-deployed source
  (version 64) matches the repository file exactly, and bundles the same
  `_shared/oauth-redirects.ts` / `_shared/oauth-states.ts` content.

## KB changes shipped

- no changes

## Code changes (if this entry accompanies one)

- `supabase/functions/import-sharepoint-template/index.ts`: extracted
  `resolveMasterDriveId` (the drive-id resolution/caching logic previously
  inlined in `handleBrowse`) and call it from `handleImport` before any Graph
  fetch, rejecting with 403 when the caller-supplied `source_drive_id` does
  not match the resolved Master Documents drive id. `handleBrowse` now calls
  the same helper instead of duplicating the resolution logic.
- `supabase/functions/import-sharepoint-template/drive-scoping.test.mjs`: new
  `node:test` regression test asserting the shared helper exists, that
  `handleImport` checks it before the first `graphGet` call, and that
  `handleBrowse` still uses it rather than a caller-supplied drive id. Run via
  `node --test supabase/functions/import-sharepoint-template/drive-scoping.test.mjs`;
  passes (3/3).
- Not yet deployed — source-controlled fix only, pending review. Deploy via
  Supabase MCP `deploy_edge_function` once approved.

## Decisions

- Fix scoped to `handleImport` (the only action trusting a caller-supplied
  drive id); `handlePublish`/`handleCheckDrift` already resolve
  `sharepoint_sites.drive_id` server-side via `computeDrift` and needed no
  change.
- Did not add tenant-membership scoping to `import-sharepoint-template`
  itself, because it manages a shared governance template catalog (not
  per-tenant client data) gated on the internal `staff.sharepoint.use`
  feature key with no `orAllow` tenant-member fallback — the risk this closes
  is cross-*site* (arbitrary Graph drive), not cross-tenant document
  ownership within this function.

## Open questions parked

- Whether the app registration's Graph permission grants (`Sites.Selected`)
  should be scoped so the service principal cannot reach client-tenant
  SharePoint sites from a Master-Documents-only workflow at all — this fix is
  an application-layer allowlist, not a Graph-permission-layer one, and a
  compromised/over-permissioned staff account with `staff.sharepoint.use`
  could still reach other drives from other functions that legitimately need
  tenant-scoped access. Flagging for the governance/config workstream in the
  main handoff rather than actioning here.
