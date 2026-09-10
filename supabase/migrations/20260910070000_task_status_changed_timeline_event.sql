-- Broaden the staff task timeline trigger (20260910012533) to fire on
-- every real status transition, not only completions — Carl wants the full
-- status history on the Timeline (Not Started -> In Progress -> Blocked ->
-- etc.), matching how stage_status_changed already covers every stage
-- transition, not just completion.
--
-- Same function/trigger names as before (CREATE OR REPLACE, no signature
-- change) — only the body's logic is broadened:
--   - A fresh transition INTO Completed(2)/Core Complete(4) still emits the
--     existing 'task_completed_team' event (unchanged wording/shape).
--   - Every other real change (Not Started -> In Progress, In Progress ->
--     Blocked, reverting away from Completed, editing between the two
--     completed states, etc.) now emits a new 'task_status_changed' event,
--     old -> new, mirroring fn_stage_instance_timeline_trigger()'s own
--     '%s -> %s' title convention.
-- Both event shapes keep embedding the stage's current status.

ALTER TABLE public.client_timeline_events
  DROP CONSTRAINT IF EXISTS timeline_valid_event_type;

ALTER TABLE public.client_timeline_events
  ADD CONSTRAINT timeline_valid_event_type
  CHECK (event_type IN (
    'microsoft_connected','microsoft_disconnected','microsoft_sync_failed',
    'sharepoint_root_configured','sharepoint_root_invalid','sharepoint_doc_linked',
    'document_shared_to_client','document_uploaded','document_downloaded',
    'meeting_synced','meeting_attendance_imported','meeting_artifacts_captured',
    'minutes_draft_created','minutes_draft_updated','minutes_published_pdf',
    'tasks_created_from_minutes','task_completed_team','task_completed_client',
    'task_status_changed',
    'action_item_created','action_item_updated','action_item_completed','action_item_comment',
    'email_linked','email_attachment_saved','email_sent','email_failed',
    'note_added','note_created','note_pinned','note_unpinned','structured_note_added',
    'time_posted','time_ignored','time_reallocated',
    'account_invited','account_activated','account_deactivated','account_role_changed','account_removed',
    'client_login','message_sent','message_read',
    'academy_enrolled','academy_lesson_completed','academy_certificate_issued','academy_course_published',
    'stage_status_changed','package_status_changed','package_renewed','portal_activity_summary',
    'tenant_status_changed',
    'invitation_sent','invitation_opened','invitation_clicked','invitation_bounced','invitation_accepted',
    'xero_invoice_paid','xero_invoice_issued',
    'audit_created','audit_completed',
    'user_swapped_to_contact','contact_promoted_to_user'
  ));

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
  -- "UPDATE OF status, status_id" fires whenever either column is in the
  -- statement's SET list, even if the BEFORE normalize trigger leaves the
  -- value unchanged (e.g. re-saving the same status) -- skip true no-ops.
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

-- Trigger definition (name, columns, timing) is unchanged from 20260910012533.
REVOKE EXECUTE ON FUNCTION public.fn_staff_task_instance_completed_timeline_trigger() FROM anon, authenticated, PUBLIC;
