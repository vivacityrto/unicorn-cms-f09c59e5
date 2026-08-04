-- Timeline expansion Phase E (added mid-session per Carl's request): surface
-- stage progression status changes on the client Timeline.
--
-- public.stage_instances is the actively-used, CSC-facing stage tracker
-- (PackageStagesManager.tsx updates it directly; it already logs to
-- client_audit_log with action='stage_status_changed', reused here as the
-- event_type name for consistency). This is a separate table from
-- client_package_stage_state (a parallel, membership-scoped stage-state
-- system — see prior "two stage-state tables by design" note); only
-- stage_instances is wired here since it's the one with real production
-- data and an active UI. stage_instances has no tenant_id/client_id of its
-- own — resolved via package_instances.packageinstance_id.
--
-- Not shown to clients anywhere in the portal today (grep across
-- src/pages/client confirms no stage-level detail reaches client-facing
-- pages), so this stays internal-only like Academy/logins/page-views.

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
    'stage_status_changed'
  ));

-- 2) Trigger function.
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

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title,
    entity_type, entity_id, package_id, metadata, occurred_at, created_by, source
  ) VALUES (
    v_tenant_id,
    v_tenant_id::text,
    'stage_status_changed',
    format('%s: %s -> %s', COALESCE(v_stage_title, 'Stage'), COALESCE(OLD.status, 'not_started'), COALESCE(NEW.status, 'not_started')),
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

-- 3) Trigger — fires only when status is part of the UPDATE's SET clause.
DROP TRIGGER IF EXISTS trg_stage_instance_timeline ON public.stage_instances;
CREATE TRIGGER trg_stage_instance_timeline
  AFTER UPDATE OF status ON public.stage_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_stage_instance_timeline_trigger();

-- 4) Trigger-only SECURITY DEFINER function — revoke direct execute.
REVOKE EXECUTE ON FUNCTION public.fn_stage_instance_timeline_trigger() FROM anon, authenticated, PUBLIC;
