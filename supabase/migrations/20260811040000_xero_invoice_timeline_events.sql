-- Xero invoice paid/due-date changes (tenants.xero_invoice_paid,
-- tenants.xero_invoice_due_date — written by xero-invoice-status,
-- xero-invoice-sync-all, and the now-live xero-webhook, see the addendum on
-- 2026-08-05-xero-invoice-status-cache-and-sync.md) never reached the client
-- Timeline. Carl asked for invoice activity to show up there, and on the
-- portfolio-wide Client Activity feed, which reuses the same table/RLS/
-- realtime-publication wiring (usePortfolioTimeline.tsx) — so a trigger
-- directly on tenants covers both surfaces with no separate feed-specific
-- work needed.
--
-- Both cache columns are re-checked every 6 hours by xero-invoice-sync-all
-- for ~135 tenants at a time, but most checks find no change — a naive
-- "on every UPDATE" trigger would spam the Timeline every 6 hours per tenant.
-- The trigger only fires on a genuine value change (WHEN OLD IS DISTINCT
-- FROM NEW), same pattern as fn_tenant_status_timeline_trigger.
--
-- Per the explicit decision in the 2026-08-05 audit (no invoice amounts,
-- numbers, or references anywhere in this feature), event bodies carry only
-- the paid signal and/or due date — nothing else from Xero.

-- 1) New event types.
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
    'invitation_sent','invitation_clicked','invitation_bounced','invitation_accepted','invitation_opened',
    'package_status_changed',
    'xero_invoice_paid','xero_invoice_issued'
  ));

-- 2) Trigger: fires only on a genuine change to the paid flag or due date,
-- not on every 6-hourly recheck that finds the same status.
CREATE OR REPLACE FUNCTION public.fn_xero_invoice_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.xero_invoice_paid IS TRUE AND OLD.xero_invoice_paid IS NOT TRUE THEN
    INSERT INTO public.client_timeline_events (
      tenant_id, client_id, event_type, title, body,
      entity_type, entity_id, metadata, occurred_at, created_by, source, visibility
    ) VALUES (
      NEW.id,
      NEW.id::text,
      'xero_invoice_paid',
      'Invoice paid',
      NULL,
      'tenant_xero_invoice',
      gen_random_uuid()::text,
      jsonb_build_object('previous_due_date', OLD.xero_invoice_due_date),
      now(),
      NULL,
      'system',
      'internal'
    );
  ELSIF NEW.xero_invoice_paid IS NOT TRUE
        AND NEW.xero_invoice_due_date IS NOT NULL
        AND OLD.xero_invoice_due_date IS DISTINCT FROM NEW.xero_invoice_due_date THEN
    INSERT INTO public.client_timeline_events (
      tenant_id, client_id, event_type, title, body,
      entity_type, entity_id, metadata, occurred_at, created_by, source, visibility
    ) VALUES (
      NEW.id,
      NEW.id::text,
      'xero_invoice_issued',
      format('Invoice due %s', to_char(NEW.xero_invoice_due_date, 'FMDD FMMonth YYYY')),
      NULL,
      'tenant_xero_invoice',
      gen_random_uuid()::text,
      jsonb_build_object('due_date', NEW.xero_invoice_due_date, 'previous_due_date', OLD.xero_invoice_due_date),
      now(),
      NULL,
      'system',
      'internal'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xero_invoice_timeline ON public.tenants;
CREATE TRIGGER trg_xero_invoice_timeline
  AFTER UPDATE OF xero_invoice_paid, xero_invoice_due_date ON public.tenants
  FOR EACH ROW
  WHEN (
    OLD.xero_invoice_paid IS DISTINCT FROM NEW.xero_invoice_paid
    OR OLD.xero_invoice_due_date IS DISTINCT FROM NEW.xero_invoice_due_date
  )
  EXECUTE FUNCTION public.fn_xero_invoice_timeline_trigger();

REVOKE EXECUTE ON FUNCTION public.fn_xero_invoice_timeline_trigger() FROM anon, authenticated, PUBLIC;

-- No backfill: xero_invoice_checked_at is overwritten in place on every
-- check (cache columns, not a log), so there's no history of past
-- paid/due-date transitions left to reconstruct.
