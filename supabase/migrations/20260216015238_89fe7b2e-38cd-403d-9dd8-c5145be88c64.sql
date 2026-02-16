
-- ============================================================================
-- Fix 1: seed_meeting_attendees_from_roles - pull from participants FIRST
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_meeting_attendees_from_roles(p_meeting_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_inserted_count integer := 0;
  v_participant_count integer := 0;
  v_vivacity_count integer := 0;
BEGIN
  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  
  IF v_meeting IS NULL THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  -- STEP 1 (NEW): Copy from eos_meeting_participants first (the scheduling roster)
  INSERT INTO public.eos_meeting_attendees (
    meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at
  )
  SELECT
    p_meeting_id,
    mp.user_id,
    CASE mp.role::text
      WHEN 'Leader' THEN 'owner'::meeting_role
      ELSE 'attendee'::meeting_role
    END,
    'invited'::meeting_attendance_status,
    NOW(),
    NOW()
  FROM public.eos_meeting_participants mp
  WHERE mp.meeting_id = p_meeting_id
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = mp.user_id
    )
  ON CONFLICT (meeting_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_participant_count = ROW_COUNT;

  -- STEP 2: Insert from eos_user_roles (existing behavior, fills any gaps)
  INSERT INTO public.eos_meeting_attendees (
    meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at
  )
  SELECT
    p_meeting_id,
    ur.user_id,
    CASE ur.role
      WHEN 'visionary' THEN 'visionary'::meeting_role
      WHEN 'integrator' THEN 'integrator'::meeting_role
      ELSE 'core_team'::meeting_role
    END,
    'invited'::meeting_attendance_status,
    NOW(),
    NOW()
  FROM public.eos_user_roles ur
  WHERE ur.tenant_id = v_meeting.tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = ur.user_id
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  -- STEP 3: Insert remaining Vivacity staff not yet covered
  INSERT INTO public.eos_meeting_attendees (
    meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at
  )
  SELECT
    p_meeting_id,
    u.user_uuid,
    'core_team'::meeting_role,
    'invited'::meeting_attendance_status,
    NOW(),
    NOW()
  FROM public.users u
  WHERE u.user_type = 'Vivacity Team'
    AND u.disabled IS NOT TRUE
    AND u.archived IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = u.user_uuid
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_vivacity_count = ROW_COUNT;

  RETURN v_participant_count + v_inserted_count + v_vivacity_count;
END;
$$;

-- ============================================================================
-- Fix 2: create_meeting_from_template (overload 1) - fix segment_name null
-- Template segments use 'name' and 'duration', not 'segment_name' and 'duration_minutes'
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
  v_seg_name TEXT;
  v_seg_duration INT;
BEGIN
  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_agenda_template_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  
  v_is_level10 := (v_template.meeting_type::text ILIKE '%L10%' OR v_template.meeting_type::text ILIKE '%level%10%');
  
  INSERT INTO public.eos_meetings (
    tenant_id, meeting_type, title, scheduled_date, duration_minutes,
    template_id, template_version_id, created_by
  ) VALUES (
    p_tenant_id, v_template.meeting_type, p_title, p_scheduled_date,
    p_duration_minutes, p_agenda_template_id, v_template.current_version_id, auth.uid()
  ) RETURNING id INTO v_meeting_id;
  
  -- Create meeting segments - handle both JSON key formats
  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    -- Templates use 'name'/'duration', migrations use 'segment_name'/'duration_minutes'
    v_seg_name := COALESCE(v_segment->>'segment_name', v_segment->>'name', 'Untitled Segment');
    v_seg_duration := COALESCE(
      (v_segment->>'duration_minutes')::INT,
      (v_segment->>'duration')::INT,
      5
    );
    
    INSERT INTO public.eos_meeting_segments (
      meeting_id, segment_name, duration_minutes, sequence_order
    ) VALUES (
      v_meeting_id, v_seg_name, v_seg_duration, v_sequence
    );
    
    v_total_duration := v_total_duration + v_seg_duration;
    v_sequence := v_sequence + 1;
  END LOOP;
  
  IF v_total_duration != p_duration_minutes THEN
    UPDATE public.eos_meetings SET duration_minutes = v_total_duration WHERE id = v_meeting_id;
  END IF;
  
  IF p_facilitator_id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_facilitator_id, 'Leader'::eos_participant_role)
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  IF p_scribe_id IS NOT NULL AND p_scribe_id IS DISTINCT FROM p_facilitator_id THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_scribe_id, 'Member'::eos_participant_role)
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  IF v_is_level10 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, u.user_uuid, 'Member'::eos_participant_role
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.archived = false
      AND u.unicorn_role::text IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.user_uuid IS NOT NULL
      AND u.user_uuid IS DISTINCT FROM p_facilitator_id
      AND u.user_uuid IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  ELSIF array_length(p_participant_ids, 1) > 0 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, pid, 'Member'::eos_participant_role
    FROM unnest(p_participant_ids) AS pid
    WHERE pid IS DISTINCT FROM p_facilitator_id AND pid IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  -- AUTO-SEED attendees from participants right away
  PERFORM seed_meeting_attendees_from_roles(v_meeting_id);
  
  RETURN v_meeting_id;
END;
$$;

COMMENT ON FUNCTION public.create_meeting_from_template(bigint, uuid, text, timestamptz, integer, uuid, uuid, uuid[]) IS 
'Creates a meeting from template. Handles both name/duration and segment_name/duration_minutes JSON keys. Auto-seeds attendees from participants.';

-- ============================================================================
-- Fix 3: create_meeting_from_template (overload 2) - same segment_name fix + auto-seed
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
  v_segment jsonb;
  v_sequence integer := 1;
  v_seg_name text;
  v_seg_duration integer;
BEGIN
  SELECT template_name, template_type::text, duration_minutes, segments, tenant_id,
         COALESCE(meeting_scope, 'tenant')
  INTO v_template_name, v_template_type, v_duration_minutes, v_agenda_json, v_tenant_id, v_meeting_scope
  FROM public.eos_agenda_templates
  WHERE id = p_template_id;
  
  IF v_template_name IS NULL THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;
  
  IF p_tenant_id IS NOT NULL THEN
    v_tenant_id := p_tenant_id;
  END IF;
  
  v_meeting_type := COALESCE(v_template_type, v_template_name);
  v_is_level10 := (v_meeting_type ILIKE '%L10%' OR v_meeting_type ILIKE '%level%10%' OR v_template_name ILIKE '%level%10%');
  
  INSERT INTO public.eos_meetings (
    tenant_id, template_id, title, meeting_type, meeting_scope,
    scheduled_date, scheduled_end_time, duration_minutes,
    facilitator_id, scribe_id, location, agenda, status, series_id
  ) VALUES (
    v_tenant_id, p_template_id,
    COALESCE(p_title, v_template_name || ' - ' || to_char(p_scheduled_date, 'YYYY-MM-DD')),
    v_meeting_type::eos_meeting_type, v_meeting_scope,
    p_scheduled_date, p_scheduled_end_time, v_duration_minutes,
    p_facilitator_id, p_scribe_id, p_location, v_agenda_json, 'scheduled', p_series_id
  )
  RETURNING id INTO v_meeting_id;
  
  -- Create segments with COALESCE to handle both key formats
  IF v_agenda_json IS NOT NULL AND jsonb_array_length(v_agenda_json) > 0 THEN
    FOR v_segment IN SELECT * FROM jsonb_array_elements(v_agenda_json)
    LOOP
      v_seg_name := COALESCE(v_segment->>'segment_name', v_segment->>'name', 'Untitled Segment');
      v_seg_duration := COALESCE(
        (v_segment->>'duration_minutes')::INT,
        (v_segment->>'duration')::INT,
        5
      );
      
      INSERT INTO public.eos_meeting_segments (
        meeting_id, segment_name, duration_minutes, sequence_order
      ) VALUES (
        v_meeting_id, v_seg_name, v_seg_duration, v_sequence
      );
      v_sequence := v_sequence + 1;
    END LOOP;
  END IF;
  
  -- Add facilitator
  INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
  VALUES (v_meeting_id, p_facilitator_id, 'Leader'::eos_participant_role)
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
  
  IF p_scribe_id IS DISTINCT FROM p_facilitator_id THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_scribe_id, 'Member'::eos_participant_role)
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
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
  ELSE
    IF p_participant_ids IS NOT NULL AND array_length(p_participant_ids, 1) > 0 THEN
      INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
      SELECT v_meeting_id, pid, 'Member'::eos_participant_role
      FROM unnest(p_participant_ids) AS pid
      WHERE pid IS DISTINCT FROM p_facilitator_id AND pid IS DISTINCT FROM p_scribe_id
      ON CONFLICT (meeting_id, user_id) DO NOTHING;
    END IF;
  END IF;
  
  -- AUTO-SEED attendees from participants right away
  PERFORM seed_meeting_attendees_from_roles(v_meeting_id);
  
  RETURN v_meeting_id;
END;
$$;

COMMENT ON FUNCTION public.create_meeting_from_template(uuid, timestamp with time zone, timestamp with time zone, uuid, uuid, text, uuid[], text, uuid, bigint) IS 
'Creates a meeting from a template. Handles both name/duration and segment_name/duration_minutes JSON keys. Auto-seeds attendees.';
