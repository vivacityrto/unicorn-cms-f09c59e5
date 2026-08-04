-- Surface package_instances.membership_state transitions (active/paused/
-- cancelled/complete/etc.) on the internal Timeline, mirroring the
-- stage_instance_status_timeline_event pattern (20260804002130).
--
-- Trigger-based (not embedded in transition_membership_state) so every
-- write path is covered, including the raw admin edit screen
-- (PackageDataManager.tsx) which bypasses the RPC entirely today. That gap
-- is exactly how a Start Training Group package instance transitioned to
-- 'complete' with zero audit trail (investigated 2026-08-04).
--
-- Staff-only: not shown to clients anywhere in the portal today, same
-- reasoning as stage_status_changed.

-- 1) Extend the event_type CHECK constraint.
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
    'action_item_created','action_item_updated','action_item_completed',
    'email_linked','email_attachment_saved','email_sent','email_failed',
    'note_added','note_created','note_pinned','note_unpinned',
    'time_posted','time_ignored',
    'account_invited','account_activated','account_deactivated',
    'account_role_changed','account_removed',
    'structured_note_added',
    'client_login',
    'message_sent',
    'academy_enrolled','academy_lesson_completed','academy_certificate_issued',
    'stage_status_changed',
    'package_status_changed'
  ));

-- 2) Trigger function.
CREATE OR REPLACE FUNCTION public.fn_package_instance_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_package_name text;
BEGIN
  IF OLD.membership_state IS NOT DISTINCT FROM NEW.membership_state THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_package_name FROM public.packages WHERE id = NEW.package_id;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title,
    entity_type, entity_id, package_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.tenant_id::text,
    'package_status_changed',
    format('%s: %s -> %s', COALESCE(v_package_name, 'Package'), COALESCE(OLD.membership_state, 'active'), COALESCE(NEW.membership_state, 'active')),
    'package_instance',
    NEW.id::text,
    NEW.package_id,
    jsonb_build_object(
      'old_state', OLD.membership_state,
      'new_state', NEW.membership_state,
      'package_instance_id', NEW.id
    ),
    now(),
    auth.uid(),
    'system'
  );
  RETURN NEW;
END;
$$;

-- 3) Trigger — fires only when membership_state is part of the UPDATE's SET clause.
DROP TRIGGER IF EXISTS trg_package_instance_timeline ON public.package_instances;
CREATE TRIGGER trg_package_instance_timeline
  AFTER UPDATE OF membership_state ON public.package_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_package_instance_timeline_trigger();

-- 4) Trigger-only SECURITY DEFINER function — revoke direct execute.
REVOKE EXECUTE ON FUNCTION public.fn_package_instance_timeline_trigger() FROM anon, authenticated, PUBLIC;
