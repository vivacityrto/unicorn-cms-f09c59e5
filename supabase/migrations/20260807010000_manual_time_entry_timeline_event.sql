-- Manually-logged time (Client -> Time tab "Add Time" dialog, plus the
-- work-timer start/stop flow) inserts directly into public.time_entries with
-- no path back into the client timeline. The existing time-logging timeline
-- coverage (fn_time_entry_timeline_trigger, trg_time_draft_timeline) only
-- fires on public.calendar_time_drafts status transitions (draft -> posted /
-- discarded), i.e. time that originated as an auto-suggested Outlook/Teams
-- meeting draft. A direct manual/timer time_entries insert produced zero
-- timeline event. Confirmed live: 0 rows in client_timeline_events with
-- entity_type = 'time_entry' despite 575 manual + 6 timer time_entries rows.
--
-- Scoped to source IN ('manual', 'timer') only:
--   - 'calendar' (draft-posted) is already covered by the existing trigger;
--     including it here would double-fire a 'time_posted' event.
--   - 'system' (renewal carry-over adjustments, RenewalConfirmDialog.tsx) is
--     an accounting adjustment, not a person logging work — excluded.
--   - 'clickup' (679 rows, sync-clickup-time / ClickUpTimeTransfer.tsx) is a
--     bulk sync pipeline, not in-app manual logging — deliberately left out
--     of this change pending a separate decision on whether/how it should
--     surface on the timeline.

CREATE OR REPLACE FUNCTION public.fn_manual_time_entry_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, package_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.client_id::text,
    'time_posted',
    format('Time logged: %s min - %s', NEW.duration_minutes, COALESCE(NEW.notes, 'No notes')),
    NEW.notes,
    'time_entry',
    NEW.id::text,
    NEW.package_id,
    jsonb_build_object(
      'duration_minutes', NEW.duration_minutes,
      'work_type', NEW.work_type,
      'work_sub_type', NEW.work_sub_type,
      'is_billable', NEW.is_billable,
      'package_id', NEW.package_id,
      'package_instance_id', NEW.package_instance_id,
      'stage_id', NEW.stage_id,
      'scope_tag', NEW.scope_tag,
      'entry_source', NEW.source
    ),
    COALESCE(NEW.start_at, NEW.created_at),
    NEW.user_id,
    'user'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_manual_time_entry_timeline ON public.time_entries;
CREATE TRIGGER trg_manual_time_entry_timeline
  AFTER INSERT ON public.time_entries
  FOR EACH ROW
  WHEN (NEW.source IN ('manual', 'timer'))
  EXECUTE FUNCTION public.fn_manual_time_entry_timeline_trigger();

REVOKE EXECUTE ON FUNCTION public.fn_manual_time_entry_timeline_trigger() FROM anon, authenticated, PUBLIC;

-- Backfill, scoped to the last 90 days (precedent: 20260804070000's notes
-- backfill), so existing manual/timer time entries appear retroactively
-- without flooding every tenant's timeline with older history.
-- Idempotent (NOT EXISTS guard), safe to re-run.
INSERT INTO public.client_timeline_events (
  tenant_id, client_id, event_type, title, body,
  entity_type, entity_id, package_id, metadata, occurred_at, created_by, source
)
SELECT
  t.tenant_id,
  t.client_id::text,
  'time_posted',
  format('Time logged: %s min - %s', t.duration_minutes, COALESCE(t.notes, 'No notes')),
  t.notes,
  'time_entry',
  t.id::text,
  t.package_id,
  jsonb_build_object(
    'duration_minutes', t.duration_minutes,
    'work_type', t.work_type,
    'work_sub_type', t.work_sub_type,
    'is_billable', t.is_billable,
    'package_id', t.package_id,
    'package_instance_id', t.package_instance_id,
    'stage_id', t.stage_id,
    'scope_tag', t.scope_tag,
    'entry_source', t.source,
    'backfilled', true
  ),
  COALESCE(t.start_at, t.created_at),
  t.user_id,
  'user'
FROM public.time_entries t
WHERE t.source IN ('manual', 'timer')
  AND t.client_id IS NOT NULL
  AND t.created_at >= now() - interval '90 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.client_timeline_events e
    WHERE e.entity_type = 'time_entry' AND e.entity_id = t.id::text
  );
