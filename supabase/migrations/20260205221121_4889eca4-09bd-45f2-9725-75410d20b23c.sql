-- Fix the generate_series_instances function with proper table aliases
CREATE OR REPLACE FUNCTION public.generate_series_instances(
  p_series_id UUID,
  p_weeks_ahead INTEGER DEFAULT 12
)
RETURNS TABLE(meeting_id UUID, scheduled_date TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series RECORD;
  v_next_date DATE;
  v_end_date DATE;
  v_meeting_id UUID;
  v_scheduled_date TIMESTAMPTZ;
  v_count INTEGER := 0;
BEGIN
  -- Get series info
  SELECT * INTO v_series FROM eos_meeting_series WHERE id = p_series_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Series not found: %', p_series_id;
  END IF;
  
  -- Calculate end date based on recurrence type
  CASE v_series.recurrence_type
    WHEN 'weekly' THEN
      v_end_date := CURRENT_DATE + (p_weeks_ahead * INTERVAL '1 week')::INTERVAL;
    WHEN 'quarterly' THEN
      v_end_date := CURRENT_DATE + INTERVAL '1 year';
    WHEN 'annual' THEN
      v_end_date := CURRENT_DATE + INTERVAL '2 years';
    ELSE
      v_end_date := CURRENT_DATE + INTERVAL '1 day'; -- one_time
  END CASE;
  
  -- Find the next occurrence date
  v_next_date := GREATEST(v_series.start_date, CURRENT_DATE);
  
  -- For weekly, align to the same day of week as start_date
  IF v_series.recurrence_type = 'weekly' THEN
    WHILE EXTRACT(DOW FROM v_next_date) != EXTRACT(DOW FROM v_series.start_date) LOOP
      v_next_date := v_next_date + INTERVAL '1 day';
    END LOOP;
  END IF;
  
  -- Generate instances
  WHILE v_next_date <= v_end_date LOOP
    -- Check if instance already exists for this date (use table alias to avoid ambiguity)
    IF NOT EXISTS (
      SELECT 1 FROM eos_meetings m 
      WHERE m.series_id = p_series_id 
        AND DATE(m.scheduled_date) = v_next_date
    ) THEN
      -- Create new meeting instance
      INSERT INTO eos_meetings (
        tenant_id,
        series_id,
        meeting_type,
        title,
        scheduled_date,
        duration_minutes,
        location,
        template_id,
        template_version_id,
        status,
        created_by,
        workspace_id,
        meeting_scope
      )
      SELECT 
        v_series.tenant_id,
        v_series.id,
        v_series.meeting_type,
        v_series.title || ' - ' || to_char(v_next_date, 'Mon DD, YYYY'),
        v_next_date + v_series.start_time,
        v_series.duration_minutes,
        v_series.location,
        v_series.agenda_template_id,
        v_series.agenda_template_version_id,
        'scheduled'::public.meeting_status,
        v_series.created_by,
        v_series.workspace_id,
        CASE WHEN v_series.workspace_id IS NOT NULL THEN 'vivacity_team' ELSE NULL END
      RETURNING id, eos_meetings.scheduled_date INTO v_meeting_id, v_scheduled_date;
      
      meeting_id := v_meeting_id;
      scheduled_date := v_scheduled_date;
      v_count := v_count + 1;
      
      RETURN NEXT;
    END IF;
    
    -- Move to next occurrence
    CASE v_series.recurrence_type
      WHEN 'weekly' THEN
        v_next_date := v_next_date + INTERVAL '1 week';
      WHEN 'quarterly' THEN
        v_next_date := v_next_date + INTERVAL '3 months';
      WHEN 'annual' THEN
        v_next_date := v_next_date + INTERVAL '1 year';
      ELSE
        EXIT; -- one_time, only create one
    END CASE;
  END LOOP;
  
  RETURN;
END;
$$;