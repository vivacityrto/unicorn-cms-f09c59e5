-- Timeline expansion Phase A: wire legacy structured notes (documents_notes) into
-- client_timeline_events, mirroring the existing fn_client_note_timeline_trigger pattern
-- used for client_notes. documents_notes has no client_id column — following the
-- established convention on this table, client_id = tenant_id::text.

-- 1) Extend the event_type CHECK constraint with the new type.
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
    'structured_note_added'
  ));

-- 2) Trigger function — same shape as fn_client_note_timeline_trigger.
CREATE OR REPLACE FUNCTION public.fn_documents_note_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, package_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.tenant_id::text,
    'structured_note_added',
    format('%s note: %s', COALESCE(NEW.note_type, 'General'), LEFT(NEW.note_details, 50)),
    NEW.note_details,
    'structured_note',
    NEW.id::text,
    NEW.package_id,
    jsonb_build_object(
      'note_type', NEW.note_type,
      'priority', NEW.priority,
      'stage_id', NEW.stage_id,
      'assignees', NEW.assignees,
      'file_names', NEW.file_names,
      'started_date', NEW.started_date,
      'completed_date', NEW.completed_date
    ),
    NEW.created_at,
    NEW.created_by,
    'user'
  );
  RETURN NEW;
END;
$$;

-- 3) Trigger — fires on every new structured note.
DROP TRIGGER IF EXISTS trg_documents_note_timeline ON public.documents_notes;
CREATE TRIGGER trg_documents_note_timeline
  AFTER INSERT ON public.documents_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_documents_note_timeline_trigger();

-- 4) Trigger-only SECURITY DEFINER function — never called via supabase.rpc(),
-- so revoke direct execute per the established convention (20260718070216).
REVOKE EXECUTE ON FUNCTION public.fn_documents_note_timeline_trigger() FROM anon, authenticated, PUBLIC;
