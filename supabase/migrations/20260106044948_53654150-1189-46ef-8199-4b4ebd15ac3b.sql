-- Drop existing function to recreate with new return type
DROP FUNCTION IF EXISTS public.get_tenant_csc_profiles(bigint);

-- Recreate function with leave/cover fields
CREATE OR REPLACE FUNCTION public.get_tenant_csc_profiles(p_tenant_id bigint DEFAULT NULL)
RETURNS TABLE (
  user_uuid uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  job_title text,
  bio text,
  timezone text,
  linkedin_url text,
  booking_url text,
  working_days jsonb,
  working_hours jsonb,
  availability_note text,
  public_holiday_region text,
  avatar_url text,
  is_primary boolean,
  role_label text,
  leave_from timestamptz,
  leave_to timestamptz,
  away_message text,
  cover_user_id uuid,
  cover_first_name text,
  cover_last_name text,
  cover_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id bigint;
BEGIN
  -- Determine tenant_id: use provided or get from current user's membership
  IF p_tenant_id IS NOT NULL THEN
    v_tenant_id := p_tenant_id;
  ELSE
    SELECT tm.tenant_id INTO v_tenant_id
    FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
    AND tm.status = 'active'
    LIMIT 1;
  END IF;

  -- Check access: user must be member of tenant or SuperAdmin
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant_id AND tm.user_id = auth.uid() AND tm.status = 'active'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid() AND u.unicorn_role = 'Super Admin'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    u.user_uuid,
    u.first_name,
    u.last_name,
    u.email,
    COALESCE(u.mobile_phone, u.phone) as phone,
    u.job_title,
    u.bio,
    u.timezone,
    u.linkedin_url,
    u.booking_url,
    u.working_days,
    u.working_hours,
    u.availability_note,
    u.public_holiday_region,
    u.avatar_url,
    tca.is_primary,
    tca.role_label,
    u.leave_from,
    u.leave_to,
    u.away_message,
    u.cover_user_id,
    cover.first_name as cover_first_name,
    cover.last_name as cover_last_name,
    cover.email as cover_email
  FROM public.tenant_csc_assignments tca
  JOIN public.users u ON u.user_uuid = tca.csc_user_id
  LEFT JOIN public.users cover ON cover.user_uuid = u.cover_user_id
  WHERE tca.tenant_id = v_tenant_id
  ORDER BY tca.is_primary DESC, u.first_name;
END;
$$;

-- Create function for updating own team/CSC profile with leave info
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
  p_leave_from timestamptz DEFAULT NULL,
  p_leave_to timestamptz DEFAULT NULL,
  p_away_message text DEFAULT NULL,
  p_cover_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_is_team boolean;
BEGIN
  v_user_id := auth.uid();
  
  -- Check if user is a team user (SuperAdmin/Vivacity)
  SELECT (unicorn_role = 'Super Admin' AND (user_type = 'Vivacity' OR user_type = 'Vivacity Team'))
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
      AND unicorn_role = 'Super Admin'
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
    leave_to = p_leave_to,
    away_message = p_away_message,
    cover_user_id = p_cover_user_id,
    updated_at = now()
  WHERE user_uuid = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Create function for getting team users (for cover contact dropdown)
CREATE OR REPLACE FUNCTION public.get_team_users()
RETURNS TABLE (
  user_uuid uuid,
  first_name text,
  last_name text,
  email text,
  job_title text,
  superadmin_level text,
  is_csc boolean,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only SuperAdmin can call this
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND unicorn_role = 'Super Admin'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    u.user_uuid,
    u.first_name,
    u.last_name,
    u.email,
    u.job_title,
    u.superadmin_level,
    COALESCE(u.is_csc, false) as is_csc,
    u.avatar_url
  FROM public.users u
  WHERE u.unicorn_role = 'Super Admin'
  AND u.disabled = false
  ORDER BY u.first_name, u.last_name;
END;
$$;

-- Grant execute on new functions
GRANT EXECUTE ON FUNCTION public.get_tenant_csc_profiles(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_team_profile(text, text, text, text, text, text, jsonb, jsonb, text, text, timestamptz, timestamptz, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_users() TO authenticated;