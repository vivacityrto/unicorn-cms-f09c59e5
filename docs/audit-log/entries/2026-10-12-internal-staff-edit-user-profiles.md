# Audit: 2026-10-12 — internal-staff-edit-user-profiles

**Trigger:** ad-hoc (Carl asked for Integrators and BGT, then all internal Vivacity staff, to be able to edit a user's profile)
**Scope:** the `admin.team_users.manage` grant in `public.role_permissions`, the
`public.update_team_member_profile` RPC, and the profile page UI gates
(`UserProfile.tsx`, `TeamProfileFields.tsx`, `ProfileHeader.tsx`). Did not change the
`update-user-profile` Edge Function, `users-write-allowlist.ts`, or any RLS policy on
`public.users`. The production Supabase MCP connection available in the session pointed at a
different database, so nothing here was verified against live production — this entry reads
the repo's migrations only.

## Findings
- Profile editing of another user was Super Admin only at four independent layers: the UI
  (`canEditProfile` in `UserProfile.tsx`), the RPC `update_team_member_profile` (hard-coded
  `Super Admin` caller), the Edge Function / RLS path (gated on `check_permission(...,
  'admin.team_users.manage', 'full')`, which only Super Admin held), and avatar storage
  (own folder or Super Admin).
- Carl chose the literal option: grant `admin.team_users.manage` at `full` to all internal
  staff roles rather than introduce a narrower staff tier. The narrower alternative (a
  separate profile-edit permission) was offered twice, the second time after the account
  takeover and self-promotion paths below were identified, and was declined both times.
- That permission is far broader than profile editing, and in practice it is the app's
  "Super Admin equivalent" gate. Nineteen Edge Functions authorise on it
  (`grep -rl admin.team_users.manage supabase/functions --include=index.ts`). Every internal
  staff member now passes all of them, including:
  - `generate-recovery-link`: returns a working GoTrue recovery `action_link` for any user to
    the caller, so a holder can sign in as any account, Super Admin included.
  - `update-user-role`: writes with the service-role key and checks only this permission, so
    it bypasses `users_no_privilege_escalation`. A holder can set `unicorn_role` /
    `superadmin_level` / `tenant_id` on any user, including promoting themselves to Super
    Admin.
  - `delete-user`, `toggle-user-status` (disable/archive anyone, Super Admins included),
    `bulk-user-action`, `bulk-account-actions`, `invite-user`, `invite-or-reset-user`,
    `issue-token`, `send-password-reset`, `send-magic-link`, `send-enhanced-email`,
    `send-mailgun-template`, `import-clickup-csv`, `sync-clickup-tasks`,
    `staff-onboarding-workbook`, `send-staff-onboarding-email`, `generate-staff-checklist`.
  - Through `update-user-profile`: `user_type`, `email`, `archived`, `disabled`, `is_csc`,
    team fields. Through RLS and RPCs: personal contact reads
    (`get_user_private_contact`), `rpc_set_client_account_status`, and the
    `internal-onboarding` / `academy-thumbnails` storage policies.
- The database layer does **not** backstop the service-role functions above.
  `users_no_privilege_escalation` and `users_contact_fields_protected` only apply to
  `authenticated` writes (the `update-user-profile` path). `enforce_invitation_role_ceiling`
  checks `is_super_admin_safe()` directly, so internal-role invitations specifically remain
  Super Admin only.
- `20260818040717_fix_invitation_role_ceiling_service_role_bypass.sql` recorded that
  `admin.team_users.manage` was held at `full` by Super Admin only and relied on that as a
  premise. That premise no longer holds after this change.
- `update_team_member_profile` also rejected Integrator, BGT and CSC targets for everyone,
  including Super Admin (it only accepted `Super Admin` and `Team Member` targets). Fixed in
  the same migration.
- Avatar controls: avatar storage stays own-folder or Super Admin. With `canEdit` now true for
  non-Super-Admin staff on someone else's profile, the existing upload handler would have put
  the file in the uploader's own folder and written that path onto the viewed user's row.
  Avatar controls are therefore hidden unless the viewer is the profile owner or a Super Admin.
- Work email editing stays Super Admin only (`canEditWorkEmail` unchanged).

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- `supabase/migrations/20261012020000_grant_team_users_manage_to_internal_staff.sql`:
  idempotent upsert of `admin.team_users.manage = full` for Team Leader, Team Member,
  Integrator, BGT and CSC (skipping any role missing from `dd_unicorn_roles`); replaces
  `update_team_member_profile` with a permission-gated caller check and any Vivacity-type
  target. Same signature, no new overload. Not yet applied to production.
- `supabase/migration-safety-allowlist.json`: entry for the migration above, expires
  2026-11-11.
- `src/pages/UserProfile.tsx`: `canEditProfile` uses `usePermission('admin.team_users.manage',
  'full')` for Vivacity-type viewers instead of the Super Admin role check.
- `src/components/profile/TeamProfileFields.tsx`: new `canManageTeamUsers` prop so the
  admin RPC branch is reachable for permission holders.
- `src/components/profile/ProfileHeader.tsx`: avatar controls gated on self or Super Admin.

## Decisions
- Accepted the wider permission rather than a narrow tier, on Carl's explicit, informed
  choice. No compensating guard was added to `update-user-role`, `generate-recovery-link` or
  `delete-user`.
- The migration is not applied by this PR. Until it is applied, behaviour is unchanged for
  everyone except the profile page UI gate, which only widens what the page shows.

## Open questions parked
- Reversal: set the five `role_permissions` rows back to `none` (the original seed value) and
  the UI/RPC gates fall back to Super Admin only. The RPC definition can stay as is.
- If the reach proves too wide, the narrow tier is the fallback: a separate profile-edit
  permission, `user_staff_safe_fields_only_changed` widened to the profile columns, and a
  staff branch in `update-user-profile`.
- A small compensating guard needs no new permission: require `is_super_admin_safe` in
  `update-user-role` for `unicorn_role` / `superadmin_level` / `tenant_id`, and refuse
  Super Admin targets in `generate-recovery-link`, `delete-user` and `toggle-user-status`.
- Team Leader and Team Member are retired or transitional roles with no active holders; they
  were included only so the grant covers the canonical `VIVACITY_STAFF_ROLES` list.
