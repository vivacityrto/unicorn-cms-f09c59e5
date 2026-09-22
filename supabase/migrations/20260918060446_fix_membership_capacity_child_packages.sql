-- The capacity contract is based on active membership entitlements, not only
-- root package instances. A membership can be attached to a regulatory root
-- as an add-on (for example EduCareer's active M-SAR is attached to KS-RTO),
-- and that membership's user_limit must still govern user capacity.
--
-- Seats are occupied by active tenant_members. tenant_users is a legacy
-- relationship projection and can retain rows after a membership is marked
-- inactive; counting it directly permanently consumes those seats.
CREATE OR REPLACE FUNCTION public.get_tenant_user_capacity(p_tenant_id bigint)
 RETURNS TABLE(used integer, "limit" integer, is_unlimited boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF NOT public.has_tenant_access_safe(p_tenant_id, v_caller) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
  END IF;

  RETURN QUERY
  WITH tu AS (
    SELECT COUNT(*)::int AS n
    FROM public.tenant_users tu_row
    WHERE tu_row.tenant_id = p_tenant_id
      AND (tu_row.relationship_role IS NULL
           OR tu_row.relationship_role NOT IN ('primary_contact','secondary_contact'))
      AND EXISTS (
        SELECT 1
        FROM public.tenant_members tm
        WHERE tm.tenant_id = tu_row.tenant_id
          AND tm.user_id = tu_row.user_id
          AND tm.status = 'active'
      )
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
    WHERE pi.tenant_id = p_tenant_id
      AND pi.is_complete = false
      AND (
        pi.parent_instance_id IS NULL
        OR p.package_type = 'membership'
      )
  )
  SELECT
    (tu.n + inv.n)::int AS used,
    CASE
      WHEN pkg.active_count = 0 THEN 5
      WHEN pkg.has_override THEN NULL
      WHEN pkg.has_unlimited THEN NULL
      ELSE pkg.max_limit
    END::int AS "limit",
    CASE
      WHEN pkg.active_count = 0 THEN false
      ELSE COALESCE(pkg.has_override, false) OR COALESCE(pkg.has_unlimited, false)
    END AS is_unlimited
  FROM tu, inv, pkg;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_user_capacity(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_user_capacity(bigint) TO authenticated;
