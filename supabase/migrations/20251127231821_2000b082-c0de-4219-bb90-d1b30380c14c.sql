
-- Fix the function to properly cast enum types to text
CREATE OR REPLACE FUNCTION public.get_valid_vivacity_users()
RETURNS TABLE (
  user_uuid uuid,
  first_name text,
  last_name text,
  email text,
  user_type text,
  unicorn_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    u.user_uuid,
    u.first_name,
    u.last_name,
    u.email,
    u.user_type::text,
    u.unicorn_role::text
  FROM public.users u
  INNER JOIN auth.users a ON u.user_uuid = a.id
  WHERE u.user_type::text = 'Vivacity Team'
  ORDER BY u.first_name;
$$;
