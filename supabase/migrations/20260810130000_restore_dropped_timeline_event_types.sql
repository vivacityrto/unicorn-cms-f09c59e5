-- Fix: "Finalise Package" (and every other package_instances.membership_state
-- transition — pause/resume/cancel/complete) fails with "new row for relation
-- client_timeline_events violates check constraint timeline_valid_event_type".
--
-- Root cause: timeline_valid_event_type is a hand-maintained CHECK constraint
-- that every migration adding a new event type rewrites from scratch (DROP +
-- ADD with a fully pasted-in list). 20260804080000 added 'package_status_changed'
-- for fn_package_instance_timeline_trigger, but 20260805010000 (the very next
-- day, for an unrelated tenant-status feature) rebuilt the constraint from an
-- older base list that predated that addition, silently dropping it. Every
-- later migration copied that same stale base forward, so it never came back.
-- Confirmed live: zero package_instance_state_log rows since 2026-08-04 (the
-- trigger's failed INSERT aborts the whole transition_membership_state call).
--
-- Cross-checking every trigger function that inserts into
-- client_timeline_events against the live constraint (this session) found one
-- more instance of the same pattern, unrelated to package instances:
-- 'action_item_comment' (log_action_item_comment_timeline, on
-- client_action_item_comments) has never been in the constraint since it was
-- introduced (20260210082835) — that trigger predates the constraint by a
-- month and was never added to it. Confirmed live: 0 rows ever in
-- client_action_item_comments. Restored alongside package_status_changed
-- since it's the same one-line fix and was already found during this audit.

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
    'action_item_created','action_item_updated','action_item_completed','action_item_comment',
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
    'invitation_opened',
    'package_status_changed'
  ));
