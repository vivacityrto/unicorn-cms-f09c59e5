-- Restore RLS enforcement on views that currently run as the owner
-- (security_invoker default / false). Invoker mode makes SELECT respect
-- underlying table RLS for the querying role.
--
-- v_client_tenant_users is deliberately excluded from this migration.
-- It lateral-joins auth.sessions to compute last_active_at; setting
-- security_invoker=true switches the ordinary table-GRANT check to the
-- invoking role too (not just RLS), and authenticated/anon hold no grant
-- on auth.sessions. Verified live via a rolled-back transaction
-- (SET LOCAL ROLE authenticated) on 2026-08-06: fails with
-- "permission denied for table sessions" for every caller, including
-- superadmin — this would break the tenant team-roster tab
-- (use-client-tenant-users.ts / TenantUsersTab) outright, not just narrow
-- visibility. Needs the auth.sessions lookup wrapped in a SECURITY DEFINER
-- helper (matching the wrap_executive_strategic_views_in_rpc pattern)
-- before security_invoker can be applied to this view. Tracked as a
-- follow-up; the underlying security_definer_view advisor finding for
-- v_client_tenant_users remains open until that fix lands.
--
-- v_package_burndown and v_academy_lesson_outline were both verified safe
-- the same way (no permission or grant errors as `authenticated`).
--
-- Product check (anon on v_academy_lesson_outline): no unauthenticated caller
-- in this repo (all usages are behind ProtectedRoute / authenticated hooks;
-- create migration granted SELECT only to authenticated + service_role).
-- Leave GRANT SELECT TO anon commented. Uncomment only if a public catalogue
-- path is confirmed.

ALTER VIEW public.v_package_burndown SET (security_invoker = true);
ALTER VIEW public.v_academy_lesson_outline SET (security_invoker = true);

REVOKE ALL ON public.v_package_burndown FROM anon;
REVOKE ALL ON public.v_academy_lesson_outline FROM anon;

-- academy_lessons preview content may legitimately want anon read;
-- only re-grant SELECT here if that's a confirmed product requirement:
-- GRANT SELECT ON public.v_academy_lesson_outline TO anon;

COMMENT ON VIEW public.v_academy_lesson_outline IS
  'Structural outline over academy_lessons (published rows). security_invoker=true so SELECT respects academy_lessons RLS; sensitive columns remain on the base table.';

NOTIFY pgrst, 'reload schema';
