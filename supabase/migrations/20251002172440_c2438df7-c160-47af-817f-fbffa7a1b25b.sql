-- Create function for Super Admins to fetch all users with tenant names
CREATE OR REPLACE FUNCTION public.get_all_users_with_tenants()
RETURNS TABLE(
  user_uuid uuid,
  first_name text,
  last_name text,
  email text,
  user_type text,
  unicorn_role text,
  tenant_id uuid,
  tenant_name text,
  disabled boolean,
  archived boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only Super Admins can access this function
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied. Super Admin role required.';
  END IF;

  RETURN QUERY
  SELECT 
    u.user_uuid,
    u.first_name,
    u.last_name,
    u.email,
    u.user_type::text,
    u.unicorn_role::text,
    u.tenant_id,
    t.name as tenant_name,
    u.disabled,
    u.archived
  FROM public.users u
  LEFT JOIN public.tenants t ON t.id = u.tenant_id
  ORDER BY u.first_name ASC;
END;
$function$;