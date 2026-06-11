
CREATE OR REPLACE FUNCTION public.sync_last_sign_in_on_user_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_last_sign_in timestamptz;
BEGIN
  SELECT au.last_sign_in_at
    INTO v_last_sign_in
  FROM auth.users au
  WHERE au.id = NEW.user_uuid;

  IF v_last_sign_in IS NOT NULL THEN
    UPDATE public.users
       SET last_sign_in_at = v_last_sign_in
     WHERE user_uuid = NEW.user_uuid
       AND last_sign_in_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_last_sign_in_on_user_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_sync_last_sign_in_on_insert ON public.users;
CREATE TRIGGER trg_sync_last_sign_in_on_insert
AFTER INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_last_sign_in_on_user_insert();

UPDATE public.users u
   SET last_sign_in_at = au.last_sign_in_at
  FROM auth.users au
 WHERE u.user_uuid = au.id
   AND au.last_sign_in_at IS NOT NULL
   AND u.last_sign_in_at IS NULL;
