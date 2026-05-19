CREATE OR REPLACE FUNCTION public.handle_user_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    -- Preserved: append a login row to the activity ledger
    INSERT INTO public.user_activity (user_id, login_date)
    VALUES (NEW.id, COALESCE(NEW.last_sign_in_at, now()));

    -- New: mirror auth.users.last_sign_in_at into public.users so views
    -- (v_client_tenant_users etc.) read an accurate value without needing
    -- to cross the auth.users RLS boundary.
    UPDATE public.users
       SET last_sign_in_at = NEW.last_sign_in_at
     WHERE user_uuid = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_user_login() FROM PUBLIC;

-- Idempotent backfill of out-of-sync rows (~28 expected).
UPDATE public.users pu
   SET last_sign_in_at = au.last_sign_in_at
  FROM auth.users au
 WHERE au.id = pu.user_uuid
   AND pu.last_sign_in_at IS DISTINCT FROM au.last_sign_in_at;