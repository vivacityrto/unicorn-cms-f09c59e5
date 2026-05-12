CREATE OR REPLACE FUNCTION public.list_acting_user_options(p_tenant_id bigint)
RETURNS TABLE (
  user_uuid uuid,
  full_name text,
  email text,
  relationship_role text,
  is_default boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    u.user_uuid,
    COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
             u.email, 'Unnamed user') AS full_name,
    COALESCE(u.email, '') AS email,
    COALESCE(tu.relationship_role::text, 'user') AS relationship_role,
    (tu.primary_contact = true OR tu.relationship_role::text = 'primary_contact') AS is_default
  FROM public.tenant_users tu
  JOIN public.users u ON u.user_uuid = tu.user_id
  JOIN auth.users au ON au.id = u.user_uuid
  WHERE tu.tenant_id = p_tenant_id
    AND au.email_confirmed_at IS NOT NULL
    AND au.deleted_at IS NULL
    AND (au.banned_until IS NULL OR au.banned_until < now())
  ORDER BY is_default DESC, full_name ASC;
$$;

REVOKE ALL ON FUNCTION public.list_acting_user_options(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_acting_user_options(bigint) TO authenticated;