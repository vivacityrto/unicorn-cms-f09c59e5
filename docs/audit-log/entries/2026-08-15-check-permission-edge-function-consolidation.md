# Audit: 2026-08-15 — consolidate edge-function authorisation on check_permission

**Trigger:** ad-hoc (security consolidation)
**Scope:** Every user-JWT gate in `supabase/functions/` (excluding `_shared/`
helpers except the new `requireCaller` and the Ask Viv / add-in wrappers).
Did not convert cron / webhook / token-redeem workers, retired 410 stubs, or
RLS-only "any authenticated" functions that had no role gate. Did not
redeploy every converted function in this session — migrations are applied
to prod; function deploy follows the usual MCP path per function as needed.

## Findings

- Pre-refactor inventory (188 functions): 23 already used `check_permission`;
  ~51 used `is_vivacity_internal`; ~38 used `unicorn_role` / `global_role`
  allowlists; 1 historical `role_type` mention (`invite-or-reset-user`,
  already fixed — `public.users` has no `role_type` column).
- Email surface was split: `send-composed-email` checked
  `is_vivacity_internal` OR `unicorn_role`/`global_role` staff lists OR
  tenant membership; `send-email-graph` only required a valid JWT (no
  tenant / staff check). Both now use `staff.email.send` + `orAllow`
  tenant membership. That is the one intentional tightening.
- `deliver-governance-document` consulted JWT `user_metadata.unicorn_role`
  (user-editable). Dropped; staff gate is `staff.documents.generate` only.
- `public.is_super_admin` existed as two overloads, both
  `search_path=public`. Many policies already used the no-arg form. The
  uuid form was called from `has_permission`, `search_knowledge_items`,
  and 13 RLS policies (`is_super_admin(auth.uid())` on EOS / knowledge /
  assistant_audit_log tables). Those callers are retargeted (functions →
  `is_super_admin_safe`; policies → no-arg `is_super_admin()`); the uuid
  overload is dropped; the no-arg form is pinned to `search_path=''`.

## KB changes shipped

- no changes

## Code changes (this entry accompanies one)

- `supabase/functions/_shared/requireCaller.ts` — canonical helper.
- New `permission_features` / `role_permissions` keys (staff.* plus
  admin.permissions.manage, admin.migration.unicorn1, admin.testing.seed,
  admin.vector.manage, admin.integrations.xero_connect, audits.export_pack).
  Grants match the previous allowed-sets (Team Member included on staff.*).
- Converted ad-hoc gates across the user-JWT functions listed in the PR.
- `README.md` — feature-key taxonomy for new functions.
- Separate migration `20260815080100_consolidate_is_super_admin.sql`.

## Converted functions (feature key)

Staff-wide (`staff.*`, all internal roles including Team Member):
SharePoint (`staff.sharepoint.use`), email (`staff.email.send`), documents
(`staff.documents.generate`), AI (`staff.ai.use` via requireCaller or
`validateAskVivAccess`), research (`staff.research.use`), meetings
(`staff.meetings.use`), Xero view (`staff.billing.xero_view`), TGA
(`staff.integrations.tga`), generic (`staff.internal`).

SA-only (reused `admin.system_config.manage` / new admin.* keys):
`create-tasks-from-minutes`, `extract-copilot-minutes`,
`generate-minutes-draft`, `generate-excel-document`,
`export-client-timeline-pdf`, `pdp-auto-evidence`, `provision-m365-user`,
`regulator-watch-check`, `repair-staff-uuids`, `research-enrich-tenant`,
`tga-sync` (admin-action path), `dashboard-test-seed`,
`update-role-permission`, Unicorn1 import/lookup/search, vector
rebuild/remove/embed, `addin-diagnostics-usage`.

SA + Integrator: `xero-auth` connect actions (`admin.integrations.xero_connect`).

Email surface: `send-composed-email` and `send-email-graph` both
`staff.email.send` + tenant-member `orAllow`. `unicorn_role` remains a
merge-field only.

Left as-is: 23 functions already on `check_permission`; cron/webhook/
token-redeem workers; retired 410 stubs; RLS-only any-auth; Ask Viv
rollout Super Admin bypass (`ai-orchestrator` / assistant flags).

## Decisions

- Behaviour-preserving except: Graph email now matches composed-email;
  deliver-governance-document no longer trusts JWT user_metadata.
- Client Admin stays on `orAllow`, not `role_permissions`.
- Add-in JWT path still verifies the add-in token, then
  `check_permission(..., staff.addin.use)` (SA / TL / TM only).

## Open questions parked

- RLS-only functions (`draft-finding`, `analyse-evidence`,
  `record-finding-decision`, unauthenticated TGA proxies) still have no
  explicit `check_permission` gate — same parked item as
  `2026-08-11-audit-feature-review`.
- `is_super_admin_safe` itself still has `search_path=public`.
