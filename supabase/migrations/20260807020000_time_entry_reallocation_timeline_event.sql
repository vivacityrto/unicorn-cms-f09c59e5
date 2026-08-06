-- Reallocating logged time between package instances (EditTimeDialog.tsx's
-- package selector on an existing time entry — the flow behind
-- fn_reallocate_time_entry's "Explicit package change" branch, which repoints
-- public.time_entry_allocations) never reached the client Timeline. Confirmed
-- live via public.time_entry_audit_log: 113 all-time package_instance_id
-- changes on UPDATE (69 in the last 90 days), including a real, recent,
-- repeated back-and-forth on tenant 6277 (MCC Adelaide Pty Ltd) between
-- package instances 15132 (M-RR / Ruby RTO Membership) and 15206 (M-GR / Gold
-- RTO Membership) as late as 2026-08-06 — exactly the kind of billing-relevant
-- movement staff need visible on that client's Timeline.
--
-- 113 rows is small enough to backfill in full (precedent: the 61-row
-- tenant_status_changed backfill), unlike the 11,340-row notes table.

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
    'time_posted','time_ignored','time_reallocated',
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

-- 2) Trigger: fires whenever an existing time entry's package_instance_id
-- actually changes (a real reallocation, not just an UPDATE statement that
-- happened to name the column). Separate trigger from fn_reallocate_time_entry
-- so the allocation-bookkeeping logic there stays untouched.
CREATE OR REPLACE FUNCTION public.fn_time_entry_reallocated_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_package_name text;
  v_new_package_name text;
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.full_text INTO v_old_package_name
  FROM public.package_instances pi JOIN public.packages p ON p.id = pi.package_id
  WHERE pi.id = OLD.package_instance_id;

  SELECT p.full_text INTO v_new_package_name
  FROM public.package_instances pi JOIN public.packages p ON p.id = pi.package_id
  WHERE pi.id = NEW.package_instance_id;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, package_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.client_id::text,
    'time_reallocated',
    format('Time reallocated: %s min moved from %s to %s',
      NEW.duration_minutes,
      COALESCE(v_old_package_name, 'no package'),
      COALESCE(v_new_package_name, 'no package')),
    NEW.notes,
    'time_entry',
    NEW.id::text,
    NEW.package_id,
    jsonb_build_object(
      'duration_minutes', NEW.duration_minutes,
      'old_package_instance_id', OLD.package_instance_id,
      'new_package_instance_id', NEW.package_instance_id,
      'work_type', NEW.work_type,
      'is_billable', NEW.is_billable
    ),
    now(),
    COALESCE(auth.uid(), NEW.user_id),
    'user'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_entry_reallocated_timeline ON public.time_entries;
CREATE TRIGGER trg_time_entry_reallocated_timeline
  AFTER UPDATE OF package_instance_id ON public.time_entries
  FOR EACH ROW
  WHEN (OLD.package_instance_id IS DISTINCT FROM NEW.package_instance_id)
  EXECUTE FUNCTION public.fn_time_entry_reallocated_timeline_trigger();

REVOKE EXECUTE ON FUNCTION public.fn_time_entry_reallocated_timeline_trigger() FROM anon, authenticated, PUBLIC;

-- 3) Backfill full history from time_entry_audit_log (113 rows). Idempotent
-- via NOT EXISTS keyed to the source audit-log row's own id (matching the
-- tenant_status_changed backfill pattern), since multiple reallocations can
-- hit the same time_entry_id.
INSERT INTO public.client_timeline_events (
  tenant_id, client_id, event_type, title, body,
  entity_type, entity_id, package_id, metadata, occurred_at, created_by, source
)
SELECT
  l.tenant_id,
  (l.new_row->>'client_id'),
  'time_reallocated',
  format('Time reallocated: %s min moved from %s to %s',
    l.new_row->>'duration_minutes',
    COALESCE(
      (SELECT p.full_text FROM public.package_instances pi JOIN public.packages p ON p.id = pi.package_id
       WHERE pi.id = (l.old_row->>'package_instance_id')::bigint),
      'no package'
    ),
    COALESCE(
      (SELECT p.full_text FROM public.package_instances pi JOIN public.packages p ON p.id = pi.package_id
       WHERE pi.id = (l.new_row->>'package_instance_id')::bigint),
      'no package'
    )
  ),
  l.new_row->>'notes',
  'time_entry',
  l.id::text,
  (l.new_row->>'package_id')::bigint,
  jsonb_build_object(
    'duration_minutes', (l.new_row->>'duration_minutes')::int,
    'old_package_instance_id', (l.old_row->>'package_instance_id')::bigint,
    'new_package_instance_id', (l.new_row->>'package_instance_id')::bigint,
    'work_type', l.new_row->>'work_type',
    'is_billable', (l.new_row->>'is_billable')::boolean,
    'backfilled', true
  ),
  l.created_at,
  l.actor_user_id,
  'user'
FROM public.time_entry_audit_log l
WHERE l.action = 'update'
  AND (l.old_row->>'package_instance_id') IS DISTINCT FROM (l.new_row->>'package_instance_id')
  AND (l.new_row->>'client_id') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.client_timeline_events e
    WHERE e.entity_type = 'time_entry' AND e.entity_id = l.id::text AND e.event_type = 'time_reallocated'
  );
