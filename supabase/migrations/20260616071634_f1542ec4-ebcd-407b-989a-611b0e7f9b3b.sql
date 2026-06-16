ALTER TABLE public.package_instances
  ADD COLUMN IF NOT EXISTS is_unlimited_override boolean NOT NULL DEFAULT false;

UPDATE public.package_instances
SET is_unlimited_override = true
WHERE id = (
  SELECT pi.id
  FROM public.package_instances pi
  JOIN public.packages p ON p.id = pi.package_id
  WHERE pi.tenant_id = 6372
    AND p.slug = '/package-m-am'
    AND pi.is_complete = false
  LIMIT 1
);

CREATE OR REPLACE FUNCTION public.get_tenant_user_capacity(p_tenant_id bigint)
 RETURNS TABLE(used integer, "limit" integer, is_unlimited boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;