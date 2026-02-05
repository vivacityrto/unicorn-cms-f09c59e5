-- ============================================================================
-- Fix create_meeting_from_template to use correct role enum values
-- and ensure auth.users join for L10 participant inserts
-- ============================================================================

-- ============================================================================
-- 1. Fix the first overload (used by MeetingScheduler UI)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_tenant_id BIGINT,
  p_agenda_template_id UUID,
  p_title TEXT,
  p_scheduled_date TIMESTAMPTZ,
  p_duration_minutes INTEGER,
  p_facilitator_id UUID,
  p_scribe_id UUID DEFAULT NULL,
  p_participant_ids UUID[] DEFAULT '{}'::UUID[]
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
  v_is_level10 BOOLEAN := false;
  v_participant_count INT := 0;
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
  
  -- Add facilitator (using correct enum value 'Leader')
  IF p_facilitator_id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_facilitator_id, 'Leader'::eos_participant_role)
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  -- Add scribe (using 'Member' role)
  IF p_scribe_id IS NOT NULL AND p_scribe_id IS DISTINCT FROM p_facilitator_id THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_scribe_id, 'Member'::eos_participant_role)
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  -- For Level 10 meetings: auto-add ALL active Vivacity Team users with auth accounts
  -- For other meetings: use the provided participant list
  IF v_is_level10 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, u.user_uuid, 'Member'::eos_participant_role
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.archived = false
      AND u.unicorn_role::text IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.user_uuid IS NOT NULL
      -- Exclude facilitator and scribe (already added above)
      AND u.user_uuid IS DISTINCT FROM p_facilitator_id
      AND u.user_uuid IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
    
    -- Log participant count
    SELECT count(*) INTO v_participant_count 
    FROM public.eos_meeting_participants 
    WHERE meeting_id = v_meeting_id;
    
    RAISE NOTICE 'L10 meeting % created with % participants (auto-populated from Vivacity Team with auth accounts)',
      v_meeting_id, v_participant_count;
  ELSIF array_length(p_participant_ids, 1) > 0 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, pid, 'Member'::eos_participant_role
    FROM unnest(p_participant_ids) AS pid
    WHERE pid IS DISTINCT FROM p_facilitator_id
      AND pid IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  RETURN v_meeting_id;
END;
$$;

COMMENT ON FUNCTION public.create_meeting_from_template(bigint, uuid, text, timestamptz, integer, uuid, uuid, uuid[]) IS 
'Creates a meeting from template. For L10 meetings, auto-adds all active Vivacity Team members with valid auth accounts as participants. Uses correct enum values: Leader for facilitator, Member for all others.';

-- ============================================================================
-- 2. Fix the second overload (p_template_id version)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_template_id uuid,
  p_scheduled_date timestamp with time zone,
  p_scheduled_end_time timestamp with time zone,
  p_facilitator_id uuid,
  p_scribe_id uuid,
  p_location text DEFAULT NULL::text,
  p_participant_ids uuid[] DEFAULT NULL::uuid[],
  p_title text DEFAULT NULL::text,
  p_series_id uuid DEFAULT NULL::uuid,
  p_tenant_id bigint DEFAULT NULL::bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_id uuid;
  v_template_name text;
  v_template_type text;
  v_meeting_type text;
  v_meeting_scope text;
  v_duration_minutes integer;
  v_agenda_json jsonb;
  v_tenant_id bigint;
  v_is_level10 boolean := false;
  v_participant_count integer := 0;
  v_team_participant_count integer := 0;
BEGIN
  -- Get template details (cast template_type to text)
  SELECT name, template_type::text, duration_minutes, agenda, tenant_id,
         COALESCE(meeting_scope, 'tenant')
  INTO v_template_name, v_template_type, v_duration_minutes, v_agenda_json, v_tenant_id, v_meeting_scope
  FROM public.eos_agenda_templates
  WHERE id = p_template_id;
  
  IF v_template_name IS NULL THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;
  
  -- Use provided tenant_id or fall back to template's tenant_id
  IF p_tenant_id IS NOT NULL THEN
    v_tenant_id := p_tenant_id;
  END IF;
  
  -- Determine meeting type from template
  v_meeting_type := COALESCE(v_template_type, v_template_name);
  
  -- Check if this is an L10 meeting (explicit text comparisons)
  v_is_level10 := (v_meeting_type ILIKE '%L10%' OR v_meeting_type ILIKE '%level%10%' OR v_template_name ILIKE '%level%10%');
  
  -- Create the meeting record
  INSERT INTO public.eos_meetings (
    tenant_id,
    template_id,
    title,
    meeting_type,
    meeting_scope,
    scheduled_date,
    scheduled_end_time,
    duration_minutes,
    facilitator_id,
    scribe_id,
    location,
    agenda,
    status,
    series_id
  ) VALUES (
    v_tenant_id,
    p_template_id,
    COALESCE(p_title, v_template_name || ' - ' || to_char(p_scheduled_date, 'YYYY-MM-DD')),
    v_meeting_type::eos_meeting_type,
    v_meeting_scope,
    p_scheduled_date,
    p_scheduled_end_time,
    v_duration_minutes,
    p_facilitator_id,
    p_scribe_id,
    p_location,
    v_agenda_json,
    'scheduled',
    p_series_id
  )
  RETURNING id INTO v_meeting_id;
  
  -- Insert facilitator as participant (Leader role)
  INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
  VALUES (v_meeting_id, p_facilitator_id, 'Leader'::eos_participant_role)
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
  
  -- Insert scribe as participant (if different from facilitator)
  IF p_scribe_id IS DISTINCT FROM p_facilitator_id THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_scribe_id, 'Member'::eos_participant_role)
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  -- For L10 meetings: auto-add ALL active Vivacity Team members with valid auth accounts
  -- This ignores any passed participant_ids for L10 meetings
  IF v_is_level10 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, u.user_uuid, 'Member'::eos_participant_role
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived = false
      AND u.user_uuid IS NOT NULL
      AND u.user_uuid IS DISTINCT FROM p_facilitator_id
      AND u.user_uuid IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
    
    -- Count how many team participants were added
    SELECT COUNT(*) INTO v_team_participant_count
    FROM public.eos_meeting_participants
    WHERE meeting_id = v_meeting_id;
    
    RAISE NOTICE 'L10 meeting % created with % total participants (auto-populated Vivacity Team with auth accounts)',
      v_meeting_id, v_team_participant_count;
  ELSE
    -- For non-L10 meetings: use provided participant list
    IF p_participant_ids IS NOT NULL AND array_length(p_participant_ids, 1) > 0 THEN
      INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
      SELECT v_meeting_id, pid, 'Member'::eos_participant_role
      FROM unnest(p_participant_ids) AS pid
      WHERE pid IS DISTINCT FROM p_facilitator_id
        AND pid IS DISTINCT FROM p_scribe_id
      ON CONFLICT (meeting_id, user_id) DO NOTHING;
    END IF;
  END IF;
  
  -- Get final participant count for logging
  SELECT COUNT(*) INTO v_participant_count
  FROM public.eos_meeting_participants
  WHERE meeting_id = v_meeting_id;
  
  RAISE NOTICE 'Meeting % created: type=%, is_l10=%, participants=%',
    v_meeting_id, v_meeting_type, v_is_level10, v_participant_count;
  
  RETURN v_meeting_id;
END;
$$;

COMMENT ON FUNCTION public.create_meeting_from_template(uuid, timestamp with time zone, timestamp with time zone, uuid, uuid, text, uuid[], text, uuid, bigint) IS 
'Creates a meeting from a template. For L10 meetings, automatically adds all active Vivacity Team members with valid auth accounts as participants, ignoring any passed participant list.';