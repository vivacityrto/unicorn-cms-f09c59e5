-- Fix audit_eos_change() to properly cast entity_id to UUID
CREATE OR REPLACE FUNCTION public.audit_eos_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record JSONB;
  v_tenant_id BIGINT;
  v_meeting_id UUID;
  v_entity_id UUID;
BEGIN
  -- Get the record data
  IF TG_OP = 'DELETE' THEN
    v_record := to_jsonb(OLD);
  ELSE
    v_record := to_jsonb(NEW);
  END IF;

  -- Try to get tenant_id directly from the record
  IF v_record ? 'tenant_id' AND v_record->>'tenant_id' IS NOT NULL THEN
    v_tenant_id := (v_record->>'tenant_id')::BIGINT;
  END IF;

  -- Get meeting_id if present
  IF v_record ? 'meeting_id' AND v_record->>'meeting_id' IS NOT NULL THEN
    v_meeting_id := (v_record->>'meeting_id')::UUID;
  END IF;

  -- If no tenant_id but has meeting_id, get tenant_id from eos_meetings
  IF v_tenant_id IS NULL AND v_meeting_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id 
    FROM eos_meetings 
    WHERE id = v_meeting_id;
  END IF;

  -- Get entity ID as UUID
  IF v_record ? 'id' AND v_record->>'id' IS NOT NULL THEN
    BEGIN
      v_entity_id := (v_record->>'id')::UUID;
    EXCEPTION WHEN others THEN
      v_entity_id := NULL;
    END;
  END IF;

  -- Only insert if we have a tenant_id (required field)
  IF v_tenant_id IS NOT NULL THEN
    INSERT INTO audit_eos_events (
      tenant_id,
      entity,
      entity_id,
      action,
      user_id,
      meeting_id,
      details
    ) VALUES (
      v_tenant_id,
      TG_TABLE_NAME,
      v_entity_id,
      TG_OP,
      auth.uid(),
      v_meeting_id,
      v_record
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Fix create_meeting_basic to use correct schema
CREATE OR REPLACE FUNCTION public.create_meeting_basic(
  p_tenant_id BIGINT,
  p_meeting_type TEXT,
  p_title TEXT,
  p_scheduled_date TIMESTAMPTZ,
  p_facilitator_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_id UUID;
BEGIN
  -- Create the meeting
  INSERT INTO eos_meetings (
    tenant_id,
    meeting_type,
    title,
    scheduled_date,
    facilitator_id,
    status,
    created_by
  ) VALUES (
    p_tenant_id,
    p_meeting_type::eos_meeting_type,
    p_title,
    p_scheduled_date,
    COALESCE(p_facilitator_id, auth.uid()),
    'scheduled',
    auth.uid()
  )
  RETURNING id INTO v_meeting_id;

  -- Create standard segments based on meeting type
  IF p_meeting_type = 'L10' THEN
    INSERT INTO eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
    VALUES
      (v_meeting_id, 'Segue', 5, 1),
      (v_meeting_id, 'Scorecard', 5, 2),
      (v_meeting_id, 'Rock Review', 5, 3),
      (v_meeting_id, 'Headlines', 5, 4),
      (v_meeting_id, 'To-Do List', 5, 5),
      (v_meeting_id, 'IDS', 60, 6),
      (v_meeting_id, 'Conclude', 5, 7);
      
  ELSIF p_meeting_type = 'Quarterly' THEN
    INSERT INTO eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
    VALUES
      (v_meeting_id, 'Segue', 10, 1),
      (v_meeting_id, 'Review Previous Flight Plan', 30, 2),
      (v_meeting_id, 'Review Mission Control', 30, 3),
      (v_meeting_id, 'Establish Next Quarter Rocks', 60, 4),
      (v_meeting_id, 'Tackle Key Issues', 60, 5),
      (v_meeting_id, 'Next Steps', 20, 6),
      (v_meeting_id, 'Conclude', 10, 7);
      
  ELSIF p_meeting_type = 'Annual' THEN
    INSERT INTO eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
    VALUES
      (v_meeting_id, 'Day 1: Segue', 15, 1),
      (v_meeting_id, 'Day 1: Review Previous Mission Control', 60, 2),
      (v_meeting_id, 'Day 1: Team Health', 45, 3),
      (v_meeting_id, 'Day 1: SWOT/Issues List', 60, 4),
      (v_meeting_id, 'Day 1: Review Mission Control', 90, 5),
      (v_meeting_id, 'Day 2: Establish Next Quarter Rocks', 60, 6),
      (v_meeting_id, 'Day 2: Tackle Key Issues', 90, 7),
      (v_meeting_id, 'Day 2: Conclude', 20, 8);
      
  ELSIF p_meeting_type = 'Same_Page' THEN
    INSERT INTO eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
    VALUES
      (v_meeting_id, 'Check-In', 10, 1),
      (v_meeting_id, 'Review V/TO', 20, 2),
      (v_meeting_id, 'Clarify Roles and Ownership', 20, 3),
      (v_meeting_id, 'Discuss Key Issues', 40, 4),
      (v_meeting_id, 'Align on Priorities', 20, 5),
      (v_meeting_id, 'Decisions and Next Steps', 10, 6);
  END IF;

  RETURN v_meeting_id;
END;
$$;

-- Add segments to the specific meeting
INSERT INTO eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
SELECT 
  '64a80954-66e0-40b6-b595-0fa68a1ec4bb'::UUID,
  segment_name,
  duration_minutes,
  sequence_order
FROM (
  VALUES 
    ('Segue', 5, 1),
    ('Scorecard', 5, 2),
    ('Rock Review', 5, 3),
    ('Headlines', 5, 4),
    ('To-Do List', 5, 5),
    ('IDS', 60, 6),
    ('Conclude', 5, 7)
) AS t(segment_name, duration_minutes, sequence_order)
WHERE NOT EXISTS (
  SELECT 1 FROM eos_meeting_segments WHERE meeting_id = '64a80954-66e0-40b6-b595-0fa68a1ec4bb'
);