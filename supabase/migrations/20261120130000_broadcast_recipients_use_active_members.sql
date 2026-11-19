-- Broadcast recipients are active members of the organisation (tenant_members, the canonical gate, ADR-019).
-- Replaces public.fn_resolve_broadcast_recipients only (same signature, same columns, same attributes). It feeds the
-- audience preview, queueing and the scheduled delivery function, so all three change together. No row is changed.
--
-- Before: recipients were read from the legacy tenant_users table, targeted by role / relationship role and access scope,
-- with no check that the person is an active member. Active members who had no tenant_users row were never reached.
--
-- After:
--   * a recipient must be an ACTIVE member of the organisation in tenant_members;
--   * targeting is unchanged for people who have a tenant_users row (role or relationship role in the chosen roles, and
--     full access scope);
--   * an active member who has NO tenant_users row is treated as an ordinary client user (relationship role "user",
--     full access), so they are reached when the chosen roles include "user", and not when only "parent" is chosen.
-- Measured in production before writing: 4 real active members in active organisations had no tenant_users row.

CREATE OR REPLACE FUNCTION public.fn_resolve_broadcast_recipients(p_target_mode text, p_package_type text, p_include_roles text[])
RETURNS TABLE(tenant_id bigint, user_id uuid, tenant_name text)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  WITH people AS (
    SELECT tu.tenant_id, tu.user_id, tu.role::text AS role, tu.relationship_role::text AS relationship_role, tu.access_scope::text AS access_scope
    FROM public.tenant_users tu
    UNION ALL
    SELECT tm.tenant_id, tm.user_id, 'child', 'user', 'full'
    FROM public.tenant_members tm
    JOIN public.users u ON u.user_uuid = tm.user_id
    WHERE tm.status = 'active'
      -- Only people who can actually sign in, so they do not show up as failed recipients (the legacy rows keep
      -- their existing behaviour: delivery marks a recipient without a sign-in account as failed).
      AND NOT coalesce(u.archived, false)
      AND NOT coalesce(u.disabled, false)
      AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = tm.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.tenant_id = tm.tenant_id AND tu.user_id = tm.user_id
      )
  )
  SELECT DISTINCT ON (p.user_id)
    t.id AS tenant_id,
    p.user_id,
    t.name AS tenant_name
  FROM public.tenants t
  JOIN people p ON p.tenant_id = t.id
  WHERE
    t.id != 6372
    AND t.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = t.id AND tm.user_id = p.user_id AND tm.status = 'active'
    )
    AND (
      p.role = ANY(p_include_roles)
      OR p.relationship_role = ANY(p_include_roles)
    )
    AND p.access_scope = 'full'
    AND (
      CASE p_target_mode
        WHEN 'everyone' THEN true
        WHEN 'members' THEN EXISTS (
          SELECT 1
          FROM public.package_instances pi
          JOIN public.packages pk ON pk.id = pi.package_id
          WHERE pi.tenant_id = t.id
            AND pi.is_complete = false
            AND pk.package_type = 'membership'
        )
        -- Same package IDs used by the Superhero Membership Dashboard.
        WHEN 'superhero' THEN EXISTS (
          SELECT 1 FROM public.package_instances pi
          WHERE pi.tenant_id = t.id AND pi.is_complete = false
            AND pi.package_id IN (29, 16, 3, 22, 39, 13, 5, 24, 40)
        )
        WHEN 'tier' THEN EXISTS (
          SELECT 1
          FROM public.package_instances pi
          JOIN public.packages pk ON pk.id = pi.package_id
          WHERE pi.tenant_id = t.id
            AND pi.is_complete = false
            AND pk.package_type = 'membership'
            AND lower(pk.name) LIKE
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
          JOIN public.packages pk ON pk.id = pi.package_id
          WHERE pi.tenant_id = t.id
            AND pi.is_complete = false
            AND pk.package_type = p_package_type
        )
        ELSE false
      END
    )
  ORDER BY p.user_id, t.id;
$function$;

-- Same access as before: only the other definer functions call this.
REVOKE ALL ON FUNCTION public.fn_resolve_broadcast_recipients(text, text, text[]) FROM PUBLIC, anon, authenticated;
