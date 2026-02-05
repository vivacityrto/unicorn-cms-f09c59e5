-- ============================================================================
-- Fix Vivacity-only access for EOS Meetings
-- Resolves "function is not unique" RLS error
-- ============================================================================
-- This migration:
-- 1. Creates is_vivacity_team_v2(uuid) with NO DEFAULT (no ambiguity)
-- 2. Updates EOS meeting-related RLS policies to use v2
-- 3. Resets L10 meeting participants to correct Vivacity Team members
-- ============================================================================

-- ============================================================================
-- 1. Create is_vivacity_team_v2 with NO DEFAULT parameter
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_vivacity_team_v2(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.user_uuid = p_user_id
      AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived IS DISTINCT FROM true
  );
$$;

COMMENT ON FUNCTION public.is_vivacity_team_v2(uuid) IS 
'Checks if user is active Vivacity Team member. NO DEFAULT parameter to avoid RLS ambiguity. Verifies user exists in auth.users.';

-- ============================================================================
-- 2. Fix EOS Meetings RLS policies
-- ============================================================================

-- 2a. Drop and recreate the problematic L10 policy
DROP POLICY IF EXISTS "vivacity_team_can_view_level_10_meetings" ON public.eos_meetings;

CREATE POLICY "vivacity_team_can_view_level_10_meetings"
ON public.eos_meetings
FOR SELECT
TO authenticated
USING (
  (meeting_type::text = 'L10')
  AND public.is_vivacity_team_v2(auth.uid())
);

-- 2b. Add/update policy for L10 meeting participants visibility
DROP POLICY IF EXISTS "Vivacity team can view L10 participants" ON public.eos_meeting_participants;

CREATE POLICY "Vivacity team can view L10 participants"
ON public.eos_meeting_participants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM eos_meetings m
    WHERE m.id = eos_meeting_participants.meeting_id
    AND m.meeting_type::text = 'L10'
    AND public.is_vivacity_team_v2(auth.uid())
  )
);

-- 2c. Add policy for Vivacity team to manage L10 participants
DROP POLICY IF EXISTS "Vivacity team can manage L10 participants" ON public.eos_meeting_participants;

CREATE POLICY "Vivacity team can manage L10 participants"
ON public.eos_meeting_participants
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM eos_meetings m
    WHERE m.id = eos_meeting_participants.meeting_id
    AND m.meeting_type::text = 'L10'
    AND public.is_vivacity_team_v2(auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM eos_meetings m
    WHERE m.id = eos_meeting_participants.meeting_id
    AND m.meeting_type::text = 'L10'
    AND public.is_vivacity_team_v2(auth.uid())
  )
);

-- ============================================================================
-- 3. Reset L10 meeting participants to correct Vivacity Team members
-- ============================================================================

-- 3a. Delete existing participants for L10 meetings
DELETE FROM public.eos_meeting_participants
WHERE meeting_id IN (
  SELECT id FROM public.eos_meetings
  WHERE meeting_type::text = 'L10'
);

-- 3b. Insert correct Vivacity Team participants for all L10 meetings
INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
SELECT 
  m.id as meeting_id,
  au.id as user_id,
  'Member'::eos_participant_role as role
FROM public.eos_meetings m
CROSS JOIN public.users u
INNER JOIN auth.users au ON au.id = u.user_uuid
WHERE m.meeting_type::text = 'L10'
  AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  AND u.archived IS DISTINCT FROM true
ON CONFLICT (meeting_id, user_id) DO NOTHING;

-- ============================================================================
-- 4. Update create_meeting_from_template to use v2 logic inline
-- ============================================================================

-- First overload (used by MeetingScheduler UI)
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
  v_is_level10 := (v_template.meeting_type::text = 'L10');
  
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
  
  -- Add facilitator (Leader role)
  IF p_facilitator_id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_facilitator_id, 'Leader'::eos_participant_role)
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  -- Add scribe (Member role)
  IF p_scribe_id IS NOT NULL AND p_scribe_id IS DISTINCT FROM p_facilitator_id THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_scribe_id, 'Member'::eos_participant_role)
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  -- For L10 meetings: auto-add ALL active Vivacity Team users with auth accounts
  IF v_is_level10 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, au.id, 'Member'::eos_participant_role
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived IS DISTINCT FROM true
      AND au.id IS DISTINCT FROM p_facilitator_id
      AND au.id IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
    
    SELECT count(*) INTO v_participant_count 
    FROM public.eos_meeting_participants 
    WHERE meeting_id = v_meeting_id;
    
    RAISE NOTICE 'L10 meeting % created with % participants', v_meeting_id, v_participant_count;
  ELSIF array_length(p_participant_ids, 1) > 0 THEN
    -- For non-L10: use provided participant list
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

-- Second overload
CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_template_id uuid,
  p_scheduled_date timestamp with time zone,
  p_scheduled_end_time timestamp with time zone,
  p_facilitator_id uuid,
  p_scribe_id uuid,
  p_location text DEFAULT NULL,
  p_participant_ids uuid[] DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_series_id uuid DEFAULT NULL,
  p_tenant_id bigint DEFAULT NULL
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
BEGIN
  SELECT name, template_type::text, duration_minutes, agenda, tenant_id,
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
  v_is_level10 := (v_meeting_type = 'L10');
  
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
    SELECT v_meeting_id, au.id, 'Member'::eos_participant_role
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived IS DISTINCT FROM true
      AND au.id IS DISTINCT FROM p_facilitator_id
      AND au.id IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
    
    SELECT COUNT(*) INTO v_participant_count
    FROM public.eos_meeting_participants
    WHERE meeting_id = v_meeting_id;
    
    RAISE NOTICE 'L10 meeting % created with % participants', v_meeting_id, v_participant_count;
  ELSE
    IF p_participant_ids IS NOT NULL AND array_length(p_participant_ids, 1) > 0 THEN
      INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
      SELECT v_meeting_id, pid, 'Member'::eos_participant_role
      FROM unnest(p_participant_ids) AS pid
      WHERE pid IS DISTINCT FROM p_facilitator_id
        AND pid IS DISTINCT FROM p_scribe_id
      ON CONFLICT (meeting_id, user_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN v_meeting_id;
END;
$$;

-- ============================================================================
-- 5. Update sync function to use correct logic
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_l10_meeting_participants(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_type text;
  v_added_count integer := 0;
  v_total_count integer := 0;
BEGIN
  SELECT meeting_type::text INTO v_meeting_type
  FROM eos_meetings
  WHERE id = p_meeting_id;
  
  IF v_meeting_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;
  
  IF v_meeting_type != 'L10' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an L10 meeting');
  END IF;
  
  WITH inserted AS (
    INSERT INTO eos_meeting_participants (meeting_id, user_id, role)
    SELECT p_meeting_id, au.id, 'Member'::eos_participant_role
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived IS DISTINCT FROM true
    ON CONFLICT (meeting_id, user_id) DO NOTHING
    RETURNING user_id
  )
  SELECT count(*) INTO v_added_count FROM inserted;
  
  SELECT count(*) INTO v_total_count
  FROM eos_meeting_participants
  WHERE meeting_id = p_meeting_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'meeting_id', p_meeting_id,
    'added_count', v_added_count,
    'total_count', v_total_count
  );
END;
$$;