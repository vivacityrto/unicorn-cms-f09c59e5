-- Create RPC function for SuperAdmins to update any team member's profile
CREATE OR REPLACE FUNCTION public.update_team_member_profile(
  p_target_user_id UUID,
  p_linkedin_url TEXT DEFAULT NULL,
  p_booking_url TEXT DEFAULT NULL,
  p_working_days TEXT[] DEFAULT NULL,
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
SET search_path = public
AS $$
DECLARE
  v_current_user_id UUID;
  v_current_user_role TEXT;
  v_current_user_type TEXT;
  v_target_user_type TEXT;
  v_target_user_role TEXT;
BEGIN
  -- Get current user
  v_current_user_id := auth.uid();
  
  IF v_current_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get current user's role and type
  SELECT unicorn_role, user_type INTO v_current_user_role, v_current_user_type
  FROM public.users
  WHERE user_uuid = v_current_user_id;
  
  -- Check if current user is a SuperAdmin
  IF NOT (v_current_user_role = 'Super Admin' AND (v_current_user_type = 'Vivacity' OR v_current_user_type = 'Vivacity Team')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only SuperAdmins can update other team members profiles');
  END IF;
  
  -- Verify target user exists and is a team member
  SELECT unicorn_role, user_type INTO v_target_user_role, v_target_user_type
  FROM public.users
  WHERE user_uuid = p_target_user_id;
  
  IF v_target_user_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
  END IF;
  
  -- Check target is also a team user
  IF NOT ((v_target_user_role = 'Super Admin' OR v_target_user_role = 'Team Member') AND 
          (v_target_user_type = 'Vivacity' OR v_target_user_type = 'Vivacity Team')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user is not a team member');
  END IF;
  
  -- Perform the update
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
    away_message = COALESCE(p_away_message, away_message),
    cover_user_id = p_cover_user_id,
    updated_at = NOW()
  WHERE user_uuid = p_target_user_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;