-- Update the update_own_team_profile function to use the correct column name (leave_until)
CREATE OR REPLACE FUNCTION public.update_own_team_profile(
  p_phone text DEFAULT NULL,
  p_job_title text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_timezone text DEFAULT NULL,
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

  UPDATE public.users
  SET
    mobile_phone = COALESCE(p_phone, mobile_phone),
    job_title = COALESCE(p_job_title, job_title),
    bio = COALESCE(p_bio, bio),
    timezone = COALESCE(p_timezone, timezone),
    linkedin_url = COALESCE(p_linkedin_url, linkedin_url),
    booking_url = COALESCE(p_booking_url, booking_url),
    working_days = COALESCE(p_working_days, working_days),
    working_hours = COALESCE(p_working_hours, working_hours),
    availability_note = COALESCE(p_availability_note, availability_note),
    public_holiday_region = COALESCE(p_public_holiday_region, public_holiday_region),
    leave_from = p_leave_from,
    leave_until = p_leave_until,
    availability_note = p_away_message,
    cover_user_id = p_cover_user_id,
    updated_at = now()
  WHERE user_uuid = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;