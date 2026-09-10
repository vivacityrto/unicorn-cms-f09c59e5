-- Surface stage task completions on the client Timeline.
--
-- `task_completed_team` has been a valid client_timeline_events.event_type
-- since 2026-08-04 (20260804050000_stage_instance_status_timeline_event.sql)
-- and is already referenced by the Timeline UI's "tasks" filter
-- (src/hooks/useClientManagementData.tsx EVENT_TYPE_FILTERS), but nothing
-- has ever written one — staff_task_instances had no timeline trigger at
-- all. Consultants completing a stage task therefore never produced any
-- Timeline entry, only the separate (and much less visible)
-- client_audit_log row already written from useStaffTaskInstances.ts.
--
-- Mirrors the existing fn_stage_instance_timeline_trigger() pattern
-- (SECURITY DEFINER, revoked direct EXECUTE, internal-only visibility —
-- staff task detail isn't shown to clients anywhere in the portal, same
-- rationale as stage_status_changed). Embeds the stage's current status in
-- the event so a task completion is legible without cross-referencing a
-- separate stage event; the stage's own transition (e.g. auto-completing
-- once every task is done) still lands as its own stage_status_changed
-- event via the existing trigger on stage_instances.

CREATE OR REPLACE FUNCTION public.fn_staff_task_instance_completed_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id  bigint;
  v_package_id bigint;
  v_stage_id   integer;
  v_stage_status text;
  v_stage_title  text;
  v_task_name    text;
BEGIN
  -- Only a fresh transition INTO a completed state is a "completion" —
  -- not every status_id change, and not editing between the two completed
  -- states (Completed=2, Core Complete=4), and not reverting away from one.
  IF NEW.status_id NOT IN (2, 4) OR OLD.status_id IN (2, 4) THEN
    RETURN NEW;
  END IF;

  SELECT si.stage_id, si.status, pi.tenant_id, pi.package_id
    INTO v_stage_id, v_stage_status, v_tenant_id, v_package_id
    FROM public.stage_instances si
    JOIN public.package_instances pi ON pi.id = si.packageinstance_id
   WHERE si.id = NEW.stageinstance_id;

  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_stage_title FROM public.documents_stages WHERE id = v_stage_id;
  SELECT name INTO v_task_name FROM public.staff_tasks WHERE id = NEW.stafftask_id;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title,
    entity_type, entity_id, package_id, metadata, occurred_at, created_by, source, visibility
  ) VALUES (
    v_tenant_id,
    v_tenant_id::text,
    'task_completed_team',
    format('%s completed (%s — %s)',
      COALESCE(v_task_name, 'Task'), COALESCE(v_stage_title, 'Stage'), COALESCE(v_stage_status, 'not_started')),
    'staff_task_instance',
    NEW.id::text,
    v_package_id,
    jsonb_build_object(
      'staff_task_id', NEW.stafftask_id,
      'task_name', v_task_name,
      'old_status_id', OLD.status_id,
      'new_status_id', NEW.status_id,
      'stage_instance_id', NEW.stageinstance_id,
      'stage_id', v_stage_id,
      'stage_status', v_stage_status
    ),
    now(),
    auth.uid(),
    'system',
    'internal'
  );
  RETURN NEW;
END;
$$;

-- Fires on either column in the original UPDATE's SET clause, matching
-- trg_staff_task_status_normalize's own column list: some callers
-- (complete_audit_stage_tasks) only SET status, relying on the normalize
-- trigger to derive status_id — "UPDATE OF" is evaluated against the
-- statement's target list, not the post-BEFORE-trigger NEW row, so status
-- must be listed here too or that path would silently never fire this.
DROP TRIGGER IF EXISTS trg_staff_task_instance_completed_timeline ON public.staff_task_instances;
CREATE TRIGGER trg_staff_task_instance_completed_timeline
  AFTER UPDATE OF status, status_id ON public.staff_task_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_staff_task_instance_completed_timeline_trigger();

-- Trigger-only SECURITY DEFINER function — revoke direct execute.
REVOKE EXECUTE ON FUNCTION public.fn_staff_task_instance_completed_timeline_trigger() FROM anon, authenticated, PUBLIC;
