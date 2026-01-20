-- Create RPC function to apply a template to an existing meeting
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
BEGIN
  -- Fetch the template
  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  -- Delete existing segments for this meeting
  DELETE FROM public.eos_meeting_segments
  WHERE meeting_id = p_meeting_id;

  -- Insert new segments from template
  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    INSERT INTO public.eos_meeting_segments (
      meeting_id,
      segment_name,
      duration_minutes,
      sequence_order,
      started_at,
      completed_at
    ) VALUES (
      p_meeting_id,
      v_segment->>'segment_name',
      (v_segment->>'duration_minutes')::INT,
      v_sequence,
      NULL,
      NULL
    );
    
    v_total_duration := v_total_duration + (v_segment->>'duration_minutes')::INT;
    v_sequence := v_sequence + 1;
  END LOOP;

  -- Update meeting duration to match template total
  UPDATE public.eos_meetings
  SET duration_minutes = v_total_duration,
      updated_at = NOW()
  WHERE id = p_meeting_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.apply_template_to_meeting(UUID, UUID) TO authenticated;