
-- 1. Add is_key_event to staff_tasks
ALTER TABLE public.staff_tasks ADD COLUMN IF NOT EXISTS is_key_event boolean NOT NULL DEFAULT false;

-- 2. Add event_conducted_date to stage_instances
ALTER TABLE public.stage_instances ADD COLUMN IF NOT EXISTS event_conducted_date date NULL;

-- 3. Trigger function: on staff_task_instances status change, update stage_instances.event_conducted_date
CREATE OR REPLACE FUNCTION public.trg_update_event_conducted_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_key_event boolean;
  v_stage_instance_id bigint;
  v_latest_date date;
BEGIN
  -- Get the parent staff_task's is_key_event flag and the stage instance
  SELECT st.is_key_event, NEW.stageinstance_id
    INTO v_is_key_event, v_stage_instance_id
    FROM public.staff_tasks st
   WHERE st.id = NEW.stafftask_id;

  -- Only proceed if the task is flagged as key event
  IF v_is_key_event IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- If status changed to Completed (2) or Core Complete (4), update event_conducted_date
  IF NEW.status_id IN (2, 4) AND (OLD.status_id IS DISTINCT FROM NEW.status_id) THEN
    UPDATE public.stage_instances
       SET event_conducted_date = CURRENT_DATE
     WHERE id = v_stage_instance_id;
  -- If status reverted FROM completed, recalculate from remaining completed key-event tasks
  ELSIF OLD.status_id IN (2, 4) AND NEW.status_id NOT IN (2, 4) THEN
    SELECT MAX(sti.completion_date::date)
      INTO v_latest_date
      FROM public.staff_task_instances sti
      JOIN public.staff_tasks st ON st.id = sti.stafftask_id
     WHERE sti.stageinstance_id = v_stage_instance_id
       AND st.is_key_event = true
       AND sti.status_id IN (2, 4)
       AND sti.id != NEW.id;

    UPDATE public.stage_instances
       SET event_conducted_date = v_latest_date
     WHERE id = v_stage_instance_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Create trigger
DROP TRIGGER IF EXISTS trg_staff_task_event_conducted ON public.staff_task_instances;
CREATE TRIGGER trg_staff_task_event_conducted
  AFTER UPDATE OF status_id ON public.staff_task_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_update_event_conducted_date();
