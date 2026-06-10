# Plan

Two scoped UI changes. No DB or edge-function changes. `superadmin_level` stays in all queries — only hidden in the UI. `update-user-role` already accepts `Integrator | BGT | CSC | CET` and derives `superadmin_level` internally.

## 1. `src/pages/TeamUsers.tsx` — remove Level column

- Delete `SUPERADMIN_LEVELS` constant (lines 51–57).
- Delete `levelFilter` state (line 67) and remove `levelFilter` from the `applyFilters` `useEffect` dep array (line 79).
- Delete the Level filter block in `applyFilters` (lines 195–198).
- Delete the `getLevelBadge` helper (lines 317–330).
- Delete the Level `<Select>` filter UI in the filters card (lines 436–447).
- Delete `<TableHead>Level</TableHead>` (line 473).
- Delete `<TableCell>{getLevelBadge(user.superadmin_level)}</TableCell>` (line 546).
- Change empty-state `colSpan={8}` → `colSpan={7}` (line 482).
- Leave `superadmin_level` in the Supabase `.select(...)` and in both user object mappings untouched.

## 2. `src/components/profile/AdminActions.tsx` — split Role Type by user category

Replace the existing single Role Type dropdown (currently lines 477–622, gated on `isSuperAdmin`) with a branch keyed off `user.user_type`:

### Internal staff branch — `user.user_type ∈ { 'Vivacity', 'Vivacity Team' }`
- New `unicornRole` state initialised from `user.unicorn_role`.
- `<Select>` with exactly these options (defined as a local `INTERNAL_ROLES` const): `Super Admin`, `Team Leader`, `Integrator`, `BGT`, `CSC`, `CET`. No `Team Member`.
- Keep the existing Teams multi-checkbox block (`STAFF_TEAM_OPTIONS`).
- Do **not** render the tenant assignment block.
- Validation: Save disabled until `unicornRole` is non-empty.
- Save: `supabase.functions.invoke('update-user-role', { body: { user_uuid, unicorn_role: unicornRole, user_type: user.user_type, staff_team: primaryTeam, staff_teams: selectedStaffTeams } })` — `tenant_id` omitted.
- `hasChanges`: `unicornRole !== user.unicorn_role || teams diff`.
- Confirmation summary: `Role: <user.unicorn_role> → <unicornRole>` plus teams diff if changed.

### Client branch — `user.user_type ∈ { 'Client Parent', 'Client Child', 'Client', 'Member' }`
- Keep the existing `ROLE_TYPES`-based `<Select>` filtered to `category === 'tenant'` (Tenant - Parent / Tenant - Child).
- Keep the Tenant Assignment dropdown and the `needsTenant` validation exactly as today.
- Do **not** render the Teams block.
- Save: existing path using `roleTypeToDbFields(roleType)` + `tenant_id`. `staff_team` / `staff_teams` sent as `null` / `[]`.
- `hasChanges`: `roleType !== originalRoleType || selectedTenantId !== original`.
- Confirmation summary: existing role-label diff + tenant diff.

### Shared
- Gating on `isSuperAdmin` is unchanged (only SuperAdmins see Role Type section at all; client admins still see only password/status sections).
- `deriveRoleType`, `roleTypeToDbFields`, `ROLE_TYPES` retained — referenced only by the client branch.
- `fetchTenants` only needs to run when client branch is active; safe to keep the existing `isSuperAdmin`-gated fetch (it's cheap and harmless).

## Files touched
- `src/pages/TeamUsers.tsx`
- `src/components/profile/AdminActions.tsx`
