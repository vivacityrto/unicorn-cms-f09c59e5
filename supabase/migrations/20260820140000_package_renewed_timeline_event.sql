-- Surface package renewals (including carry-over/forfeit outcome) on the
-- internal Timeline, and backfill the real historical renewals already
-- reconstructed into package_renewal_periods / client_audit_log.
--
-- Trigger-based (on package_renewal_periods AFTER INSERT), not embedded in
-- RenewalConfirmDialog - same "cover every write path" reasoning as
-- package_status_changed (20260804080000): any future code path that
-- creates a new renewal period automatically gets a timeline event, without
-- needing to remember to add one at each call site. period_number > 1 is
-- the signal that this is a genuine renewal (creating a NEW period), not a
-- package's first-ever period (created at package start, or by this
-- migration's own historical backfill via a plain INSERT with
-- period_number=1, which intentionally does not fire this trigger since it
-- represents pre-existing history, not a new live event).
--
-- Also fixes a related small bug found while cross-checking carry-over
-- history: the renewal dialog's negative carry-over time_entries row set
-- package_id but never package_instance_id (fixed in the same PR, in
-- RenewalConfirmDialog.tsx) - 5 of 7 existing carry-over time entries were
-- affected. Backfilled here so historical Time Log / EditTimeDialog queries
-- that join on package_instance_id can find them too.
--
-- That backfill update surfaced a second, more serious standing bug:
-- fn_auto_allocate_time_entry() (fires on INSERT) already skips work_type =
-- 'carry_over' entirely - they're accounting adjustments with a negative
-- duration_minutes, not real allocatable work - but fn_reallocate_time_entry()
-- (fires on UPDATE, e.g. from EditTimeDialog, or this migration's own
-- package_instance_id backfill) never got the same guard. Changing a
-- carry-over entry's package_instance_id crashes there: it tries to INSERT
-- a time_entry_allocations row with allocated_minutes = duration_minutes
-- (negative), violating that table's `allocated_minutes >= 0` check
-- constraint. This was a live crash risk independent of this migration -
-- any future edit to a carry-over entry's package or duration via
-- EditTimeDialog would hit it too. Fixed by mirroring the same guard onto
-- the reallocate trigger.

-- ─── 0. Fix: fn_reallocate_time_entry() must also skip carry-over entries ──
CREATE OR REPLACE FUNCTION public.fn_reallocate_time_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
BEGIN
  -- Carry-over entries are accounting adjustments (negative duration_minutes),
  -- never real allocatable work - mirrors fn_auto_allocate_time_entry()'s
  -- existing INSERT-time guard.
  IF NEW.work_type = 'carry_over' THEN
    RETURN NEW;
  END IF;

  -- Explicit package change (e.g. EditTimeDialog): pin all minutes to the
  -- chosen instance. allocate_time_entry() would re-target active memberships
  -- and undo historical reallocation to a completed package.
  IF OLD.package_instance_id IS DISTINCT FROM NEW.package_instance_id THEN
    DELETE FROM public.time_entry_allocations WHERE time_entry_id = NEW.id;
    IF NEW.package_instance_id IS NOT NULL THEN
      INSERT INTO public.time_entry_allocations
        (time_entry_id, tenant_id, package_instance_id, allocated_minutes, allocation_reason)
      VALUES
        (NEW.id, NEW.tenant_id, NEW.package_instance_id, COALESCE(NEW.duration_minutes, 0), 'reallocate');
    END IF;
    RETURN NEW;
  END IF;

  -- Duration-only change on a single alloc already pinned to this entry's
  -- package: scale minutes in place rather than re-running allocate_time_entry.
  IF OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
     AND (
       SELECT COUNT(*) FROM public.time_entry_allocations WHERE time_entry_id = NEW.id
     ) = 1
     AND EXISTS (
       SELECT 1 FROM public.time_entry_allocations
       WHERE time_entry_id = NEW.id
         AND package_instance_id IS NOT DISTINCT FROM NEW.package_instance_id
     ) THEN
    UPDATE public.time_entry_allocations
    SET allocated_minutes = COALESCE(NEW.duration_minutes, 0)
    WHERE time_entry_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Scope change, or duration change on multi-alloc / mismatched rows:
  -- existing RTO/CRICOS split logic.
  IF OLD.scope_tag IS DISTINCT FROM NEW.scope_tag
     OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes THEN
    PERFORM public.allocate_time_entry(NEW.id, auth.uid(), 'reallocate');
  END IF;

  RETURN NEW;
END;
$function$;

-- ─── 1. Data fix: backfill package_instance_id on carry-over entries ────
UPDATE public.time_entries
SET package_instance_id = package_id
WHERE work_type = 'carry_over'
  AND package_instance_id IS NULL
  AND package_id IS NOT NULL;

-- ─── 2. New timeline event type ─────────────────────────────────────────
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
    'note_added','note_created','note_pinned','note_unpinned','structured_note_added',
    'time_posted','time_ignored','time_reallocated',
    'account_invited','account_activated','account_deactivated',
    'account_role_changed','account_removed',
    'client_login',
    'message_sent','message_read',
    'academy_enrolled','academy_lesson_completed','academy_certificate_issued','academy_course_published',
    'stage_status_changed',
    'package_status_changed',
    'package_renewed',
    'portal_activity_summary',
    'tenant_status_changed',
    'invitation_sent','invitation_opened','invitation_clicked','invitation_bounced','invitation_accepted',
    'xero_invoice_paid','xero_invoice_issued',
    'audit_created','audit_completed'
  ));

-- ─── 3. Trigger: fire on every genuine renewal going forward ───────────
CREATE OR REPLACE FUNCTION public.fn_renewal_period_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_package_name text;
  v_tenant_id integer;
  v_package_id bigint;
  v_carry_text text;
  v_title text;
BEGIN
  IF NEW.period_number <= 1 THEN
    RETURN NEW;
  END IF;

  SELECT p.name, pi.tenant_id, pi.package_id
    INTO v_package_name, v_tenant_id, v_package_id
  FROM public.package_instances pi
  JOIN public.packages p ON p.id = pi.package_id
  WHERE pi.id = NEW.package_instance_id;

  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.carried_in_minutes > 0 THEN
    v_carry_text := trim(
      (CASE WHEN NEW.carried_in_minutes / 60 > 0 THEN (NEW.carried_in_minutes / 60)::text || 'h ' ELSE '' END) ||
      (CASE WHEN NEW.carried_in_minutes % 60 > 0 THEN (NEW.carried_in_minutes % 60)::text || 'm' ELSE '' END)
    );
    v_title := format('%s renewed — %s carried over', COALESCE(v_package_name, 'Package'), v_carry_text);
  ELSE
    v_title := format('%s renewed', COALESCE(v_package_name, 'Package'));
  END IF;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, package_id, metadata, occurred_at, created_by, source, visibility
  ) VALUES (
    v_tenant_id,
    v_tenant_id::text,
    'package_renewed',
    v_title,
    format('New period %s: %s to %s. %s min included%s.',
      NEW.period_number, NEW.period_start, NEW.period_end, NEW.included_minutes,
      CASE WHEN NEW.carried_in_minutes > 0 THEN format(' + %s min carried in', NEW.carried_in_minutes) ELSE '' END
    ),
    'package_instance',
    NEW.package_instance_id::text,
    v_package_id,
    jsonb_build_object(
      'period_number', NEW.period_number,
      'period_start', NEW.period_start,
      'period_end', NEW.period_end,
      'included_minutes', NEW.included_minutes,
      'carried_in_minutes', NEW.carried_in_minutes
    ),
    NEW.period_start::timestamptz,
    auth.uid(),
    'system',
    'internal'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_renewal_period_timeline ON public.package_renewal_periods;
CREATE TRIGGER trg_renewal_period_timeline
  AFTER INSERT ON public.package_renewal_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_renewal_period_timeline_trigger();

REVOKE EXECUTE ON FUNCTION public.fn_renewal_period_timeline_trigger() FROM anon, authenticated, PUBLIC;

-- ─── 4. Backfill: real historical renewals from client_audit_log ───────
-- Same dedup logic as the period-history backfill (20260820130000) - one
-- event per real renewal (all 16, both carry-over and forfeit outcomes),
-- dated at the actual renewal date, not "now".
WITH audit_dedup AS (
  SELECT DISTINCT ON (cal.entity_id, cal.details->>'from_period', cal.details->>'to_period')
    (cal.entity_id)::bigint AS package_instance_id,
    cal.created_at AS renewed_at,
    COALESCE((cal.details->>'carried_minutes')::integer, 0) AS carried_minutes,
    COALESCE((cal.details->>'included_minutes')::integer, 0) AS included_minutes,
    (cal.details->>'from_period')::date AS period_start,
    (cal.details->>'to_period')::date AS period_end
  FROM public.client_audit_log cal
  WHERE cal.action IN ('renewal_time_carry_over', 'renewal_time_forfeit')
    AND cal.entity_type = 'package_instances'
    AND cal.details ? 'from_period'
    AND cal.details ? 'to_period'
  ORDER BY cal.entity_id, cal.details->>'from_period', cal.details->>'to_period', cal.created_at DESC
)
INSERT INTO public.client_timeline_events (
  tenant_id, client_id, event_type, title, body,
  entity_type, entity_id, package_id, metadata, occurred_at, source, visibility
)
SELECT
  pi.tenant_id,
  pi.tenant_id::text,
  'package_renewed',
  CASE WHEN ad.carried_minutes > 0 THEN
    format('%s renewed — %s carried over', COALESCE(p.name, 'Package'),
      trim(
        (CASE WHEN ad.carried_minutes / 60 > 0 THEN (ad.carried_minutes / 60)::text || 'h ' ELSE '' END) ||
        (CASE WHEN ad.carried_minutes % 60 > 0 THEN (ad.carried_minutes % 60)::text || 'm' ELSE '' END)
      ))
  ELSE
    format('%s renewed', COALESCE(p.name, 'Package'))
  END,
  format('New period: %s to %s. %s min included%s.',
    ad.period_end, (ad.period_end + interval '1 year')::date, ad.included_minutes,
    CASE WHEN ad.carried_minutes > 0 THEN format(' + %s min carried in', ad.carried_minutes) ELSE '' END
  ),
  'package_instance',
  ad.package_instance_id::text,
  pi.package_id,
  jsonb_build_object(
    'period_start', ad.period_start,
    'period_end', ad.period_end,
    'included_minutes', ad.included_minutes,
    'carried_in_minutes', ad.carried_minutes,
    'backfilled_from', 'client_audit_log'
  ),
  ad.renewed_at,
  'system',
  'internal'
FROM audit_dedup ad
JOIN public.package_instances pi ON pi.id = ad.package_instance_id
JOIN public.packages p ON p.id = pi.package_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_timeline_events cte
  WHERE cte.event_type = 'package_renewed'
    AND cte.entity_id = ad.package_instance_id::text
    AND cte.occurred_at = ad.renewed_at
);
