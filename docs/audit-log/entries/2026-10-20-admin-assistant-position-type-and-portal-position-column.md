# Audit: 2026-10-20 — admin-assistant-position-type-and-portal-position-column

**Trigger:** ad-hoc (Carl asked for the Position Type to appear in the client portal Users table, editable by the people who manage portal users, and for "Admin Assistant" as a new position type)
**Scope:** `dd_position_type`, `tenant_users.position_type`, the RLS on `public.tenant_users`, the portal Users page (`/client/users`) and its row source `get_client_tenant_users`. Verified read-only against the Unicorn production project (`yxkgdalkbrriasiyyrwk`). Did not change `get_client_tenant_users`, any RLS policy, any trigger, or the staff-side tenant users page. **The migration in this change has NOT been applied to production.**

## Findings
- Position type is a data-driven lookup: `tenant_users.position_type` and `tenant_contacts.position_type` are text FKs to `dd_position_type(value)`. Every dropdown reads the table live, and no frontend or database function hardcodes the list (the only functions that mention `position_type` are `get_admin_contact_directory` and `swap_tenant_user_to_contact`, which copy the value through). Adding an option is therefore a data change, not a code change.
- Production holds 8 options, two more than the 2026-07-27 migration seeded: `director` (id 7) and `previous_user` (id 8) exist in production but in no migration in this repo. A fresh environment built from the migrations would be missing them. Not fixed here; parked below. The id sequence is healthy (`last_value` 8, `is_called` true), so the new row gets id 9 with no collision.
- Before this change the client portal showed position type only in the Contacts section (`TenantContactsSection`, editable by the people who manage portal users). The **Users table on `/client/users` had no position column**, while the staff-side `TenantUsersTab` already shows and edits it.
- The portal's row source `get_client_tenant_users` returns no position type. Reading `tenant_users` directly would not work for the portal: `tenant_users_select` admits only the caller's own row, tenant "parents" (`role = 'parent'`), Super Admins and Vivacity staff.
- Writing directly would silently fail for some of the people the portal lets manage users. `ClientTenantContext.canManagePortalUsers` is a **full-scope primary or secondary contact** (`relationship_role`), but the `tenant_users_update` policy admits only `role = 'parent'` or Super Admin. A secondary contact's `UPDATE` would change zero rows and return no error. `set_relationship_role` solves the same mismatch with a `SECURITY DEFINER` RPC; the new setter copies its gate exactly.
- Position changes made through the setter are recorded by the existing `trg_audit_tenant_users` trigger. `trg_sync_primary_contact` only derives `primary_contact`/`secondary_contact` from role columns and is a no-op for a position-only update.
- The read-only Supabase MCP connection in the session points at the separate ComplyHub project (`gdwhlstfguxarnxasrrs`), which has no `dd_position_type` or `tenant_users.position_type`; it produced no finding here.

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- `supabase/migrations/20261020100000_admin_assistant_position_type_and_portal_position_rpcs.sql`:
  - inserts `admin_assistant` / "Admin Assistant" at `sort_order` 7 into `dd_position_type` (`ON CONFLICT (value) DO NOTHING`);
  - adds `get_client_tenant_user_position_types(p_tenant_id integer)` returning `(user_id, position_type)`, `STABLE SECURITY DEFINER`, `search_path ''`, same visibility as `get_client_tenant_users` (staff or any member of the tenant);
  - adds `set_tenant_user_position_type(p_tenant_id bigint, p_user_id uuid, p_position_type text)`, `SECURITY DEFINER`, `search_path ''`, gate identical to `set_relationship_role` (Super Admin / Vivacity team, or a full-scope primary/secondary contact of the tenant), validates the value against active `dd_position_type` rows (NULL clears), no-ops when unchanged;
  - EXECUTE revoked from `PUBLIC, anon` and granted to `authenticated, service_role` on both. No existing function is replaced, so there is no overload risk. Rollback SQL is in the file.
- `src/components/client/ClientUsersPage.tsx`, `src/components/client/users/UserPositionTypeCell.tsx`, `src/hooks/use-client-user-position-types.ts`: new "Position" column (dropdown for the people who manage portal users and are not in read-only preview, plain text for everyone else, a dash for invited rows).
- `src/integrations/supabase/types.ts`: the two new RPC signatures, added by hand in the generated format so the build typechecks before the next regeneration.

## Decisions
- Left `get_client_tenant_users` alone and added a separate small read RPC. Adding a column to its `RETURNS TABLE` needs `DROP FUNCTION` + `CREATE`, and the function feeds the invite and academy flows too.
- `sort_order` 7 (after Trainer/Assessor) rather than next to Administration, so no existing option's order changes.

## Open questions parked
- Order of operations: apply the migration to production **before** merging the PR. Until then the Position column's read RPC does not exist, so the column would show dashes and edits would fail with an error toast. Applying the migration first is harmless to the current frontend.
- `director` and `previous_user` exist in production without a migration. Worth a small catch-up migration so a rebuilt environment matches.
- `AcademyTenantUsersPanel` is a separate Academy-scoped copy of the roster table (its own comment says so). It does not get the Position column from this change.
