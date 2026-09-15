# Audit: 2026-09-15 — `is_tenant_parent_safe`/`has_tenant_admin_safe` never excluded disabled accounts

**Trigger:** RBAC/security review requested by Codex (TOM) on the shared coordination board — item 6 of TOM P1.2-c's "evidence still required before retirement": confirm the standard contact/invitation replacement path preserves the intended capability boundary and has no browser/orchestrator bypass. Found while tracing that path's actual authorization chain (`swap_tenant_user_to_contact`, `mark_tenant_contact_promoted`, `invite-user`, and `user_invitations`' own RLS), immediately after fixing the sibling gap in `is_super_admin_safe`/`has_permission`/`check_permission` (`docs/audit-log/entries/2026-09-15-gate-permission-core-on-disabled-and-archived.md`).
**Scope:** `public.is_tenant_parent_safe(bigint, uuid)`, `public.has_tenant_admin_safe(bigint, uuid)`.

## Findings

- **`is_tenant_parent_safe`** checked only `tenant_users.role = 'parent'` for the calling user — no join to `public.users` at all, so it never considered whether that user's own account was `disabled` or `archived`. This function gates `swap_tenant_user_to_contact` and `mark_tenant_contact_promoted` (the two RPCs behind the client-side "swap user to contact" / "promote contact to user" workflow — the exact replacement mechanism TOM's ghost-activation retirement depends on).
  - Confirmed live: **359** `tenant_users` rows with `role = 'parent'` currently belong to a `public.users` row that is `disabled` or `archived`.
- **`has_tenant_admin_safe`** checked only `tenant_members.role = 'Admin' AND status = 'active'` — a field entirely separate from `public.users.disabled`. `rpc_set_client_account_status` (the only path that disables a client account) exclusively sets `public.users.disabled`; it never touches `tenant_members.status`. This function directly gates `user_invitations`' own RLS `INSERT`/`UPDATE`/`DELETE` policies — a table writable directly via PostgREST, not only through the `invite-user` Edge Function.
  - Confirmed live: **338** `tenant_members` rows with `role = 'Admin', status = 'active'` currently belong to a `public.users` row that is `disabled` or `archived`.
  - Practical effect before this fix: a disabled tenant Admin's still-valid session (disabling never revokes the Supabase Auth session — see the linked sibling audit entry) could directly `INSERT`/`UPDATE`/`DELETE` rows in `user_invitations` for their own tenant via PostgREST, entirely bypassing `invite-user`'s app-layer checks (rate limiting, per-tenant user-capacity cap, primary/secondary-contact uniqueness, and the tenant-admin relationship-role allowlist).

## Separate, related finding not fixed here (answers Codex's specific "browser bypass" question directly)

Reviewed whether a browser-originated direct `INSERT` into `user_invitations` could escalate privilege (create an invitation carrying an internal Vivacity `unicorn_role`, e.g. `Super Admin`). **It cannot** — `trg_enforce_invitation_role_ceiling` (`BEFORE INSERT OR UPDATE`) independently re-checks `is_super_admin_safe(auth.uid())` for any row whose `unicorn_role` is one of the seven internal roles, regardless of caller (service-role Edge Function or direct browser call), and now benefits transitively from today's `is_super_admin_safe` fix. This is real defense-in-depth, not the same trigger-only-covers-browser-calls caveat already documented in `AGENTS.md` for a different table — this one is designed to run for every caller including `service_role` (it branches on `request.jwt.claim.role` specifically to resolve the correct acting-user identity, not to skip the check).

What the trigger does **not** cover: a tenant Admin directly inserting a **client-role** invitation (e.g. `unicorn_role: 'Admin'`, `relationship_role: 'primary_contact'`) bypasses `invite-user`'s own business-rule checks — capacity cap, rate limit, and the tenant-admin relationship-role allowlist (`invite-user` restricts a tenant admin's own invites to `academy_user`/`secondary_contact`/`user`, not `primary_contact`). This is a real gap, separate from the disabled-account issue above, and was **not fixed in this entry** — it requires either an RLS `WITH CHECK` clause encoding the same relationship-role restriction, or converting `user_invitations` INSERT to a `SECURITY DEFINER` RPC mirroring `invite-user`'s validation. Flagged as a follow-up (see "Open questions parked").

`invite-user`'s own `isTenantAdmin` branch (`callerProfile.unicorn_role === 'Admin'`, no `disabled` filter on the profile lookup) has the same class of gap at the Edge Function layer — also not fixed here, flagged as a follow-up requiring an Edge Function code change rather than a SQL migration.

## Code changes (this entry accompanies one)

- Migration `gate_tenant_parent_and_admin_safe_on_disabled` (already applied via Supabase MCP, committed for repo history — `CREATE OR REPLACE`, same signatures, confirmed no `DROP FUNCTION` needed): both functions now join to `public.users` and require `COALESCE(disabled, false) = false AND COALESCE(archived, false) = false` on the calling user, in addition to their existing role/status checks.
- Purely restrictive: only removes access from accounts already disabled or archived.

## Decisions

- Fixed immediately, same severity reasoning as the sibling `is_super_admin_safe`/`has_permission`/`check_permission` fix earlier today — real, currently-live exposure (359 and 338 accounts respectively), not theoretical.
- Did **not** fix the two adjacent findings above (the direct-insert business-rule bypass, and `invite-user`'s own Edge Function gap) in this entry — both require frontend/Edge/RLS-design changes beyond a same-shaped SQL tightening, and neither is a privilege-escalation path (the role-ceiling trigger already blocks that), so they don't block TOM's retirement decision the way the disabled-account gap did.
- Answering Codex's specific question directly: the standard invitation path's core protection against privilege escalation (creating an internal-role invitation) holds regardless of caller, including for a disabled account, both before and after this fix — `trg_enforce_invitation_role_ceiling` was already correct. What this entry fixes is a different question: whether a *disabled* client-side parent/admin account retained ordinary tenant-admin capability it should have lost — it did, and now doesn't.

## Verification

- Confirmed live via `pg_get_functiondef` re-fetch after the migration.
- Gap-closed check: re-ran the two exposure queries above against `has_tenant_admin_safe(tenant_id, user_id)` for 3 disabled/archived rows each — all now return `false` (previously implicitly `true` via the unfixed function).
- Regression check: 3 active (`disabled=false, archived=false`) `tenant_members` Admin rows still return `true` for `has_tenant_admin_safe` — unchanged.

## Open questions parked

- Whether `user_invitations`' `INSERT` RLS policy should encode the same tenant-admin relationship-role restriction `invite-user` enforces (`academy_user`/`secondary_contact`/`user` only, capacity cap, rate limit) so a direct PostgREST call can't create a `primary_contact` invitation or exceed the user cap. Not attempted here — a policy-design or RPC-conversion decision, not a same-shaped disabled-account fix.
- `invite-user`'s `isTenantAdmin` branch should filter `disabled`/`archived` on `callerProfile`, matching the DB-side fix. Small, Edge-Function-only change; flagged rather than done here to keep this entry to the SQL-layer fix it's actually about.
- Whether other client-tenant-side `SECURITY DEFINER` functions share the same `is_tenant_parent_safe`/`has_tenant_admin_safe` gap pattern by calling a different, unaudited helper — not swept; this entry only covers the two functions read and confirmed during this specific review.
