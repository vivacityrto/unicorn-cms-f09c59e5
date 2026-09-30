-- Record a client timeline entry whenever a note is pinned or unpinned.
--
-- Background: trg_notes_timeline only fires on INSERT, so pinning a `notes` row
-- never produced a timeline event. The only writer of note_pinned /
-- note_unpinned events was rpc_toggle_client_note_pin, which operates on the
-- retired client_notes table (0 such events exist). Both event types are
-- already permitted by timeline_valid_event_type and rendered by the Timeline.
--
-- Design
--   * A trigger, not client code: it fires for every way a pin can change (row
--     menu, pinned-notes card, Timeline button, the edit form's pin checkbox) and
--     commits in the same transaction as the pin, so a pin can never exist
--     without its entry.
--   * entity_type 'structured_note' + entity_id = note id, matching the events
--     trg_notes_timeline writes, so the Timeline's pin button resolves the note.
--   * visibility is left at its column default ('internal'): clients only see
--     events with visibility = 'client', so pin activity stays staff-only.
--   * created_by = auth.uid() (the person who pinned), NULL for service-role
--     writes. Not the note's author.
--   * Fires only when is_pinned actually changes.
--   * Additive: no existing row, policy, grant or function is modified.

CREATE OR REPLACE FUNCTION public.fn_notes_pin_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_title text;
BEGIN
  v_title := COALESCE(
    NULLIF(public.strip_html_to_text(NEW.title), ''),
    NULLIF(left(public.strip_html_to_text(NEW.note_details), 50), ''),
    'Untitled note'
  );

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, package_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.tenant_id::text,
    CASE WHEN NEW.is_pinned THEN 'note_pinned' ELSE 'note_unpinned' END,
    format('Note %s: %s', CASE WHEN NEW.is_pinned THEN 'pinned' ELSE 'unpinned' END, v_title),
    NULL,
    'structured_note',
    NEW.id::text,
    NEW.package_id,
    jsonb_build_object(
      'note_id', NEW.id,
      'is_pinned', NEW.is_pinned,
      'parent_type', NEW.parent_type,
      'parent_id', NEW.parent_id
    ),
    now(),
    auth.uid(),
    'user'
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notes_pin_timeline ON public.notes;

CREATE TRIGGER trg_notes_pin_timeline
AFTER UPDATE OF is_pinned ON public.notes
FOR EACH ROW
WHEN (OLD.is_pinned IS DISTINCT FROM NEW.is_pinned)
EXECUTE FUNCTION public.fn_notes_pin_timeline_trigger();
