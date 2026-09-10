-- Render human-readable status labels in task timeline titles instead of
-- raw dd_status.value snake_case (e.g. "in_progress"). Carl caught a real
-- production title reading "(RTO Documentation - 2025 — in_progress)" and
-- wants "In Progress" — dd_status.description already carries exactly this
-- label for every status_id < 100 (0 Not Started, 1 In Progress,
-- 2 Completed, 3 N/A, 4 Core Complete, 6 Monitor), the same source
-- src/hooks/useTaskStatusOptions.ts already uses for on-screen labels
-- elsewhere in the app. Falls back to a Title-Case rendering of the raw
-- value (replace '_' with ' ', initcap) for any status somehow missing
-- from dd_status, so a future new status never regresses to blank text.
--
-- Applies to all three status-shaped slots in the title: the stage's own
-- current status, and (for task_status_changed) both the old and new task
-- status in the "X -> Y" portion.

CREATE OR REPLACE FUNCTION public.fn_staff_task_instance_completed_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id    bigint;
  v_package_id   bigint;
  v_stage_id     integer;
  v_stage_status text;
  v_stage_title  text;
  v_task_name    text;
  v_event_type   text;
  v_title        text;
  v_stage_status_label text;
  v_old_status_label   text;
  v_new_status_label   text;
BEGIN
  IF OLD.status_id IS NOT DISTINCT FROM NEW.status_id
     AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
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

  SELECT description INTO v_stage_status_label
    FROM public.dd_status WHERE value = COALESCE(v_stage_status, 'not_started') AND code < 100 LIMIT 1;
  SELECT description INTO v_old_status_label
    FROM public.dd_status WHERE value = COALESCE(OLD.status, 'not_started') AND code < 100 LIMIT 1;
  SELECT description INTO v_new_status_label
    FROM public.dd_status WHERE value = COALESCE(NEW.status, 'not_started') AND code < 100 LIMIT 1;

  v_stage_status_label := COALESCE(v_stage_status_label, initcap(replace(COALESCE(v_stage_status, 'not_started'), '_', ' ')));
  v_old_status_label   := COALESCE(v_old_status_label, initcap(replace(COALESCE(OLD.status, 'not_started'), '_', ' ')));
  v_new_status_label   := COALESCE(v_new_status_label, initcap(replace(COALESCE(NEW.status, 'not_started'), '_', ' ')));

  IF NEW.status_id IN (2, 4) AND OLD.status_id NOT IN (2, 4) THEN
    v_event_type := 'task_completed_team';
    v_title := format('%s completed (%s — %s)',
      COALESCE(v_task_name, 'Task'), COALESCE(v_stage_title, 'Stage'), v_stage_status_label);
  ELSE
    v_event_type := 'task_status_changed';
    v_title := format('%s: %s -> %s (%s — %s)',
      COALESCE(v_task_name, 'Task'), v_old_status_label, v_new_status_label,
      COALESCE(v_stage_title, 'Stage'), v_stage_status_label);
  END IF;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title,
    entity_type, entity_id, package_id, metadata, occurred_at, created_by, source, visibility
  ) VALUES (
    v_tenant_id,
    v_tenant_id::text,
    v_event_type,
    v_title,
    'staff_task_instance',
    NEW.id::text,
    v_package_id,
    jsonb_build_object(
      'staff_task_id', NEW.stafftask_id,
      'task_name', v_task_name,
      'old_status', OLD.status,
      'new_status', NEW.status,
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

REVOKE EXECUTE ON FUNCTION public.fn_staff_task_instance_completed_timeline_trigger() FROM anon, authenticated, PUBLIC;

-- Backfill the rows already written with raw snake_case statuses, re-deriving
-- from metadata (which already carries stage_id/old_status/new_status/
-- stage_status/task_name unchanged) rather than parsing the old title text.
UPDATE public.client_timeline_events t
SET title = CASE
  WHEN t.event_type = 'task_completed_team' THEN
    format('%s completed (%s — %s)',
      COALESCE(t.metadata->>'task_name', 'Task'),
      COALESCE((SELECT ds.title FROM public.documents_stages ds WHERE ds.id = (t.metadata->>'stage_id')::int), 'Stage'),
      COALESCE(
        (SELECT description FROM public.dd_status WHERE value = t.metadata->>'stage_status' AND code < 100 LIMIT 1),
        initcap(replace(COALESCE(t.metadata->>'stage_status', 'not_started'), '_', ' '))
      )
    )
  WHEN t.event_type = 'task_status_changed' THEN
    format('%s: %s -> %s (%s — %s)',
      COALESCE(t.metadata->>'task_name', 'Task'),
      COALESCE(
        (SELECT description FROM public.dd_status WHERE value = t.metadata->>'old_status' AND code < 100 LIMIT 1),
        initcap(replace(COALESCE(t.metadata->>'old_status', 'not_started'), '_', ' '))
      ),
      COALESCE(
        (SELECT description FROM public.dd_status WHERE value = t.metadata->>'new_status' AND code < 100 LIMIT 1),
        initcap(replace(COALESCE(t.metadata->>'new_status', 'not_started'), '_', ' '))
      ),
      COALESCE((SELECT ds.title FROM public.documents_stages ds WHERE ds.id = (t.metadata->>'stage_id')::int), 'Stage'),
      COALESCE(
        (SELECT description FROM public.dd_status WHERE value = t.metadata->>'stage_status' AND code < 100 LIMIT 1),
        initcap(replace(COALESCE(t.metadata->>'stage_status', 'not_started'), '_', ' '))
      )
    )
  ELSE t.title
END
WHERE t.event_type IN ('task_completed_team', 'task_status_changed');
