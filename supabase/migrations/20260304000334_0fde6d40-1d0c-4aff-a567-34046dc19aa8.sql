-- Function to auto-link public.users when a new auth.users row is created via OAuth
-- Matches by email: if a public.users row exists with the same email but null user_uuid, link it
CREATE OR REPLACE FUNCTION public.link_auth_user_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only attempt linking if the new auth user has an email
  IF NEW.email IS NOT NULL THEN
    UPDATE public.users
    SET user_uuid = NEW.id,
        updated_at = now()
    WHERE LOWER(email) = LOWER(NEW.email)
      AND (user_uuid IS NULL OR user_uuid = NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users to fire after insert (new sign-ups including OAuth)
CREATE TRIGGER on_auth_user_created_link_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_auth_user_to_profile();