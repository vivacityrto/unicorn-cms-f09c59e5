-- Narrow users_update_staff: broad Vivacity-team UPDATE on public.users is NOT an
-- intended workflow. App paths already gate colleague profile edits to
-- admin.team_users.manage (full) — update-user-profile edge function, TeamProfileFields,
-- ManageUsers copy ("Only Super Admins can edit user profiles"). Contact fields were
-- already locked to the same gate (20260715051333). Self-service remains via
-- users_update_own; Super Admins also retain users_manage_superadmin (FOR ALL).
-- Replaces is_vivacity_team_safe with check_permission so regular staff cannot
-- rewrite colleague non-contact fields via direct authenticated PostgREST UPDATE.

BEGIN;

DROP POLICY IF EXISTS "users_update_staff" ON public.users;

CREATE POLICY "users_update_admin_only"
ON public.users
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (check_permission((SELECT auth.uid()), 'admin.team_users.manage', 'full'))
WITH CHECK (check_permission((SELECT auth.uid()), 'admin.team_users.manage', 'full'));

NOTIFY pgrst, 'reload schema';

COMMIT;
