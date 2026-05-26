CREATE OR REPLACE FUNCTION public.is_ghost_user(p_user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE user_uuid = p_user_uuid)
     AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_uuid);
$$;

REVOKE ALL ON FUNCTION public.is_ghost_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ghost_user(uuid) TO authenticated;