
-- ============================================================
-- 1. DROP the trigger that overwrites owner_id from seat
-- ============================================================
DROP TRIGGER IF EXISTS tr_sync_rock_owner_from_seat ON public.eos_rocks;
DROP FUNCTION IF EXISTS public.sync_rock_owner_from_seat();

-- ============================================================
-- 2. ADD scope validation trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_rock_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Ensure rock_level is set
  IF NEW.rock_level IS NULL THEN
    NEW.rock_level := 'company';
  END IF;

  -- Company rocks: no function_id required, owner optional
  IF NEW.rock_level = 'company' THEN
    -- Company rocks should not be locked to a function
    NEW.function_id := NULL;
  END IF;

  -- Team rocks: require function_id and owner_id
  IF NEW.rock_level = 'team' THEN
    IF NEW.function_id IS NULL THEN
      RAISE EXCEPTION 'Team rock requires a function/team (function_id)';
    END IF;
    IF NEW.owner_id IS NULL THEN
      RAISE EXCEPTION 'Team rock requires an owner (owner_id)';
    END IF;
  END IF;

  -- Individual rocks: require owner_id
  IF NEW.rock_level = 'individual' THEN
    IF NEW.owner_id IS NULL THEN
      RAISE EXCEPTION 'Individual rock requires an owner (owner_id)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_rock_scope
BEFORE INSERT OR UPDATE ON public.eos_rocks
FOR EACH ROW
EXECUTE FUNCTION public.validate_rock_scope();
