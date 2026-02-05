
-- Auto-add Vivacity Team users as participants for Level 10 meetings
-- Updates create_meeting_from_template to auto-populate participants for L10 meetings

CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_tenant_id bigint, 
  p_agenda_template_id uuid, 
  p_title text, 
  p_scheduled_date timestamp with time zone, 
  p_duration_minutes integer, 
  p_facilitator_id uuid, 
  p_scribe_id uuid DEFAULT NULL::uuid, 
  p_participant_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting_id UUID;
  v_template RECORD;
  v_segment JSONB;
  v_sequence INT := 1;
  v_total_duration INT := 0;
  v_is_level10 BOOLEAN := false;
BEGIN
  -- Fetch template with version
  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_agenda_template_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  
  -- Check if this is a Level 10 meeting type
  v_is_level10 := (v_template.meeting_type::text ILIKE '%L10%' OR v_template.meeting_type::text ILIKE '%level%10%');
  
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
  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    INSERT INTO public.eos_meeting_segments (
      meeting_id,
      segment_name,
      duration_minutes,
      sequence_order
    ) VALUES (
      v_meeting_id,
      v_segment->>'segment_name',
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
  
  -- Add facilitator
  IF p_facilitator_id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_facilitator_id, 'facilitator')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  -- Add scribe
  IF p_scribe_id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_scribe_id, 'scribe')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  -- For Level 10 meetings: auto-add ALL active Vivacity Team users as participants
  -- For other meetings: use the provided participant list
  IF v_is_level10 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, u.user_uuid, 'participant'
    FROM public.users u
    WHERE u.archived = false
      AND u.unicorn_role::text IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.user_uuid IS NOT NULL
      -- Exclude facilitator and scribe (already added above)
      AND u.user_uuid IS DISTINCT FROM p_facilitator_id
      AND u.user_uuid IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  ELSIF array_length(p_participant_ids, 1) > 0 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, unnest(p_participant_ids), 'participant'
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  RETURN v_meeting_id;
END;
$function$;

-- Add comment for documentation
COMMENT ON FUNCTION public.create_meeting_from_template(bigint, uuid, text, timestamp with time zone, integer, uuid, uuid, uuid[]) IS 
'Creates a meeting from template. For Level 10 (L10) meetings, automatically adds all active Vivacity Team users as participants regardless of p_participant_ids. For other meeting types, uses the provided participant list.';
