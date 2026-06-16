-- 1. Add user_limit column
ALTER TABLE public.packages ADD COLUMN user_limit integer NULL;
COMMENT ON COLUMN public.packages.user_limit IS 'Per-package user cap (excludes primary/secondary contacts). NULL = unlimited.';

-- 2. Seed baseline (5 users for everything)
UPDATE public.packages SET user_limit = 5;

-- 3. Tier overrides
UPDATE public.packages SET user_limit = 5    WHERE slug IN ('/package-m-gr','/package-m-gc');
UPDATE public.packages SET user_limit = 10   WHERE slug IN ('/package-m-rr','/package-m-rc');
UPDATE public.packages SET user_limit = 15   WHERE slug IN ('/package-m-sar','/package-m-sac');
UPDATE public.packages SET user_limit = NULL WHERE slug IN ('/package-m-dr','/package-m-dc');
UPDATE public.packages SET user_limit = 5    WHERE slug LIKE '/package-ks-%';

-- 4. Capacity RPC
CREATE OR REPLACE FUNCTION public.get_tenant_user_capacity(p_tenant_id bigint)
RETURNS TABLE(used integer, "limit" integer, is_unlimited boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
      MAX(p.user_limit)             AS max_limit,
      bool_or(p.user_limit IS NULL) AS has_unlimited,
      COUNT(*)                      AS active_count
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
      WHEN pkg.has_unlimited    THEN NULL
      ELSE pkg.max_limit
    END::int AS "limit",
    CASE
      WHEN pkg.active_count = 0 THEN false
      ELSE COALESCE(pkg.has_unlimited, false)
    END AS is_unlimited
  FROM tu, inv, pkg;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_user_capacity(bigint) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_tenant_user_capacity(bigint) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_tenant_user_capacity(bigint) TO service_role;