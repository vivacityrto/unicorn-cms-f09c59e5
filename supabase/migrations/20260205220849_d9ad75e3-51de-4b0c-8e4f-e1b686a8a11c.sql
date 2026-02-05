-- Fix the auto_generate_next_meeting trigger function type mismatch
-- The entity_id column is UUID but was being cast to text

CREATE OR REPLACE FUNCTION public.auto_generate_next_meeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series RECORD;
  v_next_date timestamptz;
  v_next_meeting_id uuid;
BEGIN
  -- Only proceed if status changed to closed or completed
  IF NEW.status NOT IN ('closed', 'completed') OR OLD.status IN ('closed', 'completed') THEN
    RETURN NEW;
  END IF;
  
  -- Check if this meeting belongs to an active series
  IF NEW.series_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  SELECT * INTO v_series
  FROM eos_meeting_series
  WHERE id = NEW.series_id
    AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  
  -- Calculate next meeting date based on recurrence type
  CASE v_series.recurrence_type
    WHEN 'weekly' THEN
      v_next_date := NEW.scheduled_date + interval '7 days';
    WHEN 'biweekly' THEN
      v_next_date := NEW.scheduled_date + interval '14 days';
    WHEN 'monthly' THEN
      v_next_date := NEW.scheduled_date + interval '1 month';
    WHEN 'quarterly' THEN
      v_next_date := NEW.scheduled_date + interval '3 months';
    WHEN 'annual' THEN
      v_next_date := NEW.scheduled_date + interval '1 year';
    ELSE
      RETURN NEW;
  END CASE;
  
  -- Check if next meeting already exists (idempotency)
  IF EXISTS (
    SELECT 1 FROM eos_meetings
    WHERE series_id = NEW.series_id
      AND scheduled_date::date = v_next_date::date
      AND id != NEW.id
  ) THEN
    RETURN NEW;
  END IF;
  
  -- Create next meeting instance
  INSERT INTO eos_meetings (
    tenant_id, title, meeting_type, scheduled_date, duration_minutes,
    facilitator_id, series_id, status, workspace_id, meeting_scope,
    previous_meeting_id
  )
  VALUES (
    NEW.tenant_id, NEW.title, NEW.meeting_type, v_next_date, NEW.duration_minutes,
    NEW.facilitator_id, NEW.series_id, 'scheduled', NEW.workspace_id, NEW.meeting_scope,
    NEW.id
  )
  RETURNING id INTO v_next_meeting_id;
  
  -- Update current meeting to link to next
  UPDATE eos_meetings SET next_meeting_id = v_next_meeting_id WHERE id = NEW.id;
  
  -- Log audit event with proper UUID type (not casting to text)
  INSERT INTO audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (
    NEW.tenant_id, 'meeting', v_next_meeting_id,
    'meeting_auto_generated', auth.uid(),
    jsonb_build_object('source_meeting_id', NEW.id, 'scheduled_date', v_next_date)
  );
  
  RETURN NEW;
END;
$$;