-- Phase 1: Add previous/next meeting links for chain navigation
ALTER TABLE eos_meetings
  ADD COLUMN IF NOT EXISTS previous_meeting_id UUID REFERENCES eos_meetings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_meeting_id UUID REFERENCES eos_meetings(id) ON DELETE SET NULL;

-- Add quorum outcome tracking
ALTER TABLE eos_meetings
  ADD COLUMN IF NOT EXISTS quorum_status TEXT 
    CHECK (quorum_status IN ('met', 'not_met', 'overridden', 'pending')) 
    DEFAULT 'pending';

-- Index for chain navigation
CREATE INDEX IF NOT EXISTS idx_eos_meetings_previous ON eos_meetings(previous_meeting_id);
CREATE INDEX IF NOT EXISTS idx_eos_meetings_next ON eos_meetings(next_meeting_id);

-- Phase 2: Add fiscal quarter columns for quarterly uniqueness
ALTER TABLE eos_meetings
  ADD COLUMN IF NOT EXISTS fiscal_year INTEGER,
  ADD COLUMN IF NOT EXISTS fiscal_quarter INTEGER;

-- Trigger to auto-populate fiscal quarter on insert/update
CREATE OR REPLACE FUNCTION set_fiscal_quarter()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.meeting_type = 'Quarterly' THEN
    NEW.fiscal_year := EXTRACT(YEAR FROM NEW.scheduled_date);
    NEW.fiscal_quarter := EXTRACT(QUARTER FROM NEW.scheduled_date);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_fiscal_quarter ON eos_meetings;
CREATE TRIGGER trg_set_fiscal_quarter
  BEFORE INSERT OR UPDATE ON eos_meetings
  FOR EACH ROW EXECUTE FUNCTION set_fiscal_quarter();

-- Unique constraint for quarterly meetings (one per quarter per tenant)
CREATE UNIQUE INDEX IF NOT EXISTS idx_quarterly_meeting_unique 
  ON eos_meetings (tenant_id, fiscal_year, fiscal_quarter)
  WHERE meeting_type = 'Quarterly' AND status != 'cancelled';

-- Phase 3: Auto-generate next meeting on completion
CREATE OR REPLACE FUNCTION auto_generate_next_meeting()
RETURNS TRIGGER AS $$
DECLARE
  v_series RECORD;
  v_next_date DATE;
  v_next_meeting_id UUID;
BEGIN
  -- Only trigger when status changes to 'closed' or 'completed'
  IF NEW.status IN ('closed', 'completed') AND OLD.status NOT IN ('closed', 'completed') THEN
    -- Get series if exists
    SELECT * INTO v_series FROM eos_meeting_series WHERE id = NEW.series_id;
    
    IF FOUND AND v_series.recurrence_type != 'one_time' AND v_series.is_active THEN
      -- Calculate next date based on recurrence
      CASE v_series.recurrence_type
        WHEN 'weekly' THEN
          v_next_date := DATE(NEW.scheduled_date) + INTERVAL '1 week';
        WHEN 'quarterly' THEN
          v_next_date := DATE(NEW.scheduled_date) + INTERVAL '3 months';
        WHEN 'annual' THEN
          v_next_date := DATE(NEW.scheduled_date) + INTERVAL '1 year';
        ELSE
          v_next_date := NULL;
      END CASE;
      
      -- Check if next instance already exists
      IF v_next_date IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM eos_meetings 
        WHERE series_id = NEW.series_id 
          AND DATE(scheduled_date) = v_next_date
      ) THEN
        -- Create next meeting
        INSERT INTO eos_meetings (
          tenant_id, series_id, meeting_type, title, scheduled_date,
          duration_minutes, location, template_id, template_version_id,
          status, created_by, previous_meeting_id
        )
        VALUES (
          v_series.tenant_id, v_series.id, v_series.meeting_type,
          v_series.title || ' - ' || to_char(v_next_date, 'Mon DD, YYYY'),
          v_next_date + COALESCE(v_series.start_time, TIME '09:00:00'), 
          COALESCE(v_series.duration_minutes, 90),
          v_series.location, v_series.agenda_template_id,
          v_series.agenda_template_version_id, 'scheduled',
          v_series.created_by, NEW.id
        )
        RETURNING id INTO v_next_meeting_id;
        
        -- Update current meeting's next link
        NEW.next_meeting_id := v_next_meeting_id;
        
        -- Seed attendees from the completed meeting
        INSERT INTO eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
        SELECT v_next_meeting_id, user_id, role_in_meeting, 'invited'
        FROM eos_meeting_attendees WHERE meeting_id = NEW.id
        ON CONFLICT DO NOTHING;
        
        -- Copy agenda segments
        INSERT INTO eos_meeting_segments (meeting_id, segment_name, sequence_order, duration_minutes)
        SELECT v_next_meeting_id, segment_name, sequence_order, duration_minutes
        FROM eos_meeting_segments WHERE meeting_id = NEW.id
        ON CONFLICT DO NOTHING;
        
        -- Log audit event
        INSERT INTO audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
        VALUES (
          NEW.tenant_id, 'meeting', v_next_meeting_id::text,
          'meeting_auto_generated', auth.uid(),
          jsonb_build_object('source_meeting_id', NEW.id, 'scheduled_date', v_next_date)
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_generate_next_meeting ON eos_meetings;
CREATE TRIGGER trg_auto_generate_next_meeting
  BEFORE UPDATE ON eos_meetings
  FOR EACH ROW EXECUTE FUNCTION auto_generate_next_meeting();

-- Phase 4: Carry-forward logic for open To-Dos
CREATE OR REPLACE FUNCTION carry_forward_open_todos(
  p_source_meeting_id UUID,
  p_target_meeting_id UUID
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_meeting RECORD;
  v_target_meeting RECORD;
  v_todo RECORD;
  v_new_todo_id UUID;
  v_todo_ids UUID[] := '{}';
BEGIN
  SELECT * INTO v_source_meeting FROM eos_meetings WHERE id = p_source_meeting_id;
  SELECT * INTO v_target_meeting FROM eos_meetings WHERE id = p_target_meeting_id;
  
  IF v_target_meeting IS NULL THEN
    RAISE EXCEPTION 'Target meeting not found';
  END IF;

  -- Copy incomplete todos to next meeting
  FOR v_todo IN 
    SELECT * FROM eos_todos 
    WHERE meeting_id = p_source_meeting_id 
      AND status NOT IN ('complete', 'cancelled')
  LOOP
    INSERT INTO eos_todos (
      tenant_id, title, description, assigned_to, owner_id,
      status, due_date, meeting_id, source_context, created_by
    ) VALUES (
      v_target_meeting.tenant_id, v_todo.title, v_todo.description,
      v_todo.assigned_to, v_todo.owner_id, 'pending',
      v_todo.due_date, p_target_meeting_id, 'carry_forward', auth.uid()
    ) RETURNING id INTO v_new_todo_id;
    
    v_todo_ids := array_append(v_todo_ids, v_new_todo_id);
  END LOOP;

  -- Audit
  IF array_length(v_todo_ids, 1) > 0 THEN
    INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, user_id, details)
    VALUES (
      v_source_meeting.tenant_id, p_target_meeting_id, 'todo', 'todos_carried_forward',
      auth.uid(), jsonb_build_object('count', array_length(v_todo_ids, 1), 'todo_ids', v_todo_ids)
    );
  END IF;

  RETURN v_todo_ids;
END;
$$;

-- Enhanced meeting completion with carry-forward
CREATE OR REPLACE FUNCTION complete_meeting_with_carry_forward(p_meeting_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_next_meeting_id UUID;
  v_carried_issues UUID[];
  v_carried_todos UUID[];
BEGIN
  -- Get meeting
  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;
  
  -- First, complete the meeting normally (if RPC exists)
  BEGIN
    PERFORM complete_meeting_instance(p_meeting_id);
  EXCEPTION WHEN undefined_function THEN
    -- Update status directly if RPC doesn't exist
    UPDATE eos_meetings SET status = 'closed', updated_at = NOW() WHERE id = p_meeting_id;
  END;
  
  -- Refresh meeting data to get next_meeting_id (set by trigger)
  SELECT next_meeting_id INTO v_next_meeting_id FROM eos_meetings WHERE id = p_meeting_id;
  
  IF v_next_meeting_id IS NOT NULL THEN
    -- Carry forward unresolved issues (if RPC exists)
    BEGIN
      SELECT carry_forward_unresolved_issues(p_meeting_id, v_next_meeting_id) INTO v_carried_issues;
    EXCEPTION WHEN undefined_function THEN
      v_carried_issues := '{}';
    END;
    
    -- Carry forward open todos
    SELECT carry_forward_open_todos(p_meeting_id, v_next_meeting_id) INTO v_carried_todos;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'next_meeting_id', v_next_meeting_id,
    'carried_issues', COALESCE(array_length(v_carried_issues, 1), 0),
    'carried_todos', COALESCE(array_length(v_carried_todos, 1), 0)
  );
END;
$$;

-- Phase 5: Read-only enforcement for completed meetings
CREATE OR REPLACE FUNCTION protect_completed_meeting_data()
RETURNS TRIGGER AS $$
DECLARE
  v_meeting_status TEXT;
  v_meeting_id UUID;
BEGIN
  -- Get the meeting_id from the record
  v_meeting_id := COALESCE(NEW.meeting_id, OLD.meeting_id);
  
  -- Skip if no meeting_id
  IF v_meeting_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Get the meeting status
  SELECT status INTO v_meeting_status 
  FROM eos_meetings 
  WHERE id = v_meeting_id;
  
  -- Block modifications if meeting is closed/completed
  IF v_meeting_status IN ('closed', 'completed') THEN
    RAISE EXCEPTION 'Cannot modify data for completed meeting. Create a new item instead.';
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply protection to meeting-linked tables (only UPDATE/DELETE, allow INSERT for carry-forward)
DROP TRIGGER IF EXISTS trg_protect_todos_in_completed_meeting ON eos_todos;
CREATE TRIGGER trg_protect_todos_in_completed_meeting
  BEFORE UPDATE OR DELETE ON eos_todos
  FOR EACH ROW EXECUTE FUNCTION protect_completed_meeting_data();

DROP TRIGGER IF EXISTS trg_protect_headlines_in_completed_meeting ON eos_headlines;
CREATE TRIGGER trg_protect_headlines_in_completed_meeting
  BEFORE UPDATE OR DELETE ON eos_headlines
  FOR EACH ROW EXECUTE FUNCTION protect_completed_meeting_data();