# Audit: 2026-08-18 — invitation role-ceiling service_role bypass fixed

**Trigger:** drift-surfaced — parked finding from the 2026-08-18 security remediation session (see `docs/claude-security-architecture-audit-handoff-2026-08-18.md`), actioned as a follow-up once the original PR batch (#341–#345) was merged and deployed.
**Scope:** the `trg_enforce_invitation_role_ceiling` trigger on `public.user_invitations` and every write path into that table (frontend, RPCs, and all `supabase/functions/**` edge functions). Did not touch RLS policies on `user_invitations` or any other table.

## Findings

- `enforce_invitation_role_ceiling()` unconditionally exempted any insert/update where `current_setting('request.jwt.claim.role', true) = 'service_role'`. Every `supabase/functions/**` edge function connects to Postgres as `service_role`, so this exempted **100% of edge-function-originated writes** to `user_invitations` — not just a narrow "trusted internal batch job" case as the design likely intended.
- Traced every write path into `user_invitations`:
  - **INSERT, can carry an internal role:** `invite-user` (VIVACITY branch, gated on `admin.team_users.manage` at the app layer) and `activate-ghost-user` (Vivacity-tenant branch, same gate). Both independently verify the caller via `supabase.auth.getUser(token)` and stamp the resolved user id onto `invited_by` before inserting.
  - **INSERT, client-role only:** `invite-to-tenant` (`CLIENT_ROLES = ["Admin","User"]` allowlist, fixed in the earlier `invite-to-tenant-role-allowlist` entry) — never reaches the internal-role branch of this trigger regardless.
  - **UPDATE, never touches `unicorn_role`:** `resend-invite`, `cancel-invite`, `accept_invitation_v2` (RPC). The trigger's own `TG_OP = 'UPDATE' AND NEW.unicorn_role IS NOT DISTINCT FROM OLD.unicorn_role` early-return already covers these; they're unaffected by this change either way.
  - **Legacy/dead code:** the SQL function `invite_user(uuid, text, text)` references `user_invitations.role`/`.token` and a `tenant_members` join shape that doesn't match the current schema (`unicorn_role`/`token_hash`, `tenant_id bigint`) — it would error if ever called. Not touched in this change; flagged here as a candidate for a future cleanup PR, not actioned now (out of scope for this fix and not itself a live vulnerability).
- Confirmed `invite-user`'s own code comment already named this exact gap: *"service-role callers (this fn) are short-circuited by the trigger via `request.jwt.claim.role = 'service_role'`"* — i.e. the app-layer `admin.team_users.manage` check in `invite-user`/`activate-ghost-user` was the **only** defense against granting an internal Unicorn role via an invitation, not defense-in-depth as the trigger's name (`..._ceiling`) implies.
- Checked whether tightening the check to `is_super_admin_safe()` could regress a legitimately-broader grant: queried `role_permissions` for `admin.team_users.manage` at `full` — currently granted only to `Super Admin` (`Team Leader`/`Integrator`/`BGT`/`CSC`/`CET` are all `none`), and no ad-hoc `user_roles` grants extend it. So today `is_super_admin_safe(invited_by)` and the app-layer `admin.team_users.manage` gate resolve identically; this fix is not a behavior change for any current legitimate caller.

## Fix

`enforce_invitation_role_ceiling()`: when the connecting role is `service_role`, use `NEW.invited_by` as the acting-user identity instead of exempting the write outright (auth.uid() is NULL under service_role, since these edge functions don't forward the caller's JWT to a per-request client). `invited_by` is populated by each edge function's own verified `auth.getUser(token)` call before the insert, so it's a trustworthy proxy for "who this edge function's own auth check resolved" — not attacker-suppliable data, since callers never write to `user_invitations` directly.

Deliberately checks `is_super_admin_safe()` (strict `unicorn_role = 'Super Admin'` / `global_role = 'SuperAdmin'`) rather than re-running `check_permission('admin.team_users.manage')`: `role_permissions` is a live-editable table, and this trigger's job is to hold the ceiling independently even if that table is ever misconfigured to grant the feature more broadly in the future. This is intentional defense-in-depth, matching the trigger's own name.

Verified the new logic by tracing all six write paths above against the new function body (see reasoning in this entry) rather than by inserting live test rows into the production table — a transactional dry-run insert was attempted and correctly denied by the session's own auto-mode safety classifier as a live-data-mutating action; static trace was judged sufficient given every path was already read in full.

## Code changes

- Migration `20260818040717_fix_invitation_role_ceiling_service_role_bypass` (applied directly to production via Supabase MCP `apply_migration`, with explicit in-session authorization; committed to `supabase/migrations/` in this PR).
- No edge function changes — the fix is entirely in the trigger function; no redeploy required.

## Decisions

- Left `check_permission`-style flexible permission checks out of the trigger on purpose (see Fix section) — a deliberate stricter-than-app-layer design, not an oversight.
- Left the legacy `invite_user(uuid, text, text)` SQL function alone — dead code referencing a stale schema shape, not a live path, not in scope for this fix.

## Open questions parked

- The legacy `invite_user(uuid, text, text)` RPC (references `tenant_members`/`role`/`token` columns not present on current `user_invitations`) should probably be dropped in a follow-up cleanup PR — confirm it truly has zero callers first (frontend grep already shows none).
