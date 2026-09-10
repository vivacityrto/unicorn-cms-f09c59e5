-- Fix a transcription drift caught by Carl live in the client Activity
-- Timeline (screenshot showed "Setup Client -- na" instead of the intended
-- em dash): the committed migration
-- (20260910070000_task_status_changed_timeline_event.sql) uses a real em
-- dash (U+2014) in the title format string, but it was retyped as a
-- literal "--" when applied live via the Supabase MCP apply_migration tool
-- call — the same class of risk AGENTS.md already documents for manual
-- Edge Function deploys ("manual deploys risk transcription errors from
-- retyping large files"), just for a migration's SQL body instead.
--
-- CREATE OR REPLACE with no logic change beyond the dash character; also
-- backfilled the 15 rows already written with the wrong dash so existing
-- Timeline entries read consistently with new ones going forward.

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

  IF NEW.status_id IN (2, 4) AND OLD.status_id NOT IN (2, 4) THEN
    v_event_type := 'task_completed_team';
    v_title := format('%s completed (%s — %s)',
      COALESCE(v_task_name, 'Task'), COALESCE(v_stage_title, 'Stage'), COALESCE(v_stage_status, 'not_started'));
  ELSE
    v_event_type := 'task_status_changed';
    v_title := format('%s: %s -> %s (%s — %s)',
      COALESCE(v_task_name, 'Task'), COALESCE(OLD.status, 'not_started'), COALESCE(NEW.status, 'not_started'),
      COALESCE(v_stage_title, 'Stage'), COALESCE(v_stage_status, 'not_started'));
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

-- Backfill the 15 rows already written with the wrong dash.
UPDATE public.client_timeline_events
SET title = replace(title, ' -- ', ' — ')
WHERE event_type IN ('task_completed_team', 'task_status_changed')
  AND title LIKE '%--%';
