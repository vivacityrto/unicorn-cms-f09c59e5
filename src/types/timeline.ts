/**
 * Canonical timeline event types – single source of truth.
 *
 * This list mirrors the CHECK constraint on client_timeline_events.event_type
 * in the database. Any new event type must be added here AND in a DB migration.
 */
export const TIMELINE_EVENT_TYPES = [
  // Microsoft account
  'microsoft_connected',
  'microsoft_disconnected',
  'microsoft_sync_failed',
  // SharePoint & documents
  'sharepoint_root_configured',
  'sharepoint_root_invalid',
  'sharepoint_doc_linked',
  'document_shared_to_client',
  'document_uploaded',
  'document_downloaded',
  // Meetings & minutes
  'meeting_synced',
  'meeting_attendance_imported',
  'meeting_artifacts_captured',
  'minutes_draft_created',
  'minutes_draft_updated',
  'minutes_published_pdf',
  // Tasks
  'tasks_created_from_minutes',
  'task_completed_team',
  'task_completed_client',
  'action_item_created',
  'action_item_updated',
  'action_item_completed',
  // Emails
  'email_linked',
  'email_attachment_saved',
  'email_sent',
  'email_failed',
  // Notes
  'note_added',
  'note_created',
  'note_pinned',
  'note_unpinned',
  'structured_note_added',
  // Time
  'time_posted',
  'time_ignored',
  // Accounts
  'account_invited',
  'account_activated',
  'account_deactivated',
  'account_role_changed',
  'account_removed',
  // Client portal activity (internal-only)
  'client_login',
  // Messaging (client-visible)
  'message_sent',
  // Vivacity Academy activity (internal-only)
  'academy_enrolled',
  'academy_lesson_completed',
  'academy_certificate_issued',
  // Stage progression (internal-only)
  'stage_status_changed',
  // Client portal page-view digest (internal-only)
  'portal_activity_summary',
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export const TIMELINE_VISIBILITIES = ['internal', 'client'] as const;
export type TimelineVisibility = (typeof TIMELINE_VISIBILITIES)[number];

export const TIMELINE_SOURCES = ['unicorn', 'microsoft', 'system', 'user'] as const;
export type TimelineSource = (typeof TIMELINE_SOURCES)[number];
