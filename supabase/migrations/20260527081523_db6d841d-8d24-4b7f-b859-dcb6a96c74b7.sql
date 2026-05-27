
-- Hide the orphaned kickstart_time row if it was added previously
UPDATE public.dd_work_types SET is_active = false WHERE code = 'kickstart_time';

CREATE OR REPLACE FUNCTION public.validate_kickstart_tas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_slug text;
  v_included int;
  v_cap int;
  v_floor_minutes constant int := 1680; -- 28h
  v_block_minutes constant int := 420;  -- 7h
  v_existing_kickstart int;
  v_total_used int;
BEGIN
  IF NEW.work_type IS DISTINCT FROM 'kickstart_tas' THEN
    RETURN NEW;
  END IF;

  IF NEW.package_instance_id IS NULL THEN
    RAISE EXCEPTION 'KickStart TAS requires a package selection.';
  END IF;

  IF NEW.duration_minutes IS NULL OR NEW.duration_minutes <= 0
     OR (NEW.duration_minutes % v_block_minutes) <> 0 THEN
    RAISE EXCEPTION 'KickStart TAS must be a positive multiple of 7 hours (got % minutes).', NEW.duration_minutes;
  END IF;

  SELECT p.slug,
         COALESCE(pi.included_minutes,
                  ((COALESCE(pi.hours_included,0) + COALESCE(pi.hours_added,0)) * 60))
    INTO v_slug, v_included
  FROM public.package_instances pi
  JOIN public.packages p ON p.id = pi.package_id
  WHERE pi.id = NEW.package_instance_id;

  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'KickStart TAS: package instance % not found.', NEW.package_instance_id;
  END IF;

  v_cap := CASE v_slug
    WHEN '/package-m-sar' THEN 1680  -- 28h
    WHEN '/package-m-dr'  THEN 3780  -- 63h
    ELSE NULL
  END;

  IF v_cap IS NULL THEN
    RAISE EXCEPTION 'KickStart TAS is only available on Membership M-SAR or M-DR packages.';
  END IF;

  SELECT COALESCE(SUM(duration_minutes), 0) INTO v_existing_kickstart
  FROM public.time_entries
  WHERE package_instance_id = NEW.package_instance_id
    AND work_type = 'kickstart_tas'
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF (v_existing_kickstart + NEW.duration_minutes) > v_cap THEN
    RAISE EXCEPTION 'KickStart TAS cap exceeded for this package (cap % min, existing % min, attempting % min).',
      v_cap, v_existing_kickstart, NEW.duration_minutes;
  END IF;

  SELECT COALESCE(SUM(duration_minutes), 0) INTO v_total_used
  FROM public.time_entries
  WHERE package_instance_id = NEW.package_instance_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF (v_total_used + NEW.duration_minutes) > (v_included - v_floor_minutes) THEN
    RAISE EXCEPTION 'KickStart TAS would leave less than 28h of consult time in the package.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kickstart_tas_validate ON public.time_entries;
CREATE TRIGGER trg_kickstart_tas_validate
BEFORE INSERT OR UPDATE ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.validate_kickstart_tas();
