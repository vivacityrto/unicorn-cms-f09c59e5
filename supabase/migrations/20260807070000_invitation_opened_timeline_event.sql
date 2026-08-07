-- Follow-up to 20260807060000_user_invitation_timeline_events.sql: Carl asked
-- about "opened" specifically after noticing the Manage Invites page's own
-- status badges (Pending / Opened / Verified / Clicked) include it as a
-- first-class state, distinct from Clicked — the previous migration
-- deliberately left it off as "noisier than useful" without confirming that
-- call with Carl first. Same mailgun-webhook engagement branch already
-- writes first_opened_at/open_count (see previous migration's comment), so
-- this is the same pattern as invitation_clicked, just on the open columns.
--
-- 6 invitations have first_opened_at set live (1 of which was never also
-- clicked) — small enough for a full backfill.

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
    'time_posted','time_ignored','time_reallocated',
    'account_invited','account_activated','account_deactivated',
    'account_role_changed','account_removed',
    'structured_note_added',
    'client_login',
    'message_sent',
    'academy_enrolled','academy_lesson_completed','academy_certificate_issued',
    'stage_status_changed',
    'portal_activity_summary',
    'tenant_status_changed',
    'invitation_sent','invitation_clicked','invitation_bounced','invitation_accepted',
    'invitation_opened'
  ));

-- Fires once, on first_opened_at going from null to set (not on every
-- open_count increment) — same shape as fn_invitation_clicked_timeline_trigger.
CREATE OR REPLACE FUNCTION public.fn_invitation_opened_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.tenant_id::text,
    'invitation_opened',
    format('%s opened the invitation email', NEW.email),
    NULL,
    'user_invitation',
    NEW.id::text,
    jsonb_build_object('email', NEW.email, 'open_count', NEW.open_count),
    NEW.first_opened_at,
    NULL,
    'system'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invitation_opened_timeline ON public.user_invitations;
CREATE TRIGGER trg_invitation_opened_timeline
  AFTER UPDATE OF first_opened_at ON public.user_invitations
  FOR EACH ROW
  WHEN (OLD.first_opened_at IS NULL AND NEW.first_opened_at IS NOT NULL)
  EXECUTE FUNCTION public.fn_invitation_opened_timeline_trigger();

REVOKE EXECUTE ON FUNCTION public.fn_invitation_opened_timeline_trigger() FROM anon, authenticated, PUBLIC;

-- Backfill (6 rows).
INSERT INTO public.client_timeline_events (
  tenant_id, client_id, event_type, title, body,
  entity_type, entity_id, metadata, occurred_at, created_by, source
)
SELECT
  ui.tenant_id,
  ui.tenant_id::text,
  'invitation_opened',
  format('%s opened the invitation email', ui.email),
  NULL,
  'user_invitation',
  ui.id::text,
  jsonb_build_object('email', ui.email, 'open_count', ui.open_count, 'backfilled', true),
  ui.first_opened_at,
  NULL,
  'system'
FROM public.user_invitations ui
WHERE ui.first_opened_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.client_timeline_events e
    WHERE e.entity_type = 'user_invitation' AND e.entity_id = ui.id::text AND e.event_type = 'invitation_opened'
  );
