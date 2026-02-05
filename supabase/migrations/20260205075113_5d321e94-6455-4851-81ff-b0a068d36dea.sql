-- ============================================================================
-- L10 Meeting Participant Management - Sync Functions
-- ============================================================================
-- Note: RLS policy was already created in the previous partial migration
-- This migration creates the sync functions with correct enum values
-- ============================================================================

-- ============================================================================
-- 1. Create/update sync function for L10 meeting participants
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_l10_meeting_participants(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_type text;
  v_is_l10 boolean;
  v_added_count integer := 0;
  v_total_count integer := 0;
  v_missing_auth_users jsonb := '[]'::jsonb;
BEGIN
  -- Get meeting type
  SELECT meeting_type::text INTO v_meeting_type
  FROM eos_meetings
  WHERE id = p_meeting_id;
  
  IF v_meeting_type IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Meeting not found'
    );
  END IF;
  
  -- Check if L10
  v_is_l10 := (v_meeting_type ILIKE '%L10%' OR v_meeting_type ILIKE '%level%10%');
  
  IF NOT v_is_l10 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not an L10 meeting'
    );
  END IF;
  
  -- Find Vivacity Team users missing auth accounts (for admin warning)
  SELECT jsonb_agg(jsonb_build_object('email', u.email, 'name', u.first_name || ' ' || u.last_name))
  INTO v_missing_auth_users
  FROM public.users u
  LEFT JOIN auth.users au ON au.id = u.user_uuid
  WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    AND u.archived IS DISTINCT FROM true
    AND au.id IS NULL;
  
  -- Insert missing Vivacity Team participants (only those with auth accounts)
  -- Use 'Member' role as per the eos_participant_role enum
  WITH inserted AS (
    INSERT INTO eos_meeting_participants (meeting_id, user_id, role)
    SELECT p_meeting_id, u.user_uuid, 'Member'::eos_participant_role
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived IS DISTINCT FROM true
      AND u.user_uuid IS NOT NULL
    ON CONFLICT (meeting_id, user_id) DO NOTHING
    RETURNING user_id
  )
  SELECT count(*) INTO v_added_count FROM inserted;
  
  -- Get total participant count
  SELECT count(*) INTO v_total_count
  FROM eos_meeting_participants
  WHERE meeting_id = p_meeting_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'meeting_id', p_meeting_id,
    'added_count', v_added_count,
    'total_count', v_total_count,
    'missing_auth_users', COALESCE(v_missing_auth_users, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.sync_l10_meeting_participants(uuid) IS 
'Syncs L10 meeting participants to include all active Vivacity Team members with valid auth accounts. Returns count of added participants and any users missing auth accounts.';

-- ============================================================================
-- 2. Create function to backfill all L10 meetings
-- ============================================================================

CREATE OR REPLACE FUNCTION public.backfill_l10_meeting_participants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_total_meetings integer := 0;
  v_total_added integer := 0;
BEGIN
  -- Loop through all L10 meetings
  FOR v_meeting IN
    SELECT id, title
    FROM eos_meetings
    WHERE meeting_type::text ILIKE '%L10%' OR meeting_type::text ILIKE '%level%10%'
  LOOP
    v_total_meetings := v_total_meetings + 1;
    
    -- Sync participants for this meeting
    v_result := sync_l10_meeting_participants(v_meeting.id);
    v_total_added := v_total_added + COALESCE((v_result->>'added_count')::integer, 0);
    
    v_results := v_results || jsonb_build_object(
      'meeting_id', v_meeting.id,
      'title', v_meeting.title,
      'added', v_result->>'added_count',
      'total', v_result->>'total_count'
    );
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'meetings_processed', v_total_meetings,
    'total_participants_added', v_total_added,
    'details', v_results
  );
END;
$$;

COMMENT ON FUNCTION public.backfill_l10_meeting_participants() IS 
'Backfills all L10 meetings with correct Vivacity Team participants. Safe to run multiple times (idempotent).';

-- ============================================================================
-- 3. Run the backfill now
-- ============================================================================

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.backfill_l10_meeting_participants();
  RAISE NOTICE 'L10 meeting backfill complete: %', v_result;
END;
$$;