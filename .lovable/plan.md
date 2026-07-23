Apply the redesigned PR #31 RLS backstop for `public.users` updates.

## What we know
- The original migration file `supabase/migrations/20260718072919_users_update_admin_only.sql` is still in the working tree but was never applied (no `schema_migrations` record). It would have replaced the broad `users_update_staff` PERMISSIVE policy with an admin-only policy and broken three real, currently-working authenticated-client flows:
  1. `src/pages/TeamUsers.tsx` — CSC toggle updates only `is_csc`.
  2. `src/pages/admin/StaffEngagementDetail.tsx` — offboarding revoke updates only `disabled`.
  3. `src/components/client/TenantUsersTab.tsx` — client user edit updates only `job_title` and `phone`.
- Current live policy set still has `users_update_staff` as PERMISSIVE using `is_vivacity_team_safe(...)`, so any Vivacity team member can currently UPDATE any user row.
- The helper function `user_staff_safe_fields_only_changed` does not yet exist.

## What the redesigned migration does
- Creates `public.user_staff_safe_fields_only_changed(p_new_row public.users)` (SECURITY DEFINER, pinned `search_path = ''`) that returns true when only the safe fields (`is_csc`, `disabled`, `job_title`, `phone`, `updated_at`, `full_name`) differ from the existing row.
- Revokes PUBLIC access to that function and grants EXECUTE to `authenticated`.
- Drops the old restrictive policy name and creates a new RESTRICTIVE policy `users_staff_edit_scope_restrict` on `public.users` FOR UPDATE to authenticated:
  - Allows self-edits (`user_uuid = auth.uid()`).
  - Allows Super Admins (`is_super_admin_safe`).
  - Allows users with `admin.team_users.manage` at `full` level.
  - Allows the update if it only changes the safe staff fields (the three preserved flows).
- Leaves the existing `users_update_staff` PERMISSIVE policy in place; the RESTRICTIVE policy narrows what it can actually permit.
- Notifies PostgREST to reload the schema.

## Steps
1. Delete the orphan file `supabase/migrations/20260718072919_users_update_admin_only.sql` so it cannot be accidentally applied later.
2. Submit the redesigned SQL via `supabase--migration` under a fresh `20260723...` timestamp.
3. After the migration executes, confirm via a read query that:
   - `user_staff_safe_fields_only_changed(public.users)` exists with the correct signature.
   - The `users_staff_edit_scope_restrict` RESTRICTIVE UPDATE policy exists on `public.users`.
   - The original `users_update_staff` PERMISSIVE policy remains.

## Out of scope
- No frontend code changes are required; the three preserved flows already update only safe fields.
- No additional security findings will be touched unless explicitly requested.

## Risks / rollback
- Risk: a fourth unknown authenticated-client UPDATE path on `public.users` that mutates non-safe fields will start failing for non-admin Vivacity staff. This is the intended hardening effect.
- Rollback: drop the new RESTRICTIVE policy and function; the PERMISSIVE `users_update_staff` policy will then again allow the broad updates.