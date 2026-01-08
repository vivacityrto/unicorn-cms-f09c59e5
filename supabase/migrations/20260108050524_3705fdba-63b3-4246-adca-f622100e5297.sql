-- Add occurred_at column if missing
ALTER TABLE public.client_timeline_events 
ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_timeline_tenant_client_occurred 
ON public.client_timeline_events (tenant_id, client_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_timeline_tenant_type_occurred 
ON public.client_timeline_events (tenant_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_timeline_metadata_gin 
ON public.client_timeline_events USING gin (metadata);

-- Create RPC to insert timeline events safely
CREATE OR REPLACE FUNCTION public.rpc_insert_timeline_event(
  p_tenant_id bigint,
  p_client_id bigint,
  p_event_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_occurred_at timestamptz DEFAULT now(),
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body, 
    entity_type, entity_id, metadata, occurred_at, 
    created_by, source
  ) VALUES (
    p_tenant_id, p_client_id::text, p_event_type, p_title, p_body,
    p_entity_type, p_entity_id, p_metadata, p_occurred_at,
    COALESCE(p_created_by, auth.uid()), 'system'
  )
  RETURNING id INTO v_id;
  
  RETURN jsonb_build_object('success', true, 'event_id', v_id);
END;
$$;

-- Trigger function for time entry posted/ignored
CREATE OR REPLACE FUNCTION public.fn_time_entry_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client_name text;
  v_event_type text;
  v_title text;
BEGIN
  -- Only trigger on status changes to posted or ignored
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  
  -- Must have a client_id
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get client name
  SELECT name INTO v_client_name 
  FROM public.tenants 
  WHERE id = NEW.client_id;
  
  IF NEW.status = 'posted' AND OLD.status = 'draft' THEN
    v_event_type := 'time_posted';
    v_title := format('Time logged: %s min - %s', NEW.minutes, COALESCE(NEW.notes, 'No notes'));
  ELSIF NEW.status = 'discarded' AND OLD.status = 'draft' THEN
    v_event_type := 'time_ignored';
    v_title := format('Time discarded: %s min', NEW.minutes);
  ELSE
    RETURN NEW;
  END IF;
  
  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.client_id::text,
    v_event_type,
    v_title,
    NULL,
    'time_entry',
    NEW.id::text,
    jsonb_build_object(
      'minutes', NEW.minutes,
      'work_type', NEW.work_type,
      'is_billable', NEW.is_billable,
      'package_id', NEW.package_id,
      'stage_id', NEW.stage_id
    ),
    now(),
    NEW.created_by,
    'system'
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger on calendar_time_drafts for posted/discarded
DROP TRIGGER IF EXISTS trg_time_draft_timeline ON public.calendar_time_drafts;
CREATE TRIGGER trg_time_draft_timeline
  AFTER UPDATE OF status ON public.calendar_time_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_time_entry_timeline_trigger();

-- Trigger function for meeting synced
CREATE OR REPLACE FUNCTION public.fn_calendar_event_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client_id bigint;
  v_attendees_text text;
BEGIN
  -- Find matched client from calendar_time_drafts if exists
  SELECT client_id INTO v_client_id
  FROM public.calendar_time_drafts
  WHERE calendar_event_id = NEW.id
  AND client_id IS NOT NULL
  LIMIT 1;
  
  -- If no client matched yet, skip
  IF v_client_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Build attendees summary
  v_attendees_text := COALESCE(
    (SELECT string_agg(att->>'emailAddress'->>'address', ', ')
     FROM jsonb_array_elements(NEW.attendees) att
     LIMIT 5),
    'No attendees'
  );
  
  -- Only insert if this is a new event (INSERT) or significant update
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.client_timeline_events (
      tenant_id, client_id, event_type, title, body,
      entity_type, entity_id, metadata, occurred_at, created_by, source
    ) VALUES (
      NEW.tenant_id,
      v_client_id::text,
      'meeting_synced',
      format('Meeting: %s', COALESCE(NEW.title, 'Untitled meeting')),
      NEW.description,
      'calendar_event',
      NEW.id::text,
      jsonb_build_object(
        'start_at', NEW.start_at,
        'end_at', NEW.end_at,
        'location', NEW.location,
        'organizer', NEW.organizer_email,
        'provider', NEW.provider
      ),
      NEW.start_at,
      NEW.user_id,
      'system'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on calendar_events for meeting sync
DROP TRIGGER IF EXISTS trg_calendar_event_timeline ON public.calendar_events;
CREATE TRIGGER trg_calendar_event_timeline
  AFTER INSERT ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_calendar_event_timeline_trigger();

-- Trigger function for notes
CREATE OR REPLACE FUNCTION public.fn_client_note_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.client_id,
    'note_added',
    format('Note: %s', COALESCE(NEW.title, LEFT(NEW.content, 50))),
    NEW.content,
    'note',
    NEW.id::text,
    jsonb_build_object(
      'note_type', NEW.note_type,
      'tags', NEW.tags,
      'is_pinned', NEW.is_pinned
    ),
    NEW.created_at,
    NEW.created_by,
    'user'
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger on client_notes
DROP TRIGGER IF EXISTS trg_client_note_timeline ON public.client_notes;
CREATE TRIGGER trg_client_note_timeline
  AFTER INSERT ON public.client_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_client_note_timeline_trigger();

-- Trigger function for action items completed
CREATE OR REPLACE FUNCTION public.fn_action_item_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_type text;
BEGIN
  -- Only trigger when status changes to done
  IF NEW.status != 'done' OR OLD.status = 'done' THEN
    RETURN NEW;
  END IF;
  
  -- Determine if team or client task
  v_event_type := CASE 
    WHEN NEW.source = 'manual' THEN 'task_completed_team'
    ELSE 'task_completed_team'
  END;
  
  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.client_id,
    v_event_type,
    format('Task completed: %s', NEW.title),
    NEW.description,
    'action_item',
    NEW.id::text,
    jsonb_build_object(
      'priority', NEW.priority,
      'due_date', NEW.due_date,
      'owner_user_id', NEW.owner_user_id,
      'completed_by', NEW.completed_by
    ),
    now(),
    NEW.completed_by,
    'system'
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger on client_action_items
DROP TRIGGER IF EXISTS trg_action_item_timeline ON public.client_action_items;
CREATE TRIGGER trg_action_item_timeline
  AFTER UPDATE OF status ON public.client_action_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_action_item_timeline_trigger();

-- RPC to search timeline events
CREATE OR REPLACE FUNCTION public.rpc_search_timeline_events(
  p_tenant_id bigint,
  p_client_id bigint,
  p_search text DEFAULT NULL,
  p_event_types text[] DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  tenant_id integer,
  client_id text,
  event_type text,
  title text,
  body text,
  entity_type text,
  entity_id text,
  metadata jsonb,
  occurred_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.tenant_id,
    e.client_id,
    e.event_type,
    e.title,
    e.body,
    e.entity_type,
    e.entity_id,
    e.metadata,
    e.occurred_at,
    e.created_at,
    e.created_by,
    e.source
  FROM public.client_timeline_events e
  WHERE e.tenant_id = p_tenant_id
    AND e.client_id = p_client_id::text
    AND (p_search IS NULL OR (
      e.title ILIKE '%' || p_search || '%' 
      OR e.body ILIKE '%' || p_search || '%'
    ))
    AND (p_event_types IS NULL OR e.event_type = ANY(p_event_types))
  ORDER BY e.occurred_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.rpc_insert_timeline_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_search_timeline_events TO authenticated;