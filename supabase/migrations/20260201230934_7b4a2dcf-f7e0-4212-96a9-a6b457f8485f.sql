-- Create a function to update last_sign_in_at in public.users when auth.users logs in
-- This function syncs the last_sign_in_at from auth.users to public.users

CREATE OR REPLACE FUNCTION public.sync_last_sign_in()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the last_sign_in_at in public.users when it changes in auth.users
  UPDATE public.users
  SET last_sign_in_at = NEW.last_sign_in_at,
      updated_at = now()
  WHERE user_uuid = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users to sync last_sign_in_at
-- Note: This trigger fires when auth.users is updated (including login)
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;

CREATE TRIGGER on_auth_user_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at)
  EXECUTE FUNCTION public.sync_last_sign_in();

-- Also sync current last_sign_in_at values from auth.users to public.users
-- This backfills existing data
UPDATE public.users u
SET last_sign_in_at = a.last_sign_in_at
FROM auth.users a
WHERE u.user_uuid = a.id
  AND a.last_sign_in_at IS NOT NULL
  AND (u.last_sign_in_at IS NULL OR u.last_sign_in_at < a.last_sign_in_at);