-- Add avatar_path column to users table for auto-sync
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS avatar_path text;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz;

COMMENT ON COLUMN public.users.avatar_path IS 'Storage object path in avatars bucket (e.g., {user_id}/profile.png)';
COMMENT ON COLUMN public.users.avatar_updated_at IS 'Updated when avatar_path changes to help cache-busting';

-- Trigger function to sync avatar to users profile
CREATE OR REPLACE FUNCTION public.sync_avatar_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Only act for the avatars bucket
  IF NEW.bucket_id <> 'avatars' THEN
    RETURN NEW;
  END IF;

  -- Expect path like: {user_id}/anything.png
  v_user_id := (storage.foldername(NEW.name))[1]::uuid;

  -- Update both avatar_path and avatar_url for compatibility
  UPDATE public.users
  SET avatar_path = NEW.name,
      avatar_url = (SELECT (storage.get_public_url('avatars', NEW.name)).data::text),
      avatar_updated_at = now(),
      updated_at = now()
  WHERE user_uuid = v_user_id;

  -- Log to audit table
  INSERT INTO public.audit_avatars (user_id, file_path)
  VALUES (v_user_id, NEW.name)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END
$$;

-- Create trigger for upload/update
DROP TRIGGER IF EXISTS trg_sync_avatar_upsert ON storage.objects;

CREATE TRIGGER trg_sync_avatar_upsert
AFTER INSERT OR UPDATE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION public.sync_avatar_to_profile();

-- Trigger function to clear avatar on delete
CREATE OR REPLACE FUNCTION public.clear_avatar_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF OLD.bucket_id <> 'avatars' THEN
    RETURN OLD;
  END IF;

  v_user_id := (storage.foldername(OLD.name))[1]::uuid;

  UPDATE public.users
  SET avatar_path = NULL,
      avatar_url = NULL,
      avatar_updated_at = now(),
      updated_at = now()
  WHERE user_uuid = v_user_id
    AND avatar_path = OLD.name;

  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS trg_clear_avatar_delete ON storage.objects;

CREATE TRIGGER trg_clear_avatar_delete
AFTER DELETE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION public.clear_avatar_on_delete();