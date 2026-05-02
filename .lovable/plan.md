# Relationship Role UI — Phase 3 Plan (revised)

Backend is locked and self-defending: `tenant_user_role` enum + `relationship_role` columns shipped, `invite-user` accepts the new field and returns 409 `PRIMARY_EXISTS`, and partial unique indexes `uniq_tenant_one_primary_contact` / `uniq_tenant_one_secondary_contact` enforce one-of-each per tenant at the DB level. Front end now wires up to read/write the new field while keeping the legacy `role` + `primary_contact` columns in sync (read-after-write back-compat).

## 1. Shared helper (new file)

**`src/lib/roles/relationshipRole.ts`** exports:
- `RelationshipRole` type (`'primary_contact' | 'secondary_contact' | 'user' | 'academy_user'`)
- `RELATIONSHIP_ROLE_OPTIONS` — 4 entries with `value` / `label` / `description`
- `relationshipRoleLabel(rr)` → display string (`'—'` for null/undefined)
- `unicornRoleFromRelationship(rr)` → `'Admin' | 'User'` (primary/secondary → Admin; user/academy_user → User)
- `userTypeFromRelationship(rr)` → `'Client Parent' | 'Client Child'` (matches `accept_invitation_v2` mapping)
- `legacyTenantUserPatch(rr)` — **secondary_contact boolean intentionally not written**:
  ```ts
  export function legacyTenantUserPatch(rr: RelationshipRole):
    { role: 'parent' | 'child'; primary_contact: boolean } {
    if (rr === 'primary_contact')   return { role: 'parent', primary_contact: true };
    if (rr === 'secondary_contact') return { role: 'parent', primary_contact: false };
    return { role: 'child', primary_contact: false };
  }
  ```
- `EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` and `isValidEmail(s)`
- `isUniqueViolation(err)` — returns true when the Supabase error has `code === '23505'` (used by callers to surface the concurrent-change toast)

All UI imports from this file. No duplicated mapping logic.

## 2. BulkInvite (`src/pages/admin/BulkInvite.tsx`)

- **Suggested-contact query (line ~148):** change `.eq("primary_contact", true)` → `.eq("relationship_role", "primary_contact")`. Pull `relationship_role` into the select, store on `LaunchRow`, and render the Role column via `relationshipRoleLabel(...)` instead of the user's `unicorn_role`.
- **Override modal (lines ~580-700):** replace the 2-option role `<Select>` with the 4 `RELATIONSHIP_ROLE_OPTIONS`. Update `Override` type to carry `relationship_role: RelationshipRole`. Replace the tenant-users browse query (line ~595) to select `relationship_role` instead of `primary_contact` and use it for the badge.
- **Email validation:** in the override save, reject when `!isValidEmail(email)` with an inline field error.
- **Send payload:** add `relationship_role` to the `invite-user` body; derive `unicorn_role` via `unicornRoleFromRelationship` so the legacy contract stays satisfied.
- **409 handling in send loop:** when invoke returns/throws status 409 / body `code === "PRIMARY_EXISTS"`, mark that row as `failed`, surface server `detail` in a toast (non-blocking — keep iterating other rows).

## 3. ManageInvites (`src/pages/ManageInvites.tsx`)

- Select `relationship_role` from `user_invitations`.
- Role column: `relationshipRoleLabel(invitation.relationship_role)` when present; fall back to legacy mapping (`Admin → Primary Contact`, `User → User`) when null.

## 4. Tenant detail Users tab (`src/components/client/TenantUsersTab.tsx`)

- Add `relationship_role` to `TenantMemberInfo` and to the `fetchMembers` select.
- Replace `getRoleLabel` / `getMemberRoleValue` / `buildRolePatch` with the new helper. Dropdown options become `RELATIONSHIP_ROLE_OPTIONS` (4 items, including Academy User).
- `handleRoleChange` and `handleSaveEdit` write **`relationship_role` directly** plus `legacyTenantUserPatch(...)` in the same UPDATE on `tenant_users`. Do **not** write `secondary_contact` — the relationship_role column is the source of truth for secondary status. Then update `users.unicorn_role` (via `unicornRoleFromRelationship`) and `users.user_type` (via `userTypeFromRelationship`) for that user.
- **Single-primary swap (client-side):** before promoting to `primary_contact`, scan `members` for an existing primary with a different `user_id`. If found, open a confirm modal naming that user (e.g. *"Tenant already has a primary contact (Hamid Iskeirjeh). Demote them to secondary and promote this user to primary. Continue?"*). On confirm, run BOTH UPDATEs via `Promise.all` (demote existing → secondary_contact + legacy patch + users mapping; promote target → primary_contact + legacy patch + users mapping).
- **23505 handling (applies to swap path AND direct `handleRoleChange`):** wrap `relationship_role` UPDATEs in try/catch. When `isUniqueViolation(err)` is true (Postgres `23505` from `uniq_tenant_one_primary_contact` / `uniq_tenant_one_secondary_contact`), show toast: *"Couldn't change role — another change happened concurrently. Please refresh and try again."* and call `fetchMembers()` to resync. Other errors → existing generic error toast.
- Success toast: `Role changed: <Old Label> → <New Label>`.

## 5. InviteUser dialogs

Two dialogs use this flow; update both:
- `src/components/InviteUserDialog.tsx` (tenant-scoped)
- `src/components/AdminInviteUserDialog.tsx` (SuperAdmin variant, if it exposes a role picker)

Changes:
- Replace role dropdown with `RELATIONSHIP_ROLE_OPTIONS`.
- Fetch existing tenant primary (`relationship_role = 'primary_contact'`); if one exists, disable the "Primary Contact" option with helper text: *"This organisation already has a primary contact. Demote them first to invite a new one."* (Apply the same disable for "Secondary Contact" if a secondary already exists, since the DB unique index will reject a duplicate.)
- Email validation via `isValidEmail` before submit.
- Submit payload includes `relationship_role`; derive `unicorn_role` via helper.
- Catch 409 `PRIMARY_EXISTS` → toast server `detail`.

## 6. Suggested-contact migration sweep

Replace `tenant_users.primary_contact = true` reads with `relationship_role = 'primary_contact'`:
- `src/lib/notifyClient.ts:28`
- `src/hooks/useTenantContacts.ts:40`
- `src/hooks/useClientActingUser.ts:76`
- `src/pages/TenantDetail.tsx:429`
- `src/pages/ClientDetail.tsx:176`

Out of scope: `useClientManagement.tsx` and `ManageTenants.tsx` references — those are `tenant_profiles.primary_contact_name/email/phone` (different column).

Legacy `tenant_users.primary_contact` boolean stays (drop is post-launch). Legacy `tenant_users.secondary_contact` boolean stays untouched and is no longer written by the UI.

## 7. Verification (after build)

Via Supabase read tool:
1. `SELECT COUNT(DISTINCT tu.tenant_id) FROM tenant_users tu JOIN package_instances pi ON pi.tenant_id = tu.tenant_id JOIN packages p ON p.id = pi.package_id WHERE tu.relationship_role='primary_contact' AND pi.is_active AND p.package_type='membership';` — expect 55.
2. Adelaide Aviation (`tenant_id=7535`): Hamid=primary_contact, Sherman=user, Isla=user.
3. UI: invite Secondary Contact in Adelaide Aviation → `user_invitations.relationship_role='secondary_contact'`, `unicorn_role='Admin'`.
4. UI: try to invite Primary Contact while Hamid is primary → dialog disables option; if forced via BulkInvite override, server returns 409 and toast shows the message.
5. UI: simulate concurrent primary swap (two tabs) → second commit yields the "concurrent change" toast and refetches.

## Out of scope (TODO comments only)
- Academy User RLS (Monday).
- Dropping legacy columns.
- `users.unicorn_role`-driven RLS refactor — mark `// TODO(rel-role-phase-4)` where the dual-write to `users.unicorn_role` / `user_type` lives.

## Files touched

New: `src/lib/roles/relationshipRole.ts`
Edited: `src/pages/admin/BulkInvite.tsx`, `src/pages/ManageInvites.tsx`, `src/components/client/TenantUsersTab.tsx`, `src/components/InviteUserDialog.tsx`, `src/components/AdminInviteUserDialog.tsx`, `src/lib/notifyClient.ts`, `src/hooks/useTenantContacts.ts`, `src/hooks/useClientActingUser.ts`, `src/pages/TenantDetail.tsx`, `src/pages/ClientDetail.tsx`
