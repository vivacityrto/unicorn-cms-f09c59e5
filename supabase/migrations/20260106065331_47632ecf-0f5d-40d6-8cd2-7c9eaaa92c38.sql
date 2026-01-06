-- Add missing away_message column
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS away_message text;

-- Drop existing RPC functions with the bug
DROP FUNCTION IF EXISTS public.update_own_team_profile(text, text, text, text, text, text, text[], jsonb, text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.update_own_team_profile(text, text, text, text, text, text, jsonb, jsonb, text, text, date, date, text, uuid);
DROP FUNCTION IF EXISTS public.update_own_team_profile(text, text, jsonb, jsonb, text, text, date, date, text, uuid);

-- Create fixed RPC function for updating team profile
CREATE OR REPLACE FUNCTION public.update_own_team_profile(
  p_linkedin_url text DEFAULT NULL,
  p_booking_url text DEFAULT NULL,
  p_working_days jsonb DEFAULT NULL,
  p_working_hours jsonb DEFAULT NULL,
  p_availability_note text DEFAULT NULL,
  p_public_holiday_region text DEFAULT NULL,
  p_leave_from date DEFAULT NULL,
  p_leave_until date DEFAULT NULL,
  p_away_message text DEFAULT NULL,
  p_cover_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_is_team boolean;
BEGIN
  v_user_id := auth.uid();
  
  -- Check if user is a team user (SuperAdmin/Vivacity)
  SELECT (
    (unicorn_role = 'Super Admin' OR unicorn_role = 'Team Member') 
    AND (user_type = 'Vivacity' OR user_type = 'Vivacity Team')
  )
  INTO v_is_team
  FROM public.users WHERE user_uuid = v_user_id;
  
  IF NOT v_is_team THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only team users can update team profile');
  END IF;

  -- Validate cover_user_id if provided
  IF p_cover_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_uuid = p_cover_user_id 
      AND (unicorn_role = 'Super Admin' OR unicorn_role = 'Team Member')
      AND (user_type = 'Vivacity' OR user_type = 'Vivacity Team')
      AND disabled = false
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid cover contact - must be an active team member');
    END IF;
  END IF;

  -- Update team profile fields - each column only once!
  UPDATE public.users
  SET
    linkedin_url = COALESCE(p_linkedin_url, linkedin_url),
    booking_url = COALESCE(p_booking_url, booking_url),
    working_days = COALESCE(p_working_days, working_days),
    working_hours = COALESCE(p_working_hours, working_hours),
    availability_note = COALESCE(p_availability_note, availability_note),
    public_holiday_region = COALESCE(p_public_holiday_region, public_holiday_region),
    leave_from = p_leave_from,
    leave_until = p_leave_until,
    away_message = p_away_message,
    cover_user_id = p_cover_user_id,
    updated_at = now()
  WHERE user_uuid = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;