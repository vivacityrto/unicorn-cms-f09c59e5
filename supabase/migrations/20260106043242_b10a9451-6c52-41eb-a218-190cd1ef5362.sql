-- CSC Profile Feature Migration
-- 1. Create timezones reference table
CREATE TABLE IF NOT EXISTS public.timezones (
  tz TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  utc_offset_minutes INT NOT NULL,
  country_code TEXT NULL,
  display_order INT DEFAULT 100
);

-- Enable RLS on timezones
ALTER TABLE public.timezones ENABLE ROW LEVEL SECURITY;

-- Timezones readable by all authenticated users
CREATE POLICY "timezones_read_authenticated"
  ON public.timezones FOR SELECT
  TO authenticated
  USING (true);

-- Timezones managed by SuperAdmin only
CREATE POLICY "timezones_write_superadmin"
  ON public.timezones FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 2. Seed comprehensive timezone list
INSERT INTO public.timezones (tz, label, utc_offset_minutes, country_code, display_order) VALUES
  -- Australia (highest priority for this app)
  ('Australia/Sydney', 'Sydney (AEDT/AEST)', 600, 'AU', 10),
  ('Australia/Melbourne', 'Melbourne (AEDT/AEST)', 600, 'AU', 11),
  ('Australia/Brisbane', 'Brisbane (AEST)', 600, 'AU', 12),
  ('Australia/Adelaide', 'Adelaide (ACDT/ACST)', 570, 'AU', 13),
  ('Australia/Perth', 'Perth (AWST)', 480, 'AU', 14),
  ('Australia/Darwin', 'Darwin (ACST)', 570, 'AU', 15),
  ('Australia/Hobart', 'Hobart (AEDT/AEST)', 600, 'AU', 16),
  -- Philippines
  ('Asia/Manila', 'Manila (PHT)', 480, 'PH', 20),
  -- Asia Pacific
  ('Pacific/Auckland', 'Auckland (NZDT/NZST)', 720, 'NZ', 30),
  ('Asia/Singapore', 'Singapore (SGT)', 480, 'SG', 31),
  ('Asia/Kuala_Lumpur', 'Kuala Lumpur (MYT)', 480, 'MY', 32),
  ('Asia/Hong_Kong', 'Hong Kong (HKT)', 480, 'HK', 33),
  ('Asia/Tokyo', 'Tokyo (JST)', 540, 'JP', 34),
  ('Asia/Jakarta', 'Jakarta (WIB)', 420, 'ID', 35),
  ('Asia/Makassar', 'Makassar (WITA)', 480, 'ID', 36),
  ('Asia/Kolkata', 'Kolkata (IST)', 330, 'IN', 37),
  ('Asia/Bangkok', 'Bangkok (ICT)', 420, 'TH', 38),
  ('Asia/Dubai', 'Dubai (GST)', 240, 'AE', 39),
  -- Europe
  ('Europe/London', 'London (GMT/BST)', 0, 'GB', 50),
  ('Europe/Dublin', 'Dublin (GMT/IST)', 0, 'IE', 51),
  ('Europe/Paris', 'Paris (CET/CEST)', 60, 'FR', 52),
  ('Europe/Berlin', 'Berlin (CET/CEST)', 60, 'DE', 53),
  ('Europe/Amsterdam', 'Amsterdam (CET/CEST)', 60, 'NL', 54),
  -- Americas
  ('America/New_York', 'New York (EST/EDT)', -300, 'US', 60),
  ('America/Chicago', 'Chicago (CST/CDT)', -360, 'US', 61),
  ('America/Denver', 'Denver (MST/MDT)', -420, 'US', 62),
  ('America/Los_Angeles', 'Los Angeles (PST/PDT)', -480, 'US', 63),
  ('America/Toronto', 'Toronto (EST/EDT)', -300, 'CA', 64),
  ('America/Vancouver', 'Vancouver (PST/PDT)', -480, 'CA', 65),
  ('America/Sao_Paulo', 'São Paulo (BRT)', -180, 'BR', 66)
ON CONFLICT (tz) DO UPDATE SET
  label = EXCLUDED.label,
  utc_offset_minutes = EXCLUDED.utc_offset_minutes,
  country_code = EXCLUDED.country_code,
  display_order = EXCLUDED.display_order;

-- 3. Extend users table with CSC profile fields
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS booking_url TEXT,
  ADD COLUMN IF NOT EXISTS working_days JSONB DEFAULT '["mon","tue","wed","thu","fri"]'::jsonb,
  ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT '{"start":"09:00","end":"17:00"}'::jsonb,
  ADD COLUMN IF NOT EXISTS availability_note TEXT,
  ADD COLUMN IF NOT EXISTS public_holiday_region TEXT,
  ADD COLUMN IF NOT EXISTS communication_pref TEXT,
  ADD COLUMN IF NOT EXISTS response_time_sla TEXT,
  ADD COLUMN IF NOT EXISTS is_csc BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS csc_visibility JSONB DEFAULT '{
    "phone": true,
    "email": true,
    "linkedin_url": true,
    "booking_url": true,
    "bio": true,
    "working_days": true,
    "working_hours": true,
    "availability_note": true,
    "avatar_url": true
  }'::jsonb;

-- 4. Create tenant CSC assignments table
CREATE TABLE IF NOT EXISTS public.tenant_csc_assignments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  csc_user_id UUID NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  role_label TEXT NOT NULL DEFAULT 'CSC',
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, csc_user_id)
);

-- Partial unique index: only one primary CSC per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_primary_csc
  ON public.tenant_csc_assignments (tenant_id)
  WHERE is_primary = TRUE;

-- Enable RLS
ALTER TABLE public.tenant_csc_assignments ENABLE ROW LEVEL SECURITY;

-- RLS: Tenant users can read assignments for their tenant
CREATE POLICY "tenant_csc_read_own_tenant"
  ON public.tenant_csc_assignments FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_tenant_member(tenant_id)
  );

-- RLS: SuperAdmin can manage assignments
CREATE POLICY "tenant_csc_manage_superadmin"
  ON public.tenant_csc_assignments FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 5. RPC: Get timezones list
CREATE OR REPLACE FUNCTION public.get_timezones()
RETURNS TABLE (
  tz TEXT,
  label TEXT,
  utc_offset_minutes INT,
  country_code TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT tz, label, utc_offset_minutes, country_code
  FROM public.timezones
  ORDER BY display_order, label;
$$;

-- 6. RPC: Get tenant CSC profiles (with visibility filtering)
CREATE OR REPLACE FUNCTION public.get_tenant_csc_profiles(p_tenant_id BIGINT DEFAULT NULL)
RETURNS TABLE (
  user_uuid UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  job_title TEXT,
  bio TEXT,
  timezone TEXT,
  linkedin_url TEXT,
  booking_url TEXT,
  working_days JSONB,
  working_hours JSONB,
  availability_note TEXT,
  public_holiday_region TEXT,
  avatar_url TEXT,
  is_primary BOOLEAN,
  role_label TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id BIGINT;
  v_is_super_admin BOOLEAN;
BEGIN
  v_is_super_admin := public.is_super_admin();
  
  -- Determine tenant_id
  IF p_tenant_id IS NOT NULL AND v_is_super_admin THEN
    v_tenant_id := p_tenant_id;
  ELSE
    -- Get user's tenant from tenant_members or users table
    SELECT COALESCE(tm.tenant_id, u.tenant_id) INTO v_tenant_id
    FROM public.users u
    LEFT JOIN public.tenant_members tm ON tm.user_id = u.user_uuid AND tm.status = 'active'
    WHERE u.user_uuid = auth.uid()
    LIMIT 1;
  END IF;
  
  IF v_tenant_id IS NULL AND NOT v_is_super_admin THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    u.user_uuid,
    u.first_name,
    u.last_name,
    CASE WHEN COALESCE((u.csc_visibility->>'email')::boolean, true) OR v_is_super_admin THEN u.email ELSE NULL END,
    CASE WHEN COALESCE((u.csc_visibility->>'phone')::boolean, true) OR v_is_super_admin THEN COALESCE(u.mobile_phone, u.phone) ELSE NULL END,
    u.job_title,
    CASE WHEN COALESCE((u.csc_visibility->>'bio')::boolean, true) OR v_is_super_admin THEN u.bio ELSE NULL END,
    u.timezone,
    CASE WHEN COALESCE((u.csc_visibility->>'linkedin_url')::boolean, true) OR v_is_super_admin THEN u.linkedin_url ELSE NULL END,
    CASE WHEN COALESCE((u.csc_visibility->>'booking_url')::boolean, true) OR v_is_super_admin THEN u.booking_url ELSE NULL END,
    CASE WHEN COALESCE((u.csc_visibility->>'working_days')::boolean, true) OR v_is_super_admin THEN u.working_days ELSE NULL END,
    CASE WHEN COALESCE((u.csc_visibility->>'working_hours')::boolean, true) OR v_is_super_admin THEN u.working_hours ELSE NULL END,
    CASE WHEN COALESCE((u.csc_visibility->>'availability_note')::boolean, true) OR v_is_super_admin THEN u.availability_note ELSE NULL END,
    u.public_holiday_region,
    CASE WHEN COALESCE((u.csc_visibility->>'avatar_url')::boolean, true) OR v_is_super_admin THEN u.avatar_url ELSE NULL END,
    tca.is_primary,
    tca.role_label
  FROM public.tenant_csc_assignments tca
  JOIN public.users u ON u.user_uuid = tca.csc_user_id
  WHERE tca.tenant_id = v_tenant_id
    AND u.is_csc = TRUE
    AND u.disabled = FALSE
  ORDER BY tca.is_primary DESC, u.first_name;
END;
$$;

-- 7. RPC: Update own CSC profile (for SuperAdmin CSC users)
CREATE OR REPLACE FUNCTION public.update_my_csc_profile(
  p_phone TEXT DEFAULT NULL,
  p_job_title TEXT DEFAULT NULL,
  p_bio TEXT DEFAULT NULL,
  p_timezone TEXT DEFAULT NULL,
  p_linkedin_url TEXT DEFAULT NULL,
  p_booking_url TEXT DEFAULT NULL,
  p_working_days JSONB DEFAULT NULL,
  p_working_hours JSONB DEFAULT NULL,
  p_availability_note TEXT DEFAULT NULL,
  p_public_holiday_region TEXT DEFAULT NULL,
  p_communication_pref TEXT DEFAULT NULL,
  p_response_time_sla TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_csc BOOLEAN;
  v_old_data JSONB;
BEGIN
  -- Check if user is a CSC
  SELECT is_csc INTO v_is_csc FROM public.users WHERE user_uuid = v_user_id;
  
  IF NOT COALESCE(v_is_csc, FALSE) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a CSC user');
  END IF;
  
  -- Validate timezone if provided
  IF p_timezone IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.timezones WHERE tz = p_timezone) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid timezone');
    END IF;
  END IF;
  
  -- Validate URLs
  IF p_linkedin_url IS NOT NULL AND p_linkedin_url != '' AND NOT (p_linkedin_url ~ '^https?://') THEN
    RETURN jsonb_build_object('success', false, 'error', 'LinkedIn URL must start with http:// or https://');
  END IF;
  
  IF p_booking_url IS NOT NULL AND p_booking_url != '' AND NOT (p_booking_url ~ '^https?://') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking URL must start with http:// or https://');
  END IF;
  
  -- Store old data for audit
  SELECT jsonb_build_object(
    'phone', mobile_phone,
    'job_title', job_title,
    'bio', bio,
    'timezone', timezone,
    'linkedin_url', linkedin_url,
    'booking_url', booking_url,
    'working_days', working_days,
    'working_hours', working_hours,
    'availability_note', availability_note,
    'public_holiday_region', public_holiday_region
  ) INTO v_old_data
  FROM public.users WHERE user_uuid = v_user_id;
  
  -- Update profile
  UPDATE public.users SET
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
    communication_pref = COALESCE(p_communication_pref, communication_pref),
    response_time_sla = COALESCE(p_response_time_sla, response_time_sla),
    updated_at = NOW()
  WHERE user_uuid = v_user_id;
  
  -- Audit log
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES ('update', 'csc_profile', v_user_id::text, v_user_id, jsonb_build_object(
    'old', v_old_data,
    'new', jsonb_build_object(
      'phone', p_phone,
      'job_title', p_job_title,
      'bio', p_bio,
      'timezone', p_timezone,
      'linkedin_url', p_linkedin_url,
      'booking_url', p_booking_url
    )
  ));
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 8. RPC: Admin update CSC profile (SuperAdmin-Administrator only)
CREATE OR REPLACE FUNCTION public.admin_update_csc_profile(
  p_user_id UUID,
  p_is_csc BOOLEAN DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_job_title TEXT DEFAULT NULL,
  p_bio TEXT DEFAULT NULL,
  p_timezone TEXT DEFAULT NULL,
  p_linkedin_url TEXT DEFAULT NULL,
  p_booking_url TEXT DEFAULT NULL,
  p_working_days JSONB DEFAULT NULL,
  p_working_hours JSONB DEFAULT NULL,
  p_availability_note TEXT DEFAULT NULL,
  p_public_holiday_region TEXT DEFAULT NULL,
  p_csc_visibility JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_is_admin BOOLEAN;
BEGIN
  -- Check if actor is SuperAdmin-Administrator
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = v_actor_id 
      AND unicorn_role = 'Super Admin'
      AND user_type = 'Vivacity'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only SuperAdmin-Administrator can perform this action');
  END IF;
  
  -- Validate timezone if provided
  IF p_timezone IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.timezones WHERE tz = p_timezone) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid timezone');
    END IF;
  END IF;
  
  -- Update user
  UPDATE public.users SET
    is_csc = COALESCE(p_is_csc, is_csc),
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
    csc_visibility = COALESCE(p_csc_visibility, csc_visibility),
    updated_at = NOW()
  WHERE user_uuid = p_user_id;
  
  -- Audit log
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES ('admin_update', 'csc_profile', p_user_id::text, v_actor_id, jsonb_build_object(
    'target_user_id', p_user_id,
    'is_csc', p_is_csc,
    'visibility', p_csc_visibility
  ));
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 9. RPC: Set tenant CSC assignment
CREATE OR REPLACE FUNCTION public.admin_set_tenant_csc_assignment(
  p_tenant_id BIGINT,
  p_csc_user_id UUID,
  p_is_primary BOOLEAN DEFAULT TRUE,
  p_role_label TEXT DEFAULT 'CSC'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_is_csc BOOLEAN;
BEGIN
  -- Check if actor is SuperAdmin
  SELECT public.is_super_admin() INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only SuperAdmin can manage CSC assignments');
  END IF;
  
  -- Verify user is a CSC
  SELECT is_csc INTO v_is_csc FROM public.users WHERE user_uuid = p_csc_user_id;
  IF NOT COALESCE(v_is_csc, FALSE) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not marked as CSC');
  END IF;
  
  -- If setting as primary, unset other primaries first
  IF p_is_primary THEN
    UPDATE public.tenant_csc_assignments
    SET is_primary = FALSE, updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND is_primary = TRUE;
  END IF;
  
  -- Upsert assignment
  INSERT INTO public.tenant_csc_assignments (tenant_id, csc_user_id, is_primary, role_label, updated_at)
  VALUES (p_tenant_id, p_csc_user_id, p_is_primary, p_role_label, NOW())
  ON CONFLICT (tenant_id, csc_user_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    role_label = EXCLUDED.role_label,
    updated_at = NOW();
  
  -- Audit log
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES ('set_assignment', 'tenant_csc_assignment', p_tenant_id::text, v_actor_id, jsonb_build_object(
    'tenant_id', p_tenant_id,
    'csc_user_id', p_csc_user_id,
    'is_primary', p_is_primary,
    'role_label', p_role_label
  ));
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 10. RPC: Remove tenant CSC assignment
CREATE OR REPLACE FUNCTION public.admin_remove_tenant_csc_assignment(
  p_tenant_id BIGINT,
  p_csc_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_is_admin BOOLEAN;
BEGIN
  SELECT public.is_super_admin() INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only SuperAdmin can manage CSC assignments');
  END IF;
  
  DELETE FROM public.tenant_csc_assignments
  WHERE tenant_id = p_tenant_id AND csc_user_id = p_csc_user_id;
  
  -- Audit log
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES ('remove_assignment', 'tenant_csc_assignment', p_tenant_id::text, v_actor_id, jsonb_build_object(
    'tenant_id', p_tenant_id,
    'csc_user_id', p_csc_user_id
  ));
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 11. RPC: Get CSC users list (for admin assignment UI)
CREATE OR REPLACE FUNCTION public.get_csc_users()
RETURNS TABLE (
  user_uuid UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  job_title TEXT,
  avatar_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.user_uuid, u.first_name, u.last_name, u.email, u.job_title, u.avatar_url
  FROM public.users u
  WHERE u.is_csc = TRUE AND u.disabled = FALSE
  ORDER BY u.first_name, u.last_name;
$$;