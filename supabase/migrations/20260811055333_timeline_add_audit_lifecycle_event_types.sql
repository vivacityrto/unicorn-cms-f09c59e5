-- 2026-08-11 audit-timeline-silent-failures
-- client_timeline_events.event_type CHECK constraint (timeline_valid_event_type)
-- has never included 'audit_created' or 'audit_completed', even though
-- useClientAudits.ts (create) and useAuditWorkspace.ts (complete) have always
-- tried to insert both. Both call sites wrap the insert in try/catch (audit
-- creation/completion must not fail just because a Timeline log entry
-- couldn't be written), so this has been silently failing since the audit
-- feature existed — confirmed zero 'audit_created'/'audit_completed' rows
-- ever written, for any audit, ever.
--
-- Same root cause documented in 2026-08-10-timeline-event-type-constraint-drift.md:
-- this constraint gets hand-rewritten from scratch by every migration that
-- adds a new type, so a type present in application code but never added
-- here just silently never triggers a runtime error (thanks to the swallowed
-- try/catch) — no signal anything was wrong. Rebuilt from the LIVE definition
-- (pulled via pg_get_constraintdef immediately before writing this migration)
-- rather than from a stale migration file, per that entry's explicit lesson.
alter table public.client_timeline_events
  drop constraint timeline_valid_event_type;

alter table public.client_timeline_events
  add constraint timeline_valid_event_type
  check (event_type = any (array[
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
    'account_invited','account_activated','account_deactivated','account_role_changed','account_removed',
    'structured_note_added','client_login','message_sent',
    'academy_enrolled','academy_lesson_completed','academy_certificate_issued',
    'stage_status_changed','portal_activity_summary','tenant_status_changed',
    'invitation_sent','invitation_clicked','invitation_bounced','invitation_accepted','invitation_opened',
    'package_status_changed','xero_invoice_paid','xero_invoice_issued',
    'audit_created','audit_completed'
  ]::text[]));
