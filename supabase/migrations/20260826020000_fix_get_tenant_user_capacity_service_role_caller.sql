-- ============================================================
-- Fix get_tenant_user_capacity for service-role callers
-- ============================================================
-- invite-user (and any other edge function) calls this RPC through a
-- service-role Supabase client, so auth.uid() is NULL server-side —
-- has_tenant_access_safe(p_tenant_id, NULL) always fails, so
-- assertCapacity() in invite-user has been raising CAPACITY_CHECK_FAILED
-- (a 500) for every non-staff (real client Admin) caller, always. Staff
-- callers never hit this because isVivacityStaff/isSuperAdmin short-
-- circuit assertCapacity() entirely — that's why this went unnoticed.
--
-- Fix: accept an optional p_caller_id, defaulting to auth.uid() so the
-- existing browser-side call (src/hooks/useUserCapacity.ts, which does
-- carry a real user JWT) is unaffected; invite-user is updated in the
-- same change to pass its already-verified callerUser.user.id explicitly.
--
-- Arity change (bigint) -> (bigint, uuid) requires DROP FUNCTION first —
-- CREATE OR REPLACE alone would silently create a second overload.

DROP FUNCTION IF EXISTS public.get_tenant_user_capacity(bigint);

CREATE OR REPLACE FUNCTION public.get_tenant_user_capacity(
  p_tenant_id bigint,
  p_caller_id uuid DEFAULT NULL
)
RETURNS TABLE(used integer, "limit" integer, is_unlimited boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := COALESCE(p_caller_id, auth.uid());
BEGIN
  IF NOT public.has_tenant_access_safe(p_tenant_id, v_caller) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
  END IF;

  RETURN QUERY
  WITH tu AS (
    SELECT COUNT(*)::int AS n
    FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND (relationship_role IS NULL
           OR relationship_role NOT IN ('primary_contact','secondary_contact'))
  ),
  inv AS (
    SELECT COUNT(*)::int AS n
    FROM public.user_invitations
    WHERE tenant_id = p_tenant_id
      AND status IN ('pending','sent')
      AND expires_at > now()
      AND (relationship_role IS NULL
           OR relationship_role NOT IN ('primary_contact','secondary_contact'))
  ),
  pkg AS (
    SELECT
      MAX(p.user_limit)                       AS max_limit,
      bool_or(p.user_limit IS NULL)           AS has_unlimited,
      bool_or(pi.is_unlimited_override)       AS has_override,
      COUNT(*)                                AS active_count
    FROM public.package_instances pi
    JOIN public.packages p ON p.id = pi.package_id
    WHERE pi.tenant_id          = p_tenant_id
      AND pi.is_complete        = false
      AND pi.parent_instance_id IS NULL
  )
  SELECT
    (tu.n + inv.n)::int AS used,
    CASE
      WHEN pkg.active_count = 0 THEN 5
      WHEN pkg.has_override     THEN NULL
      WHEN pkg.has_unlimited    THEN NULL
      ELSE pkg.max_limit
    END::int AS "limit",
    CASE
      WHEN pkg.active_count = 0 THEN false
      ELSE COALESCE(pkg.has_override, false) OR COALESCE(pkg.has_unlimited, false)
    END AS is_unlimited
  FROM tu, inv, pkg;
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- ROLLBACK SQL — run in order if migration must be reversed
-- ─────────────────────────────────────────────────────────────
/*
DROP FUNCTION IF EXISTS public.get_tenant_user_capacity(bigint, uuid);

CREATE OR REPLACE FUNCTION public.get_tenant_user_capacity(p_tenant_id bigint)
RETURNS TABLE(used integer, "limit" integer, is_unlimited boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.has_tenant_access_safe(p_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
  END IF;
  RETURN QUERY
  WITH tu AS (
    SELECT COUNT(*)::int AS n FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND (relationship_role IS NULL OR relationship_role NOT IN ('primary_contact','secondary_contact'))
  ),
  inv AS (
    SELECT COUNT(*)::int AS n FROM public.user_invitations
    WHERE tenant_id = p_tenant_id AND status IN ('pending','sent') AND expires_at > now()
      AND (relationship_role IS NULL OR relationship_role NOT IN ('primary_contact','secondary_contact'))
  ),
  pkg AS (
    SELECT MAX(p.user_limit) AS max_limit, bool_or(p.user_limit IS NULL) AS has_unlimited,
      bool_or(pi.is_unlimited_override) AS has_override, COUNT(*) AS active_count
    FROM public.package_instances pi JOIN public.packages p ON p.id = pi.package_id
    WHERE pi.tenant_id = p_tenant_id AND pi.is_complete = false AND pi.parent_instance_id IS NULL
  )
  SELECT (tu.n + inv.n)::int AS used,
    CASE WHEN pkg.active_count = 0 THEN 5 WHEN pkg.has_override THEN NULL WHEN pkg.has_unlimited THEN NULL ELSE pkg.max_limit END::int AS "limit",
    CASE WHEN pkg.active_count = 0 THEN false ELSE COALESCE(pkg.has_override, false) OR COALESCE(pkg.has_unlimited, false) END AS is_unlimited
  FROM tu, inv, pkg;
END;
$function$;
*/
