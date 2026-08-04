-- Tenant lifecycle status changes (dd_status: active/on_hold/disabled/etc, set
-- via the TenantStatusDropdown UI) were never reflected in the client Timeline.
--
-- TenantStatusDropdown.tsx tried to record it as a client_notes entry + a
-- 'note_created' timeline event via rpc_create_client_note(p_note_type:
-- 'status_change'), but that RPC's note_type CHECK only allows ('meeting',
-- 'decision', 'risk', 'follow_up', 'escalation', 'general') — 'status_change'
-- always failed validation, so the call silently no-opped every single time
-- (confirmed: zero client_notes/client_timeline_events rows exist anywhere in
-- prod for this). That dead call is removed from the frontend in this PR.
--
-- This migration replaces it with a DB trigger directly on tenants.status,
-- which is more robust than an app-level insert (fires for any code path that
-- updates the column, not just this one UI component), and backfills the
-- historical changes already recorded in client_audit_log (61 rows total,
-- across all tenants — small enough to backfill in full, unlike the notes
-- backfill).

-- 1) New event type.
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
    'portal_activity_summary',
    'tenant_status_changed'
  ));

-- 2) Trigger: fires on any tenants.status change, internal-only (staff view).
CREATE OR REPLACE FUNCTION public.fn_tenant_status_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from_desc text;
  v_to_desc text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT description INTO v_from_desc FROM public.dd_status WHERE value = OLD.status;
    SELECT description INTO v_to_desc FROM public.dd_status WHERE value = NEW.status;

    INSERT INTO public.client_timeline_events (
      tenant_id, client_id, event_type, title, body,
      entity_type, entity_id, metadata, occurred_at, created_by, source, visibility
    ) VALUES (
      NEW.id,
      NEW.id::text,
      'tenant_status_changed',
      format('Status changed from %s to %s', COALESCE(v_from_desc, OLD.status), COALESCE(v_to_desc, NEW.status)),
      NULL,
      'tenant_status_change',
      gen_random_uuid()::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status),
      now(),
      auth.uid(),
      'user',
      'internal'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_status_timeline ON public.tenants;
CREATE TRIGGER trg_tenant_status_timeline
  AFTER UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_tenant_status_timeline_trigger();

REVOKE EXECUTE ON FUNCTION public.fn_tenant_status_timeline_trigger() FROM anon, authenticated, PUBLIC;

-- 3) Backfill from client_audit_log (action = 'tenant_status_changed').
-- Idempotent via NOT EXISTS on (entity_type, entity_id) keyed to the source
-- audit-log row's own id, matching the pattern used for the notes backfill.
INSERT INTO public.client_timeline_events (
  tenant_id, client_id, event_type, title, body,
  entity_type, entity_id, metadata, occurred_at, created_by, source, visibility
)
SELECT
  l.tenant_id,
  l.tenant_id::text,
  'tenant_status_changed',
  format(
    'Status changed from %s to %s',
    COALESCE((SELECT description FROM public.dd_status WHERE value = l.details->>'from'), l.details->>'from'),
    COALESCE((SELECT description FROM public.dd_status WHERE value = l.details->>'to'), l.details->>'to')
  ),
  NULL,
  'tenant_status_change',
  l.id::text,
  jsonb_build_object(
    'from', l.details->>'from',
    'to', l.details->>'to',
    'packages_closed', (l.details->>'packages_closed')::boolean,
    'backfilled', true
  ),
  l.created_at,
  l.actor_user_id,
  'user',
  'internal'
FROM public.client_audit_log l
WHERE l.action = 'tenant_status_changed'
  AND NOT EXISTS (
    SELECT 1 FROM public.client_timeline_events e
    WHERE e.entity_type = 'tenant_status_change' AND e.entity_id = l.id::text
  );
