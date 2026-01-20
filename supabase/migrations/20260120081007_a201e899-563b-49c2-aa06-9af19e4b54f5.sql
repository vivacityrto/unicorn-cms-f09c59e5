-- Fix create_meeting_from_template to use correct JSON field name
-- Template segments use "name" not "segment_name"

CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_tenant_id INT,
  p_agenda_template_id UUID,
  p_title TEXT,
  p_scheduled_date TIMESTAMPTZ,
  p_duration_minutes INT,
  p_facilitator_id UUID DEFAULT NULL,
  p_scribe_id UUID DEFAULT NULL,
  p_participant_ids UUID[] DEFAULT '{}'
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
BEGIN
  -- Fetch template with version
  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_agenda_template_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  
  -- Create the meeting with template reference
  INSERT INTO public.eos_meetings (
    tenant_id,
    meeting_type,
    title,
    scheduled_date,
    duration_minutes,
    template_id,
    template_version_id,
    created_by
  ) VALUES (
    p_tenant_id,
    v_template.meeting_type,
    p_title,
    p_scheduled_date,
    p_duration_minutes,
    p_agenda_template_id,
    v_template.current_version_id,
    auth.uid()
  ) RETURNING id INTO v_meeting_id;
  
  -- Create meeting segments from template
  -- Handle both "name" and "segment_name" for backwards compatibility
  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    -- Try "name" first (current format), fall back to "segment_name" (legacy)
    v_segment_name := COALESCE(v_segment->>'name', v_segment->>'segment_name');
    
    IF v_segment_name IS NULL THEN
      RAISE EXCEPTION 'Segment name is required but was null';
    END IF;
    
    INSERT INTO public.eos_meeting_segments (
      meeting_id,
      segment_name,
      duration_minutes,
      sequence_order
    ) VALUES (
      v_meeting_id,
      v_segment_name,
      (v_segment->>'duration_minutes')::INT,
      v_sequence
    );
    
    v_total_duration := v_total_duration + (v_segment->>'duration_minutes')::INT;
    v_sequence := v_sequence + 1;
  END LOOP;
  
  -- Update duration if calculated is different
  IF v_total_duration != p_duration_minutes THEN
    UPDATE public.eos_meetings
    SET duration_minutes = v_total_duration
    WHERE id = v_meeting_id;
  END IF;
  
  -- Add participants if provided
  IF p_facilitator_id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_facilitator_id, 'facilitator')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  IF p_scribe_id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_scribe_id, 'scribe')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  IF array_length(p_participant_ids, 1) > 0 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, unnest(p_participant_ids), 'participant'
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  RETURN v_meeting_id;
END;
$$;