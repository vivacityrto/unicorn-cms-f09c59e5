-- Fix: public.notes.note_details stores raw HTML for some rows (notably
-- email-imported notes, e.g. "<p>Hello There,</p><p>I wanted to share...")
-- which was landing verbatim in client_timeline_events.title/body and
-- rendering as literal markup in the Timeline tab, per Carl's screenshot.
--
-- Adds a small reusable HTML-to-text helper, uses it in the notes timeline
-- trigger going forward, and cleans up the rows already written by the
-- Phase A-fix trigger/backfill (PR #139) this same session.

-- 1) Reusable helper.
CREATE OR REPLACE FUNCTION public.strip_html_to_text(p_html text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_text text;
BEGIN
  IF p_html IS NULL THEN
    RETURN NULL;
  END IF;

  v_text := p_html;
  -- Block-level tags become a line break before their markup is stripped,
  -- so paragraphs don't run together into one wall of text.
  v_text := regexp_replace(v_text, '</p>|<br\s*/?>|</div>|</li>|</h[1-6]>', E'\n', 'gi');
  v_text := regexp_replace(v_text, '<[^>]+>', '', 'g');

  -- Decode the handful of entities actually seen in imported content.
  v_text := replace(v_text, '&nbsp;', ' ');
  v_text := replace(v_text, '&amp;', '&');
  v_text := replace(v_text, '&lt;', '<');
  v_text := replace(v_text, '&gt;', '>');
  v_text := replace(v_text, '&quot;', '"');
  v_text := replace(v_text, '&#39;', '''');

  -- Collapse whitespace/blank-line runs left behind by stripped tags.
  v_text := regexp_replace(v_text, '[ \t]+', ' ', 'g');
  v_text := regexp_replace(v_text, '\n{3,}', E'\n\n', 'g');
  v_text := trim(both E' \n\t' from v_text);

  RETURN NULLIF(v_text, '');
END;
$$;

-- 2) Use it in the notes timeline trigger going forward.
CREATE OR REPLACE FUNCTION public.fn_notes_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_title text;
  v_body text;
BEGIN
  v_body := public.strip_html_to_text(NEW.note_details);
  v_title := COALESCE(
    NULLIF(public.strip_html_to_text(NEW.title), ''),
    format('%s note: %s', COALESCE(NEW.note_type, 'General'), LEFT(COALESCE(v_body, ''), 50))
  );

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, package_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.tenant_id::text,
    'structured_note_added',
    v_title,
    v_body,
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

-- 3) Clean up the rows already written this session (PR #139's trigger +
-- backfill). Re-derived from the source public.notes row rather than
-- patching the already-computed string in place — the old fallback title
-- truncated RAW HTML at 50 chars first, which could cut mid-tag and leave
-- an unclosed fragment a simple find/replace wouldn't catch.
UPDATE public.client_timeline_events e
   SET title = COALESCE(
         NULLIF(public.strip_html_to_text(n.title), ''),
         format('%s note: %s', COALESCE(n.note_type, 'General'), LEFT(COALESCE(public.strip_html_to_text(n.note_details), ''), 50))
       ),
       body = public.strip_html_to_text(n.note_details)
  FROM public.notes n
 WHERE e.entity_type = 'structured_note'
   AND e.entity_id = n.id::text;
