-- URGENT FIX (2026-08-06): the 20260805045842_user_invitations_restrict_scope
-- RESTRICTIVE policy referenced auth.users directly in its email-match
-- fallback clause, evaluated under the caller's own (authenticated) role
-- since it's a plain RLS clause, not a SECURITY DEFINER helper like every
-- other check in the policy. authenticated has no grant on auth.users, and
-- because the policy is FOR ALL, Postgres relation-permission-checks every
-- referenced table for every query against user_invitations, including
-- plain SELECT — breaking ManageInvites.tsx / TenantUsersTab.tsx outright
-- for every caller (42501 "permission denied for table users"), not just
-- narrowing rows. The pre-existing permissive policy has the same
-- auth.users reference but is scoped to UPDATE only, so it was never
-- permission-checked on a SELECT — that's why this went unnoticed until
-- this policy (FOR ALL) landed.
--
-- Confirmed live via browser network inspection against /manage-invites:
-- 403, code 42501, "permission denied for table users". Reproduced,
-- fixed, and re-verified clean (zero console errors, real data loading)
-- against /manage-invites, the Client Detail Users tab, /admin/team-users,
-- and /admin/bulk-invite before this file was written.
--
-- Fix: drop the auth.users fallback, read email straight from the JWT
-- claim instead (no table access needed). Supabase Auth JWTs always carry
-- `email` for this app's users.

BEGIN;

DROP POLICY IF EXISTS user_invitations_restrict_scope ON public.user_invitations;

CREATE POLICY user_invitations_restrict_scope
ON public.user_invitations AS RESTRICTIVE FOR ALL TO authenticated
USING (
  is_super_admin_safe((select auth.uid()))
  OR has_tenant_admin_safe(tenant_id, (select auth.uid()))
  OR is_vivacity_team_safe((select auth.uid()))
  OR (lower(email) = lower(auth.jwt() ->> 'email'))
)
WITH CHECK (
  is_super_admin_safe((select auth.uid()))
  OR has_tenant_admin_safe(tenant_id, (select auth.uid()))
  OR is_vivacity_team_safe((select auth.uid()))
);

NOTIFY pgrst, 'reload schema';

COMMIT;
