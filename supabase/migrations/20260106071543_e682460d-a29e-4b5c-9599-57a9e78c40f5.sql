-- Fix type mismatch in update_team_member_profile function
-- p_working_days should be JSONB to match the database column type

DROP FUNCTION IF EXISTS public.update_team_member_profile(uuid, text, text, text[], jsonb, text, text, date, date, text, uuid);

CREATE OR REPLACE FUNCTION public.update_team_member_profile(
  p_target_user_id UUID,
  p_linkedin_url TEXT DEFAULT NULL,
  p_booking_url TEXT DEFAULT NULL,
  p_working_days JSONB DEFAULT NULL,
  p_working_hours JSONB DEFAULT NULL,
  p_availability_note TEXT DEFAULT NULL,
  p_public_holiday_region TEXT DEFAULT NULL,
  p_leave_from DATE DEFAULT NULL,
  p_leave_until DATE DEFAULT NULL,
  p_away_message TEXT DEFAULT NULL,
  p_cover_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_user_id UUID;
  v_current_user_role TEXT;
  v_current_user_type TEXT;
  v_target_user_type TEXT;
  v_target_user_role TEXT;
BEGIN
  v_current_user_id := auth.uid();
  
  IF v_current_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT unicorn_role, user_type INTO v_current_user_role, v_current_user_type
  FROM public.users
  WHERE user_uuid = v_current_user_id;
  
  IF NOT (v_current_user_role = 'Super Admin' AND 
          (v_current_user_type = 'Vivacity' OR v_current_user_type = 'Vivacity Team')) THEN
    RETURN jsonb_build_object('success', false, 'error', 
           'Only SuperAdmins can update other team members profiles');
  END IF;
  
  SELECT unicorn_role, user_type INTO v_target_user_role, v_target_user_type
  FROM public.users
  WHERE user_uuid = p_target_user_id;
  
  IF v_target_user_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
  END IF;
  
  IF NOT ((v_target_user_role = 'Super Admin' OR v_target_user_role = 'Team Member') AND 
          (v_target_user_type = 'Vivacity' OR v_target_user_type = 'Vivacity Team')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user is not a team member');
  END IF;

  IF p_cover_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_uuid = p_cover_user_id 
      AND (unicorn_role = 'Super Admin' OR unicorn_role = 'Team Member')
      AND (user_type = 'Vivacity' OR user_type = 'Vivacity Team')
      AND disabled = false
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 
             'Invalid cover contact - must be an active team member');
    END IF;
  END IF;
  
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
    updated_at = NOW()
  WHERE user_uuid = p_target_user_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_team_member_profile(uuid, text, text, jsonb, jsonb, text, text, date, date, text, uuid) TO authenticated;