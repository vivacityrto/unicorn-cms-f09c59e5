-- Auth Account Enforcement for Vivacity Team Users (Fixed version)
-- This migration:
-- 1. Creates has_auth_account() helper function
-- 2. Creates sync_l10_meeting_participants() function for resyncing
-- 3. Updates create_meeting_from_template to filter L10 participants by auth account existence
-- 4. Archives orphan Vivacity Team users without auth accounts
-- 5. Syncs existing L10 meetings

-- ============================================================================
-- 1. Create has_auth_account helper function (if not exists from partial run)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.has_auth_account(p_user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users WHERE id = p_user_uuid
  );
END;
$$;

COMMENT ON FUNCTION public.has_auth_account(uuid) IS 
'Checks if a user UUID has a corresponding auth.users record. SECURITY DEFINER to allow cross-schema lookup.';

-- ============================================================================
-- 2. Create/Replace sync_l10_meeting_participants function with explicit casts
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
  v_existing_count integer;
  v_total_team_count integer;
BEGIN
  -- Get the meeting type (cast to text for ILIKE comparison)
  SELECT meeting_type::text INTO v_meeting_type
  FROM public.eos_meetings
  WHERE id = p_meeting_id;
  
  IF v_meeting_type IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Meeting not found',
      'meeting_id', p_meeting_id
    );
  END IF;
  
  -- Check if this is an L10 meeting
  IF NOT (v_meeting_type ILIKE '%L10%' OR v_meeting_type ILIKE '%level%10%' OR v_meeting_type ILIKE '%level_10%') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not an L10 meeting',
      'meeting_id', p_meeting_id,
      'meeting_type', v_meeting_type
    );
  END IF;
  
  -- Get existing participant count
  SELECT COUNT(*) INTO v_existing_count
  FROM public.eos_meeting_participants
  WHERE meeting_id = p_meeting_id;
  
  -- Get total Vivacity Team count with auth accounts
  SELECT COUNT(*) INTO v_total_team_count
  FROM public.users u
  WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    AND u.archived = false
    AND u.user_uuid IS NOT NULL
    AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.user_uuid);
  
  -- Insert missing Vivacity Team members (with auth accounts only)
  WITH inserted AS (
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT p_meeting_id, u.user_uuid, 'participant'
    FROM public.users u
    WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived = false
      AND u.user_uuid IS NOT NULL
      AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.user_uuid)
    ON CONFLICT (meeting_id, user_id) DO NOTHING
    RETURNING user_id
  )
  SELECT COUNT(*) INTO v_added_count FROM inserted;
  
  RAISE NOTICE 'L10 meeting % sync: added % participants (existing: %, total team: %)',
    p_meeting_id, v_added_count, v_existing_count, v_total_team_count;
  
  RETURN jsonb_build_object(
    'success', true,
    'meeting_id', p_meeting_id,
    'meeting_type', v_meeting_type,
    'added_count', v_added_count,
    'existing_count', v_existing_count,
    'total_team_count', v_total_team_count
  );
END;
$$;

COMMENT ON FUNCTION public.sync_l10_meeting_participants(uuid) IS 
'Adds any missing Vivacity Team users (with valid auth accounts) to an L10 meeting. Does not remove existing participants.';

-- ============================================================================
-- 3. Update create_meeting_from_template with explicit type casts
-- ============================================================================
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
  
  -- Insert facilitator as participant
  INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
  VALUES (v_meeting_id, p_facilitator_id, 'facilitator')
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
  
  -- Insert scribe as participant (if different from facilitator)
  IF p_scribe_id IS DISTINCT FROM p_facilitator_id THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_scribe_id, 'scribe')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  -- For L10 meetings: auto-add ALL active Vivacity Team members with valid auth accounts
  -- This ignores any passed participant_ids for L10 meetings
  IF v_is_level10 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, u.user_uuid, 'participant'
    FROM public.users u
    WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived = false
      AND u.user_uuid IS NOT NULL
      AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.user_uuid)
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
      SELECT v_meeting_id, pid, 'participant'
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

-- ============================================================================
-- 4. Archive orphan Vivacity Team users (users without auth accounts)
-- ============================================================================
-- First, let's identify them for audit purposes
DO $$
DECLARE
  v_orphan_count integer;
  v_orphan_emails text;
BEGIN
  SELECT COUNT(*), string_agg(email, ', ')
  INTO v_orphan_count, v_orphan_emails
  FROM public.users u
  WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    AND u.archived = false
    AND (u.user_uuid IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.user_uuid));
  
  RAISE NOTICE 'Found % orphan Vivacity Team users to archive: %', v_orphan_count, v_orphan_emails;
END;
$$;

-- Archive the orphan users
UPDATE public.users
SET archived = true, updated_at = now()
WHERE unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  AND archived = false
  AND (user_uuid IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = user_uuid));

-- ============================================================================
-- 5. Sync existing L10 meetings to ensure all team members are participants
-- ============================================================================
DO $$
DECLARE
  v_meeting_record RECORD;
  v_result jsonb;
BEGIN
  FOR v_meeting_record IN
    SELECT id, title, meeting_type::text as meeting_type_text
    FROM public.eos_meetings
    WHERE (meeting_type::text ILIKE '%L10%' OR meeting_type::text ILIKE '%level%10%')
      AND status = 'scheduled'
      AND scheduled_date >= now()
  LOOP
    v_result := public.sync_l10_meeting_participants(v_meeting_record.id);
    RAISE NOTICE 'Synced meeting %: %', v_meeting_record.title, v_result;
  END LOOP;
END;
$$;