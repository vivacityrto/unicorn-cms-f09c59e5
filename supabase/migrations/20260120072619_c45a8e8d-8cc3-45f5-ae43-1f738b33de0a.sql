-- Fix 1: Update audit_eos_change() to get tenant_id from eos_meetings when not directly available
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
  v_entity_id TEXT;
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

  -- If no tenant_id but has meeting_id, get tenant_id from eos_meetings
  IF v_tenant_id IS NULL AND v_record ? 'meeting_id' AND v_record->>'meeting_id' IS NOT NULL THEN
    v_meeting_id := (v_record->>'meeting_id')::UUID;
    SELECT tenant_id INTO v_tenant_id 
    FROM eos_meetings 
    WHERE id = v_meeting_id;
  END IF;

  -- If still no tenant_id, try to get from related tables based on entity type
  IF v_tenant_id IS NULL THEN
    -- For rocks, issues, todos that might have owner_id referencing a user
    IF TG_TABLE_NAME IN ('eos_rocks', 'eos_issues', 'eos_todos') AND v_record ? 'id' THEN
      -- Try to get from meeting if linked
      IF v_record ? 'meeting_id' AND v_record->>'meeting_id' IS NOT NULL THEN
        SELECT tenant_id INTO v_tenant_id 
        FROM eos_meetings 
        WHERE id = (v_record->>'meeting_id')::UUID;
      END IF;
    END IF;
  END IF;

  -- Get entity ID
  IF v_record ? 'id' THEN
    v_entity_id := v_record->>'id';
  ELSE
    v_entity_id := NULL;
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

-- Fix 2: Update create_issue RPC to handle text priority and convert to integer
CREATE OR REPLACE FUNCTION public.create_issue(
  p_tenant_id BIGINT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium',
  p_owner_id UUID DEFAULT NULL,
  p_meeting_id UUID DEFAULT NULL,
  p_rock_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue_id UUID;
  v_priority_int INTEGER;
BEGIN
  -- Convert text priority to integer
  v_priority_int := CASE LOWER(p_priority)
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    ELSE 2
  END;

  INSERT INTO eos_issues (
    tenant_id,
    title,
    description,
    priority,
    status,
    owner_id,
    meeting_id,
    rock_id,
    created_by
  ) VALUES (
    p_tenant_id,
    p_title,
    p_description,
    v_priority_int,
    'open',
    COALESCE(p_owner_id, auth.uid()),
    p_meeting_id,
    p_rock_id,
    auth.uid()
  )
  RETURNING id INTO v_issue_id;

  RETURN v_issue_id;
END;
$$;

-- Fix 3: Update create_meeting_basic to automatically create segments based on meeting type
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
  v_segment RECORD;
  v_sequence INTEGER := 1;
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
    -- Level 10 Meeting segments (90 min total)
    INSERT INTO eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order, status)
    VALUES
      (v_meeting_id, 'Segue', 5, 1, 'pending'),
      (v_meeting_id, 'Scorecard', 5, 2, 'pending'),
      (v_meeting_id, 'Rock Review', 5, 3, 'pending'),
      (v_meeting_id, 'Headlines', 5, 4, 'pending'),
      (v_meeting_id, 'To-Do List', 5, 5, 'pending'),
      (v_meeting_id, 'IDS', 60, 6, 'pending'),
      (v_meeting_id, 'Conclude', 5, 7, 'pending');
      
  ELSIF p_meeting_type = 'Quarterly' THEN
    -- Quarterly Meeting segments
    INSERT INTO eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order, status)
    VALUES
      (v_meeting_id, 'Segue', 10, 1, 'pending'),
      (v_meeting_id, 'Review Previous Flight Plan', 30, 2, 'pending'),
      (v_meeting_id, 'Review Mission Control', 30, 3, 'pending'),
      (v_meeting_id, 'Establish Next Quarter Rocks', 60, 4, 'pending'),
      (v_meeting_id, 'Tackle Key Issues', 60, 5, 'pending'),
      (v_meeting_id, 'Next Steps', 20, 6, 'pending'),
      (v_meeting_id, 'Conclude', 10, 7, 'pending');
      
  ELSIF p_meeting_type = 'Annual' THEN
    -- Annual Strategic Planning segments
    INSERT INTO eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order, status)
    VALUES
      (v_meeting_id, 'Day 1: Segue', 15, 1, 'pending'),
      (v_meeting_id, 'Day 1: Review Previous Mission Control', 60, 2, 'pending'),
      (v_meeting_id, 'Day 1: Team Health', 45, 3, 'pending'),
      (v_meeting_id, 'Day 1: SWOT/Issues List', 60, 4, 'pending'),
      (v_meeting_id, 'Day 1: Review Mission Control', 90, 5, 'pending'),
      (v_meeting_id, 'Day 2: Establish Next Quarter Rocks', 60, 6, 'pending'),
      (v_meeting_id, 'Day 2: Tackle Key Issues', 90, 7, 'pending'),
      (v_meeting_id, 'Day 2: Conclude', 20, 8, 'pending');
      
  ELSIF p_meeting_type = 'Same_Page' THEN
    -- Same Page Meeting segments (120 min)
    INSERT INTO eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order, status)
    VALUES
      (v_meeting_id, 'Check-In', 10, 1, 'pending'),
      (v_meeting_id, 'Review V/TO', 20, 2, 'pending'),
      (v_meeting_id, 'Clarify Roles and Ownership', 20, 3, 'pending'),
      (v_meeting_id, 'Discuss Key Issues', 40, 4, 'pending'),
      (v_meeting_id, 'Align on Priorities', 20, 5, 'pending'),
      (v_meeting_id, 'Decisions and Next Steps', 10, 6, 'pending');
  END IF;

  RETURN v_meeting_id;
END;
$$;