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
  // Time
  'time_posted',
  'time_ignored',
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export const TIMELINE_VISIBILITIES = ['internal', 'client'] as const;
export type TimelineVisibility = (typeof TIMELINE_VISIBILITIES)[number];

export const TIMELINE_SOURCES = ['unicorn', 'microsoft', 'system', 'user'] as const;
export type TimelineSource = (typeof TIMELINE_SOURCES)[number];
