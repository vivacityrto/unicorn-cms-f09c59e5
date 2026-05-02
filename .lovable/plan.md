## Fix InviteUser role dropdown — branch on tenant_id

The `TenantInviteDialog` role dropdown currently shows `Admin` / `General User` for every tenant. The `invite-user` edge function rejects those values for Vivacity (tenant 6372) and never accepts the literal `General User` for any tenant — it only accepts `User`. This change makes the dropdown tenant-aware while keeping submitted values aligned with the function's allow-list.

### File to modify
- `src/components/client/TenantInviteDialog.tsx`

### Changes

1. Replace the static `TENANT_ROLES` constant with two role lists and a selector:
   ```ts
   const VIVACITY_TENANT_ID = 6372;

   const VIVACITY_ROLES = [
     { value: 'Super Admin',  label: 'Super Admin',  description: 'Full Vivacity admin access', icon: Shield },
     { value: 'Team Leader',  label: 'Team Leader',  description: 'Leads a Vivacity team',      icon: Shield },
     { value: 'Team Member',  label: 'Team Member',  description: 'Vivacity staff member',      icon: UserIcon },
   ];

   const CLIENT_ROLES = [
     { value: 'Admin', label: 'Admin',        description: 'Can manage users and settings', icon: Shield },
     { value: 'User',  label: 'General User', description: 'Standard access to features',   icon: UserIcon },
   ];

   const getRoleOptions = (tid: number) =>
     tid === VIVACITY_TENANT_ID ? VIVACITY_ROLES : CLIENT_ROLES;

   const getDefaultRole = (tid: number) =>
     tid === VIVACITY_TENANT_ID ? 'Team Member' : 'User';
   ```

2. Initialise `role` state from `getDefaultRole(tenantId)` instead of the hard-coded `'User'`.

3. Add a `useEffect` keyed on `[tenantId, open]` that, whenever the dialog opens or the tenant changes, resets `role` to `getDefaultRole(tenantId)`. This guarantees the default is correct even if the same dialog instance is reused across tenants.

4. In `handleClose`, reset `role` to `getDefaultRole(tenantId)` (not `'User'`).

5. In the `<Select>` block, iterate `getRoleOptions(tenantId)` instead of the removed `TENANT_ROLES`. The submitted value remains `r.value`, so:
   - `General User` (label) ⇒ `User` (value sent to edge function).
   - All Vivacity labels match their values verbatim.

No changes to `invite_as`, payload shape, or any other field — that branching was already added in the previous fix.

### Acceptance checks (manual, after deploy)
1. Open dialog on tenant 6372 — options are Super Admin / Team Leader / Team Member; default Team Member.
2. Open dialog on any client tenant — options are Admin / General User; default General User.
3. Submit Vivacity invite with Team Member ⇒ `invite-user` returns 200; `user_invitations` row has `unicorn_role = 'Team Member'`.
4. Submit client invite with General User ⇒ `invite-user` returns 200; row has `unicorn_role = 'User'`.

### Out of scope
- No edge-function changes.
- No DB migration.
- No changes to seat-limit logic, smart-paste, or any other dialog behaviour.
