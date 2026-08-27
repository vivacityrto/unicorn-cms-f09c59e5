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
  'action_item_comment',
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
  'time_reallocated',
  // Accounts
  'account_invited',
  'account_activated',
  'account_deactivated',
  'account_role_changed',
  'account_removed',
  // User <-> Contact swap/promote (tenant_contacts)
  'user_swapped_to_contact',
  'contact_promoted_to_user',
  // Client portal activity (internal-only)
  'client_login',
  // Messaging (client-visible send activity, internal read activity)
  'message_sent',
  'message_read',
  // Vivacity Academy activity (internal-only)
  'academy_enrolled',
  'academy_lesson_completed',
  'academy_certificate_issued',
  // Course publishing — internal staff action, attributed to the system tenant
  'academy_course_published',
  // Stage progression (internal-only)
  'stage_status_changed',
  // Package membership state changes (internal-only)
  'package_status_changed',
  // Package renewal (carry-over/forfeit outcome, internal-only)
  'package_renewed',
  // Client portal page-view digest (internal-only)
  'portal_activity_summary',
  // Tenant lifecycle status (internal-only)
  'tenant_status_changed',
  // Invitation lifecycle
  'invitation_sent',
  'invitation_opened',
  'invitation_clicked',
  'invitation_bounced',
  'invitation_accepted',
  // Xero invoice activity (internal-only, no amounts/numbers/references)
  'xero_invoice_paid',
  'xero_invoice_issued',
  // Compliance audit lifecycle (internal-only). Reconciled 2026-08-14 from
  // live-vs-git drift on the DB CHECK constraint — allowed in the DB since
  // before this, but nothing writes them yet (no live trigger/RPC inserts
  // these two today, unlike every other type in this file).
  'audit_created',
  'audit_completed',
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export const TIMELINE_VISIBILITIES = ['internal', 'client'] as const;
export type TimelineVisibility = (typeof TIMELINE_VISIBILITIES)[number];

export const TIMELINE_SOURCES = ['unicorn', 'microsoft', 'system', 'user'] as const;
export type TimelineSource = (typeof TIMELINE_SOURCES)[number];
