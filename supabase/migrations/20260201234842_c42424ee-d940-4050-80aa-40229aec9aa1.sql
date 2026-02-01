-- Fix apply_template_to_meeting to handle both old (name/duration) and new (segment_name/duration_minutes) key formats
CREATE OR REPLACE FUNCTION public.apply_template_to_meeting(
  p_meeting_id UUID,
  p_template_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_segment JSONB;
  v_sequence INT := 1;
  v_total_duration INT := 0;
  v_segment_name TEXT;
  v_duration INT;
BEGIN
  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  DELETE FROM public.eos_meeting_segments
  WHERE meeting_id = p_meeting_id;

  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    -- Handle both old (name/duration) and new (segment_name/duration_minutes) keys
    v_segment_name := COALESCE(v_segment->>'segment_name', v_segment->>'name');
    v_duration := COALESCE(
      (v_segment->>'duration_minutes')::INT, 
      (v_segment->>'duration')::INT
    );
    
    INSERT INTO public.eos_meeting_segments (
      meeting_id, segment_name, duration_minutes, sequence_order
    ) VALUES (
      p_meeting_id, v_segment_name, v_duration, v_sequence
    );
    
    v_total_duration := v_total_duration + v_duration;
    v_sequence := v_sequence + 1;
  END LOOP;

  UPDATE public.eos_meetings
  SET duration_minutes = v_total_duration,
      template_id = p_template_id,
      template_version_id = v_template.current_version_id,
      updated_at = NOW()
  WHERE id = p_meeting_id;
END;
$$;

-- Fix create_meeting_from_template to handle both key formats
CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_tenant_id INT,
  p_title TEXT,
  p_meeting_type TEXT,
  p_scheduled_at TIMESTAMPTZ,
  p_template_id UUID,
  p_created_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_id UUID;
  v_template RECORD;
  v_segment JSONB;
  v_sequence INT := 1;
  v_total_duration INT := 0;
  v_segment_name TEXT;
  v_duration INT;
BEGIN
  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  -- Calculate total duration from segments
  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    v_total_duration := v_total_duration + COALESCE(
      (v_segment->>'duration_minutes')::INT, 
      (v_segment->>'duration')::INT,
      0
    );
  END LOOP;

  -- Create the meeting
  INSERT INTO public.eos_meetings (
    tenant_id, title, meeting_type, scheduled_at, duration_minutes,
    template_id, template_version_id, status, created_by
  ) VALUES (
    p_tenant_id, p_title, p_meeting_type, p_scheduled_at, v_total_duration,
    p_template_id, v_template.current_version_id, 'scheduled', p_created_by
  )
  RETURNING id INTO v_meeting_id;

  -- Create segments from template
  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    -- Handle both old (name/duration) and new (segment_name/duration_minutes) keys
    v_segment_name := COALESCE(v_segment->>'segment_name', v_segment->>'name');
    v_duration := COALESCE(
      (v_segment->>'duration_minutes')::INT, 
      (v_segment->>'duration')::INT
    );
    
    INSERT INTO public.eos_meeting_segments (
      meeting_id, segment_name, duration_minutes, sequence_order
    ) VALUES (
      v_meeting_id, v_segment_name, v_duration, v_sequence
    );
    
    v_sequence := v_sequence + 1;
  END LOOP;

  RETURN v_meeting_id;
END;
$$;