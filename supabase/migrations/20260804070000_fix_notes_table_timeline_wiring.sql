-- Fix: Timeline Phase A wired a trigger onto public.documents_notes based on
-- research that conflated it with the table actually backing the
-- "Structured Notes" tab (ClientStructuredNotesTab.tsx / useNotes.tsx).
-- Confirmed: documents_notes has zero rows and zero code references anywhere
-- in src/ or supabase/functions/ — a completely dead table. The real table
-- is public.notes (11 real rows in prod, including manually-added notes and
-- email-imported ones via source_email_id).
--
-- This migration retires the dead trigger, wires the real one, and backfills
-- existing notes that predate this fix so they appear retroactively too.

-- 1) Retire the incorrect Phase A trigger/function.
DROP TRIGGER IF EXISTS trg_documents_note_timeline ON public.documents_notes;
DROP FUNCTION IF EXISTS public.fn_documents_note_timeline_trigger();

-- 2) Trigger function for the real table.
CREATE OR REPLACE FUNCTION public.fn_notes_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, package_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.tenant_id::text,
    'structured_note_added',
    COALESCE(NEW.title, format('%s note: %s', COALESCE(NEW.note_type, 'General'), LEFT(NEW.note_details, 50))),
    NEW.note_details,
    'structured_note',
    NEW.id::text,
    NEW.package_id,
    jsonb_build_object(
      'note_type', NEW.note_type,
      'priority', NEW.priority,
      'tags', NEW.tags,
      'is_pinned', NEW.is_pinned,
      'assignees', NEW.assignees,
      'file_names', NEW.file_names,
      'source_email_id', NEW.source_email_id,
      'started_date', NEW.started_date,
      'completed_date', NEW.completed_date
    ),
    NEW.created_at,
    NEW.created_by,
    'user'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notes_timeline ON public.notes;
CREATE TRIGGER trg_notes_timeline
  AFTER INSERT ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notes_timeline_trigger();

REVOKE EXECUTE ON FUNCTION public.fn_notes_timeline_trigger() FROM anon, authenticated, PUBLIC;

-- 3) Backfill for notes that predate this fix, scoped to the last 90 days.
-- public.notes turned out to hold the full "Unicorn 1" legacy migration
-- history (11,340 rows back to 2014 across 357 tenants) — an unscoped
-- backfill was run once, found to be far larger than intended, rolled back,
-- and redone with this 90-day window (793 rows / 69 tenants) per Carl's
-- explicit direction, so historical migration-era notes don't flood every
-- tenant's timeline or the Ask Viv RAG corpus. Idempotent (NOT EXISTS guard),
-- safe to re-run.
INSERT INTO public.client_timeline_events (
  tenant_id, client_id, event_type, title, body,
  entity_type, entity_id, package_id, metadata, occurred_at, created_by, source
)
SELECT
  n.tenant_id,
  n.tenant_id::text,
  'structured_note_added',
  COALESCE(n.title, format('%s note: %s', COALESCE(n.note_type, 'General'), LEFT(n.note_details, 50))),
  n.note_details,
  'structured_note',
  n.id::text,
  n.package_id,
  jsonb_build_object(
    'note_type', n.note_type,
    'priority', n.priority,
    'tags', n.tags,
    'is_pinned', n.is_pinned,
    'assignees', n.assignees,
    'file_names', n.file_names,
    'source_email_id', n.source_email_id,
    'started_date', n.started_date,
    'completed_date', n.completed_date,
    'backfilled', true
  ),
  n.created_at,
  n.created_by,
  'user'
FROM public.notes n
WHERE n.created_at >= now() - interval '90 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.client_timeline_events e
    WHERE e.entity_type = 'structured_note' AND e.entity_id = n.id::text
  );
