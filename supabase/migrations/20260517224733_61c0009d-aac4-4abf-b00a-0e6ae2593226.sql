-- Part 1: Backfill NULL full_name values
UPDATE public.users
SET full_name = TRIM(first_name) || ' ' || TRIM(last_name)
WHERE full_name IS NULL;

-- Part 2: Sync trigger function
CREATE OR REPLACE FUNCTION public.sync_user_full_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.full_name IS NULL OR TRIM(NEW.full_name) = '' THEN
    NEW.full_name := TRIM(NEW.first_name) || ' ' || TRIM(NEW.last_name);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_user_full_name
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_full_name();