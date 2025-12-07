
-- Create function to get only valid Vivacity Team users (exist in both public.users and auth.users)
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
    u.user_type,
    u.unicorn_role
  FROM public.users u
  INNER JOIN auth.users a ON u.user_uuid = a.id
  WHERE u.user_type = 'Vivacity Team'
  ORDER BY u.first_name;
$$;
