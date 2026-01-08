-- Add unique constraint for meeting dedupe (entity_id = calendar_event_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_meeting_dedupe 
ON public.client_timeline_events (tenant_id, client_id, event_type, entity_id) 
WHERE event_type = 'meeting_synced';

-- Add unique constraint for time dedupe
CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_time_dedupe 
ON public.client_timeline_events (tenant_id, client_id, event_type, entity_id) 
WHERE event_type = 'time_posted';

-- Update time entry trigger to format time better and add source
CREATE OR REPLACE FUNCTION public.fn_time_entry_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_type text;
  v_title text;
  v_hours int;
  v_mins int;
  v_time_str text;
BEGIN
  -- Only trigger on status changes
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  
  -- Must have a client_id
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Format time nicely
  v_hours := NEW.minutes / 60;
  v_mins := NEW.minutes % 60;
  IF v_hours > 0 AND v_mins > 0 THEN
    v_time_str := format('%sh %sm', v_hours, v_mins);
  ELSIF v_hours > 0 THEN
    v_time_str := format('%sh', v_hours);
  ELSE
    v_time_str := format('%sm', v_mins);
  END IF;
  
  IF NEW.status = 'posted' AND OLD.status = 'draft' THEN
    v_event_type := 'time_posted';
    v_title := format('Time logged: %s', v_time_str);
  ELSIF NEW.status = 'discarded' AND OLD.status = 'draft' THEN
    v_event_type := 'time_ignored';
    v_title := format('Time discarded: %s', v_time_str);
  ELSE
    RETURN NEW;
  END IF;
  
  -- Insert with ON CONFLICT to prevent duplicates
  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.client_id::text,
    v_event_type,
    v_title,
    NEW.notes,
    'time_entry',
    NEW.id::text,
    jsonb_build_object(
      'time_entry_id', NEW.id,
      'minutes', NEW.minutes,
      'source', COALESCE(NEW.work_type, 'calendar'),
      'is_billable', NEW.is_billable,
      'package_id', NEW.package_id,
      'stage_id', NEW.stage_id
    ),
    COALESCE(NEW.work_date::timestamptz, now()),
    NEW.created_by,
    'system'
  )
  ON CONFLICT (tenant_id, client_id, event_type, entity_id) 
  WHERE event_type = 'time_posted'
  DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Update calendar event trigger to fire on client_id assignment in drafts
CREATE OR REPLACE FUNCTION public.fn_time_draft_client_match_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_calendar_event record;
  v_attendee_count int;
BEGIN
  -- Only fire when client_id is newly assigned
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  IF OLD.client_id IS NOT NULL THEN
    -- Client already assigned, skip
    RETURN NEW;
  END IF;
  
  -- Get the calendar event details
  SELECT * INTO v_calendar_event
  FROM public.calendar_events
  WHERE id = NEW.calendar_event_id;
  
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  
  -- Count attendees
  v_attendee_count := COALESCE(jsonb_array_length(v_calendar_event.attendees), 0);
  
  -- Insert meeting_synced event with dedupe
  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.client_id::text,
    'meeting_synced',
    format('Meeting: %s', COALESCE(v_calendar_event.title, 'Untitled meeting')),
    format('%s - %s (%s attendees)', 
      to_char(v_calendar_event.start_at AT TIME ZONE 'UTC', 'HH24:MI'),
      to_char(v_calendar_event.end_at AT TIME ZONE 'UTC', 'HH24:MI'),
      v_attendee_count
    ),
    'calendar_event',
    NEW.calendar_event_id::text,
    jsonb_build_object(
      'calendar_event_id', NEW.calendar_event_id,
      'provider_event_id', v_calendar_event.provider_event_id,
      'meeting_url', v_calendar_event.meeting_url,
      'start_at', v_calendar_event.start_at,
      'end_at', v_calendar_event.end_at,
      'organizer_email', v_calendar_event.organizer_email,
      'attendee_count', v_attendee_count,
      'match_confidence', COALESCE(NEW.match_confidence, 0),
      'match_reason', NEW.match_reason
    ),
    v_calendar_event.start_at,
    NEW.created_by,
    'system'
  )
  ON CONFLICT (tenant_id, client_id, event_type, entity_id) 
  WHERE event_type = 'meeting_synced'
  DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger on calendar_time_drafts for client matching
DROP TRIGGER IF EXISTS trg_time_draft_client_match ON public.calendar_time_drafts;
CREATE TRIGGER trg_time_draft_client_match
  AFTER UPDATE OF client_id ON public.calendar_time_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_time_draft_client_match_trigger();

-- Also trigger on INSERT if client is already set
DROP TRIGGER IF EXISTS trg_time_draft_client_match_insert ON public.calendar_time_drafts;
CREATE TRIGGER trg_time_draft_client_match_insert
  AFTER INSERT ON public.calendar_time_drafts
  FOR EACH ROW
  WHEN (NEW.client_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_time_draft_client_match_trigger();