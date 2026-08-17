-- eos_user_roles.role was converted from eos_role to text in March 2026.
-- Client-viewer RLS policies still invoke this enum overload, so the helper
-- must cast its enum argument before comparing it to the text column.
CREATE OR REPLACE FUNCTION public.has_eos_role(
  _user_id uuid,
  _tenant_id bigint,
  _role public.eos_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.eos_user_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role = _role::text
  )
$$;

REVOKE ALL ON FUNCTION public.has_eos_role(uuid, bigint, public.eos_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_eos_role(uuid, bigint, public.eos_role) TO authenticated, service_role;
