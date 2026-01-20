-- =============================================
-- EOS Meeting Series and Instance Architecture
-- =============================================

-- Step 1: Create eos_meeting_series table (Parent)
CREATE TABLE IF NOT EXISTS public.eos_meeting_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  meeting_type public.eos_meeting_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  agenda_template_id UUID,
  agenda_template_version_id UUID,
  recurrence_type TEXT NOT NULL CHECK (recurrence_type IN ('one_time', 'weekly', 'quarterly', 'annual')),
  recurrence_rule TEXT, -- iCal RRULE format
  start_date DATE NOT NULL,
  start_time TIME NOT NULL DEFAULT '09:00',
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  location TEXT,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.eos_meeting_series ENABLE ROW LEVEL SECURITY;

-- RLS policies for eos_meeting_series
CREATE POLICY "Users can view series in their tenant"
  ON public.eos_meeting_series FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()));

CREATE POLICY "Users can insert series in their tenant"
  ON public.eos_meeting_series FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()));

CREATE POLICY "Users can update series in their tenant"
  ON public.eos_meeting_series FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()));

CREATE POLICY "Users can delete series in their tenant"
  ON public.eos_meeting_series FOR DELETE
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()));

-- Step 2: Add series_id, agenda_snapshot, and actual_duration to eos_meetings
ALTER TABLE public.eos_meetings
  ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES public.eos_meeting_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agenda_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS actual_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Create index for series lookups
CREATE INDEX IF NOT EXISTS idx_eos_meetings_series_id ON public.eos_meetings(series_id);
CREATE INDEX IF NOT EXISTS idx_eos_meetings_status ON public.eos_meetings(status);
CREATE INDEX IF NOT EXISTS idx_eos_meetings_scheduled_date ON public.eos_meetings(scheduled_date);

-- Step 3: Function to generate upcoming meeting instances
CREATE OR REPLACE FUNCTION public.generate_series_instances(
  p_series_id UUID,
  p_weeks_ahead INTEGER DEFAULT 6
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
    -- Check if instance already exists for this date
    IF NOT EXISTS (
      SELECT 1 FROM eos_meetings 
      WHERE series_id = p_series_id 
        AND DATE(scheduled_date) = v_next_date
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
        created_by
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
        v_series.created_by
      RETURNING id, eos_meetings.scheduled_date INTO v_meeting_id, scheduled_date;
      
      meeting_id := v_meeting_id;
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

-- Step 4: Function to create a meeting series and generate initial instances
CREATE OR REPLACE FUNCTION public.create_meeting_series(
  p_tenant_id BIGINT,
  p_meeting_type public.eos_meeting_type,
  p_title TEXT,
  p_recurrence_type TEXT,
  p_start_date DATE,
  p_start_time TIME DEFAULT '09:00',
  p_duration_minutes INTEGER DEFAULT 90,
  p_location TEXT DEFAULT NULL,
  p_template_id UUID DEFAULT NULL,
  p_template_version_id UUID DEFAULT NULL,
  p_weeks_ahead INTEGER DEFAULT 6
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series_id UUID;
  v_user_id UUID := auth.uid();
BEGIN
  -- Create the series
  INSERT INTO eos_meeting_series (
    tenant_id,
    meeting_type,
    title,
    recurrence_type,
    start_date,
    start_time,
    duration_minutes,
    location,
    agenda_template_id,
    agenda_template_version_id,
    created_by
  ) VALUES (
    p_tenant_id,
    p_meeting_type,
    p_title,
    p_recurrence_type,
    p_start_date,
    p_start_time,
    p_duration_minutes,
    p_location,
    p_template_id,
    p_template_version_id,
    v_user_id
  )
  RETURNING id INTO v_series_id;
  
  -- Generate initial instances
  PERFORM generate_series_instances(v_series_id, p_weeks_ahead);
  
  -- Log audit event
  INSERT INTO audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (
    p_tenant_id,
    'meeting_series',
    v_series_id::TEXT,
    'meeting_series_created',
    v_user_id,
    jsonb_build_object(
      'meeting_type', p_meeting_type,
      'recurrence_type', p_recurrence_type,
      'title', p_title
    )
  );
  
  RETURN v_series_id;
END;
$$;

-- Step 5: Function to update a series (affects future instances only)
CREATE OR REPLACE FUNCTION public.update_meeting_series(
  p_series_id UUID,
  p_title TEXT DEFAULT NULL,
  p_template_id UUID DEFAULT NULL,
  p_template_version_id UUID DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_duration_minutes INTEGER DEFAULT NULL,
  p_start_time TIME DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series RECORD;
  v_before_snapshot JSONB;
BEGIN
  -- Get current series state for audit
  SELECT * INTO v_series FROM eos_meeting_series WHERE id = p_series_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  v_before_snapshot := row_to_json(v_series)::JSONB;
  
  -- Update the series
  UPDATE eos_meeting_series SET
    title = COALESCE(p_title, title),
    agenda_template_id = COALESCE(p_template_id, agenda_template_id),
    agenda_template_version_id = COALESCE(p_template_version_id, agenda_template_version_id),
    location = COALESCE(p_location, location),
    duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
    start_time = COALESCE(p_start_time, start_time),
    updated_at = now()
  WHERE id = p_series_id;
  
  -- Update FUTURE scheduled instances only (not started, not completed)
  UPDATE eos_meetings SET
    title = COALESCE(p_title, title) || ' - ' || to_char(DATE(scheduled_date), 'Mon DD, YYYY'),
    template_id = COALESCE(p_template_id, template_id),
    template_version_id = COALESCE(p_template_version_id, template_version_id),
    location = COALESCE(p_location, location),
    duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
    updated_at = now()
  WHERE series_id = p_series_id
    AND status = 'scheduled'
    AND scheduled_date > now();
  
  -- Log audit event
  INSERT INTO audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (
    v_series.tenant_id,
    'meeting_series',
    p_series_id::TEXT,
    'meeting_series_updated',
    auth.uid(),
    jsonb_build_object(
      'before', v_before_snapshot,
      'changes', jsonb_build_object(
        'title', p_title,
        'template_id', p_template_id,
        'location', p_location
      )
    )
  );
  
  RETURN TRUE;
END;
$$;

-- Step 6: Function to lock meeting agenda when started
CREATE OR REPLACE FUNCTION public.start_meeting_instance(p_meeting_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_agenda_snapshot JSONB;
BEGIN
  -- Get meeting
  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Build agenda snapshot from current segments
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'segment_name', s.segment_name,
      'sequence_order', s.sequence_order,
      'duration_minutes', s.duration_minutes
    ) ORDER BY s.sequence_order
  ) INTO v_agenda_snapshot
  FROM eos_meeting_segments s
  WHERE s.meeting_id = p_meeting_id;
  
  -- Update meeting with locked agenda
  UPDATE eos_meetings SET
    status = 'in_progress',
    started_at = now(),
    agenda_snapshot = COALESCE(v_agenda_snapshot, '[]'::JSONB),
    updated_at = now()
  WHERE id = p_meeting_id;
  
  -- Log audit event
  INSERT INTO audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (
    v_meeting.tenant_id,
    'meeting',
    p_meeting_id::TEXT,
    'meeting_instance_started',
    auth.uid(),
    jsonb_build_object(
      'agenda_snapshot', v_agenda_snapshot
    )
  );
  
  RETURN TRUE;
END;
$$;

-- Step 7: Function to complete a meeting instance
CREATE OR REPLACE FUNCTION public.complete_meeting_instance(p_meeting_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_actual_duration INTEGER;
BEGIN
  -- Get meeting
  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Calculate actual duration
  IF v_meeting.started_at IS NOT NULL THEN
    v_actual_duration := EXTRACT(EPOCH FROM (now() - v_meeting.started_at)) / 60;
  ELSE
    v_actual_duration := v_meeting.duration_minutes;
  END IF;
  
  -- Update meeting as completed
  UPDATE eos_meetings SET
    status = 'closed',
    is_complete = TRUE,
    completed_at = now(),
    closed_at = now(),
    actual_duration_minutes = v_actual_duration,
    updated_at = now()
  WHERE id = p_meeting_id;
  
  -- Log audit event
  INSERT INTO audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (
    v_meeting.tenant_id,
    'meeting',
    p_meeting_id::TEXT,
    'meeting_instance_completed',
    auth.uid(),
    jsonb_build_object(
      'actual_duration_minutes', v_actual_duration,
      'started_at', v_meeting.started_at,
      'completed_at', now()
    )
  );
  
  RETURN TRUE;
END;
$$;

-- Step 8: View for upcoming meetings
CREATE OR REPLACE VIEW public.eos_upcoming_meetings AS
SELECT 
  m.*,
  s.recurrence_type,
  s.is_active as series_is_active
FROM eos_meetings m
LEFT JOIN eos_meeting_series s ON m.series_id = s.id
WHERE m.status IN ('scheduled', 'in_progress')
  AND m.scheduled_date >= CURRENT_DATE
ORDER BY m.scheduled_date ASC;

-- Step 9: View for past meetings
CREATE OR REPLACE VIEW public.eos_past_meetings AS
SELECT 
  m.*,
  s.recurrence_type,
  s.title as series_title
FROM eos_meetings m
LEFT JOIN eos_meeting_series s ON m.series_id = s.id
WHERE m.status IN ('closed', 'completed', 'cancelled')
   OR (m.status = 'scheduled' AND m.scheduled_date < CURRENT_DATE)
ORDER BY m.scheduled_date DESC;

-- Step 10: Migration - Link existing meetings to series where recurrence exists
-- Create series from existing recurrences
DO $$
DECLARE
  r RECORD;
  v_series_id UUID;
BEGIN
  FOR r IN 
    SELECT DISTINCT ON (mr.meeting_id)
      mr.meeting_id,
      mr.tenant_id,
      mr.recurrence_type,
      m.meeting_type,
      m.title,
      m.duration_minutes,
      m.location,
      m.template_id,
      m.template_version_id,
      m.created_by,
      DATE(mr.start_date) as start_date,
      mr.start_date::TIME as start_time
    FROM eos_meeting_recurrences mr
    JOIN eos_meetings m ON mr.meeting_id = m.id
    WHERE NOT EXISTS (
      SELECT 1 FROM eos_meeting_series WHERE id = mr.meeting_id
    )
  LOOP
    -- Create series
    INSERT INTO eos_meeting_series (
      tenant_id,
      meeting_type,
      title,
      recurrence_type,
      start_date,
      start_time,
      duration_minutes,
      location,
      agenda_template_id,
      agenda_template_version_id,
      created_by
    ) VALUES (
      r.tenant_id,
      r.meeting_type,
      r.title,
      r.recurrence_type,
      r.start_date,
      COALESCE(r.start_time, '09:00'),
      COALESCE(r.duration_minutes, 90),
      r.location,
      r.template_id,
      r.template_version_id,
      r.created_by
    )
    RETURNING id INTO v_series_id;
    
    -- Link the base meeting
    UPDATE eos_meetings SET series_id = v_series_id WHERE id = r.meeting_id;
    
    -- Link occurrences
    UPDATE eos_meetings m SET series_id = v_series_id
    FROM eos_meeting_occurrences o
    WHERE o.meeting_id = m.id
      AND o.recurrence_id IN (
        SELECT mr.id FROM eos_meeting_recurrences mr WHERE mr.meeting_id = r.meeting_id
      );
  END LOOP;
END;
$$;

-- Grant permissions
GRANT SELECT ON public.eos_upcoming_meetings TO authenticated;
GRANT SELECT ON public.eos_past_meetings TO authenticated;