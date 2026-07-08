CREATE OR REPLACE FUNCTION public.profiles_block_self_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.global_role IS DISTINCT FROM OLD.global_role)
     AND NOT public.is_super_admin_safe(auth.uid())
  THEN
    RAISE EXCEPTION 'Changing role or global_role on profiles requires super admin privileges'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.profiles_block_self_role_change() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS profiles_block_self_role_change_trg ON public.profiles;
CREATE TRIGGER profiles_block_self_role_change_trg
  BEFORE UPDATE OF role, global_role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_block_self_role_change();
