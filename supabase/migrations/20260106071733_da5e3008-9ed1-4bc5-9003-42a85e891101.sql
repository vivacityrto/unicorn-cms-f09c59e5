-- Update get_team_users to include job_title and disabled status for cover contact dropdown
DROP FUNCTION IF EXISTS public.get_team_users();

CREATE OR REPLACE FUNCTION public.get_team_users()
RETURNS TABLE (
  user_uuid uuid,
  first_name text,
  last_name text,
  email text,
  job_title text,
  superadmin_level text,
  is_csc boolean,
  avatar_url text,
  disabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only Team users (SuperAdmin or Team Member) can call this
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE public.users.user_uuid = auth.uid() 
    AND unicorn_role IN ('Super Admin', 'Team Member')
    AND user_type IN ('Vivacity', 'Vivacity Team')
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    u.user_uuid,
    u.first_name,
    u.last_name,
    u.email,
    u.job_title,
    u.superadmin_level,
    COALESCE(u.is_csc, false) as is_csc,
    u.avatar_url,
    u.disabled
  FROM public.users u
  WHERE u.unicorn_role IN ('Super Admin', 'Team Member')
  AND u.user_type IN ('Vivacity', 'Vivacity Team')
  AND u.archived = false
  ORDER BY u.first_name, u.last_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_users() TO authenticated;