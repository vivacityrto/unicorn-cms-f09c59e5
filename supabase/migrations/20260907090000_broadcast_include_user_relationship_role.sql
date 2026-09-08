-- Include normal client users in broadcast targeting.
--
-- Legacy parent contacts use tenant_users.role = 'parent'. Normal client
-- users use tenant_users.role = 'child' and relationship_role = 'user'. Keep
-- matching the legacy role column for backwards compatibility with existing
-- campaign rows, while also accepting relationship-role values supplied by
-- the current broadcast UI. academy_user remains excluded because the UI
-- sends ['parent', 'user'] and the RPC still requires access_scope = 'full'.

CREATE OR REPLACE FUNCTION public.fn_preview_broadcast_recipients(
  p_target_mode text,
  p_package_type text DEFAULT NULL,
  p_include_roles text[] DEFAULT ARRAY['parent']
)
RETURNS TABLE(tenant_id bigint, user_id uuid, tenant_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Vivacity staff access required';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (tu.user_id)
    t.id AS tenant_id,
    tu.user_id,
    t.name AS tenant_name
  FROM public.tenants t
  JOIN public.tenant_users tu ON tu.tenant_id = t.id
  WHERE
    t.id != 6372
    AND t.status = 'active'
    AND (
      tu.role = ANY(p_include_roles)
      OR tu.relationship_role = ANY(p_include_roles)
    )
    AND tu.access_scope = 'full'
    AND (
      CASE p_target_mode
        WHEN 'everyone' THEN true
        WHEN 'members' THEN EXISTS (
          SELECT 1
          FROM public.package_instances pi
          JOIN public.packages p ON p.id = pi.package_id
          WHERE pi.tenant_id = t.id
            AND pi.is_complete = false
            AND p.package_type = 'membership'
        )
        WHEN 'tier' THEN EXISTS (
          SELECT 1
          FROM public.package_instances pi
          JOIN public.packages p ON p.id = pi.package_id
          WHERE pi.tenant_id = t.id
            AND pi.is_complete = false
            AND p.package_type = 'membership'
            AND lower(p.name) LIKE
              CASE lower(coalesce(p_package_type, ''))
                WHEN 'diamond'  THEN 'm-d%'
                WHEN 'gold'     THEN 'm-g%'
                WHEN 'ruby'     THEN 'm-r%'
                WHEN 'sapphire' THEN 'm-sa%'
                WHEN 'amethyst' THEN 'm-am%'
                ELSE '__no_match__'
              END
        )
        WHEN 'package_type' THEN EXISTS (
          SELECT 1
          FROM public.package_instances pi
          JOIN public.packages p ON p.id = pi.package_id
          WHERE pi.tenant_id = t.id
            AND pi.is_complete = false
            AND p.package_type = p_package_type
        )
        ELSE false
      END
    )
  ORDER BY tu.user_id, t.id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_preview_broadcast_recipients(text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_preview_broadcast_recipients(text, text, text[]) TO authenticated;

