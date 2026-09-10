-- Same fix as fn_staff_task_instance_completed_timeline_trigger
-- (20260910014915_task_timeline_status_labels.sql) applied to the
-- stage-level equivalent: Carl caught raw dd_status.value snake_case in
-- stage_status_changed titles too ("Vivacity Academy Enrolment (v2):
-- not_started -> completed" instead of "... Not Started -> Completed").
-- Same dd_status.description lookup with a Title-Case fallback, no other
-- logic change. metadata's raw old_status/new_status fields are unchanged.

CREATE OR REPLACE FUNCTION public.fn_stage_instance_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id bigint;
  v_package_id bigint;
  v_stage_title text;
  v_old_status_label text;
  v_new_status_label text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id, package_id INTO v_tenant_id, v_package_id
    FROM public.package_instances
   WHERE id = NEW.packageinstance_id;

  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_stage_title FROM public.documents_stages WHERE id = NEW.stage_id;

  SELECT description INTO v_old_status_label
    FROM public.dd_status WHERE value = COALESCE(OLD.status, 'not_started') AND code < 100 LIMIT 1;
  SELECT description INTO v_new_status_label
    FROM public.dd_status WHERE value = COALESCE(NEW.status, 'not_started') AND code < 100 LIMIT 1;

  v_old_status_label := COALESCE(v_old_status_label, initcap(replace(COALESCE(OLD.status, 'not_started'), '_', ' ')));
  v_new_status_label := COALESCE(v_new_status_label, initcap(replace(COALESCE(NEW.status, 'not_started'), '_', ' ')));

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title,
    entity_type, entity_id, package_id, metadata, occurred_at, created_by, source
  ) VALUES (
    v_tenant_id,
    v_tenant_id::text,
    'stage_status_changed',
    format('%s: %s -> %s', COALESCE(v_stage_title, 'Stage'), v_old_status_label, v_new_status_label),
    'stage_instance',
    NEW.id::text,
    v_package_id,
    jsonb_build_object(
      'old_status', OLD.status,
      'new_status', NEW.status,
      'stage_id', NEW.stage_id,
      'package_instance_id', NEW.packageinstance_id
    ),
    COALESCE(NEW.status_date, now()),
    auth.uid(),
    'system'
  );
  RETURN NEW;
END;
$$;

-- Backfill existing rows already written with raw snake_case, re-deriving
-- from each row's own metadata (old_status/new_status, unaffected by this
-- fix) rather than parsing the old title text. Only touches rows whose
-- title still ends in the raw "lowercase -> lowercase" shape.
UPDATE public.client_timeline_events t
SET title = format('%s: %s -> %s',
  split_part(t.title, ':', 1),
  COALESCE(
    (SELECT description FROM public.dd_status WHERE value = t.metadata->>'old_status' AND code < 100 LIMIT 1),
    initcap(replace(COALESCE(t.metadata->>'old_status', 'not_started'), '_', ' '))
  ),
  COALESCE(
    (SELECT description FROM public.dd_status WHERE value = t.metadata->>'new_status' AND code < 100 LIMIT 1),
    initcap(replace(COALESCE(t.metadata->>'new_status', 'not_started'), '_', ' '))
  )
)
WHERE t.event_type = 'stage_status_changed'
  AND t.title ~ ': [a-z_]+ -> [a-z_]+$';
