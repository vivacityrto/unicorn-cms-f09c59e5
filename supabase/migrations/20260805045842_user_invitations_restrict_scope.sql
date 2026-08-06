-- RESTRICTIVE backstop on user_invitations.
-- Mirrors oauth_tokens_restrict_owner_or_superadmin /
-- cohort_send_jobs_restrict_admin_cohort_send: permissive policies still
-- grant access, but this policy AND-denies anyone outside superadmin,
-- vivacity team, tenant admin (own tenant), or the invited email (USING only).
--
-- WITH CHECK deliberately omits the email match so invitees cannot mutate
-- rows via PostgREST; acceptance remains on accept_invitation_v2
-- (SECURITY DEFINER). Invitees retain SELECT via the USING email clause.
--
-- BUG (2026-08-06, fixed same day in
-- 20260806070000_fix_user_invitations_restrict_scope_auth_users_permission.sql):
-- the auth.users fallback below runs as a plain RLS clause (not a
-- SECURITY DEFINER helper like the other three checks), and authenticated
-- has no grant on auth.users. Because this policy is FOR ALL, that
-- reference broke every query against this table for every caller —
-- see docs/audit-log/entries/2026-08-06-user-invitations-restrictive-policy-outage.md.
-- Left as-is below for historical accuracy; the superseding migration is
-- what's actually live.

BEGIN;

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_invitations_restrict_scope ON public.user_invitations;

CREATE POLICY user_invitations_restrict_scope
ON public.user_invitations AS RESTRICTIVE FOR ALL TO authenticated
USING (
  is_super_admin_safe((select auth.uid()))
  OR has_tenant_admin_safe(tenant_id, (select auth.uid()))
  OR is_vivacity_team_safe((select auth.uid()))
  OR (lower(email) = lower(coalesce((auth.jwt() ->> 'email'), (
        select u.email from auth.users u where u.id = auth.uid()
      ))))
)
WITH CHECK (
  is_super_admin_safe((select auth.uid()))
  OR has_tenant_admin_safe(tenant_id, (select auth.uid()))
  OR is_vivacity_team_safe((select auth.uid()))
);

NOTIFY pgrst, 'reload schema';

COMMIT;
