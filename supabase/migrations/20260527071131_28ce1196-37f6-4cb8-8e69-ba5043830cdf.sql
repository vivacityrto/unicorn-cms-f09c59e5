-- Fix the typo in dd_work_types lookup
UPDATE dd_work_types SET code = 'parent_defined', label = 'Parent Defined' WHERE code = 'parent_definde';

-- Create the function that enforces the parent_defined lock
CREATE OR REPLACE FUNCTION public.check_parent_defined_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  existing_id uuid;
BEGIN
  IF NEW.package_instance_id IS NOT NULL THEN
    SELECT id INTO existing_id
    FROM public.time_entries
    WHERE package_instance_id = NEW.package_instance_id
      AND work_type = 'parent_defined'
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF FOUND THEN
      RAISE EXCEPTION 'Package is allocated to parent organisation; no further time entries allowed.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach the trigger to time_entries
DROP TRIGGER IF EXISTS trg_parent_defined_lock ON public.time_entries;
CREATE TRIGGER trg_parent_defined_lock
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.check_parent_defined_lock();
