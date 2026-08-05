-- Restore RLS enforcement on views that currently run as the owner
-- (security_invoker default / false). Invoker mode makes SELECT respect
-- underlying table RLS for the querying role.
--
-- Pre-prod: dry-run in BEGIN…ROLLBACK, then persona-check as non-super-admin
-- per references/audit-queries.sql that v_client_tenant_users and
-- v_package_burndown return only rows allowed by underlying tenant_users /
-- users / package_instances RLS — not cross-tenant rows.
--
-- Product check (anon on v_academy_lesson_outline): no unauthenticated caller
-- in this repo (all usages are behind ProtectedRoute / authenticated hooks;
-- create migration granted SELECT only to authenticated + service_role).
-- Leave GRANT SELECT TO anon commented. Uncomment only if a public catalogue
-- path is confirmed.

ALTER VIEW public.v_client_tenant_users SET (security_invoker = true);
ALTER VIEW public.v_package_burndown SET (security_invoker = true);
ALTER VIEW public.v_academy_lesson_outline SET (security_invoker = true);

REVOKE ALL ON public.v_client_tenant_users FROM anon;
REVOKE ALL ON public.v_package_burndown FROM anon;
REVOKE ALL ON public.v_academy_lesson_outline FROM anon;

-- academy_lessons preview content may legitimately want anon read;
-- only re-grant SELECT here if that's a confirmed product requirement:
-- GRANT SELECT ON public.v_academy_lesson_outline TO anon;

COMMENT ON VIEW public.v_academy_lesson_outline IS
  'Structural outline over academy_lessons (published rows). security_invoker=true so SELECT respects academy_lessons RLS; sensitive columns remain on the base table.';

NOTIFY pgrst, 'reload schema';
