
-- Phase SE: staff_task_instances invariant enforcement.
-- Pre-flight verified: 0 non-canonical, 0 mismatched, 0 null rows.

CREATE OR REPLACE FUNCTION public.trg_staff_task_status_normalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expected_status    text;
  v_expected_status_id smallint;
  v_status_changed     boolean;
  v_status_id_changed  boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_status_changed    := true;
    v_status_id_changed := true;
  ELSE
    v_status_changed    := NEW.status    IS DISTINCT FROM OLD.status;
    v_status_id_changed := NEW.status_id IS DISTINCT FROM OLD.status_id;
  END IF;

  IF TG_OP = 'UPDATE' AND v_status_changed AND NOT v_status_id_changed THEN
    SELECT ds.code INTO v_expected_status_id
      FROM public.dd_status ds
     WHERE ds.value = NEW.status AND ds.code < 100
     LIMIT 1;
    IF v_expected_status_id IS NULL THEN
      RAISE EXCEPTION
        'staff_task_instances: unknown status %L - no dd_status row with code < 100',
        NEW.status USING ERRCODE = '23514';
    END IF;
    NEW.status_id := v_expected_status_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND v_status_id_changed AND NOT v_status_changed THEN
    SELECT ds.value INTO v_expected_status
      FROM public.dd_status ds
     WHERE ds.code = NEW.status_id AND ds.code < 100
     LIMIT 1;
    IF v_expected_status IS NULL THEN
      RAISE EXCEPTION
        'staff_task_instances: unknown status_id % - no dd_status row with code < 100',
        NEW.status_id USING ERRCODE = '23514';
    END IF;
    NEW.status := v_expected_status;
    RETURN NEW;
  END IF;

  SELECT ds.value, ds.code
    INTO v_expected_status, v_expected_status_id
    FROM public.dd_status ds
   WHERE ds.code = NEW.status_id
     AND ds.value = NEW.status
     AND ds.code < 100
   LIMIT 1;

  IF v_expected_status IS NULL THEN
    RAISE EXCEPTION
      'staff_task_instances: (status_id=%, status=%L) does not resolve to a single dd_status row with code < 100',
      NEW.status_id, NEW.status USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_staff_task_status_normalize() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_staff_task_status_normalize() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_staff_task_status_normalize ON public.staff_task_instances;
CREATE TRIGGER trg_staff_task_status_normalize
  BEFORE INSERT OR UPDATE OF status, status_id
  ON public.staff_task_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_staff_task_status_normalize();

ALTER TABLE public.staff_task_instances
  ADD CONSTRAINT chk_staff_task_instances_status_valid
  CHECK (status IN ('not_started','in_progress','completed','na','core_complete','monitor'))
  NOT VALID;

ALTER TABLE public.staff_task_instances
  VALIDATE CONSTRAINT chk_staff_task_instances_status_valid;

NOTIFY pgrst, 'reload schema';
