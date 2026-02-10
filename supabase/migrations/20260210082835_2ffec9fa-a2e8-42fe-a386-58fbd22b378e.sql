
-- =============================================================
-- Strict validation for client_timeline_events via CHECK constraints
-- (Avoids breaking 19 dependent DB functions by keeping text type)
-- =============================================================

-- 1) Allowed event types
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
    'time_posted','time_ignored'
  ));

-- 2) Allowed visibility values
ALTER TABLE public.client_timeline_events
  ADD CONSTRAINT timeline_valid_visibility
  CHECK (visibility IN ('internal','client'));

-- 3) Allowed source values
ALTER TABLE public.client_timeline_events
  ADD CONSTRAINT timeline_valid_source
  CHECK (source IN ('unicorn','microsoft','system','user'));

-- 4) Business rules
-- Microsoft events must be internal only
ALTER TABLE public.client_timeline_events
  ADD CONSTRAINT timeline_microsoft_internal_only
  CHECK (source <> 'microsoft' OR visibility = 'internal');

-- Client-visible events must be unicorn source
ALTER TABLE public.client_timeline_events
  ADD CONSTRAINT timeline_client_unicorn_only
  CHECK (visibility <> 'client' OR source = 'unicorn');
