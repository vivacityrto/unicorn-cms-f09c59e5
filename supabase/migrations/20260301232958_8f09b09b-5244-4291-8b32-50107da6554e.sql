
-- 1. Create dd_eos_roles lookup table
CREATE TABLE IF NOT EXISTS public.dd_eos_roles (
  id serial PRIMARY KEY,
  label text NOT NULL,
  value text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dd_eos_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dd_eos_roles"
  ON public.dd_eos_roles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "SuperAdmins can manage dd_eos_roles"
  ON public.dd_eos_roles FOR ALL
  USING (public.is_vivacity_team_safe(auth.uid()));

-- Seed with existing enum values + the missing visionary/integrator roles
INSERT INTO public.dd_eos_roles (label, value, description, sort_order) VALUES
  ('Visionary', 'visionary', 'EOS Visionary role', 0),
  ('Integrator', 'integrator', 'EOS Integrator role', 1),
  ('Admin', 'admin', 'EOS Admin role', 2),
  ('Facilitator', 'facilitator', 'EOS meeting facilitator', 3),
  ('Scribe', 'scribe', 'EOS meeting scribe', 4),
  ('Participant', 'participant', 'General EOS participant', 5),
  ('Client Viewer', 'client_viewer', 'Client read-only viewer', 6),
  ('Core Team', 'core_team', 'Core leadership team member', 7);

-- 2. Convert eos_user_roles.role from enum to text
ALTER TABLE public.eos_user_roles
  ALTER COLUMN role TYPE text USING role::text;

-- 3. Fix seed_meeting_attendees_from_roles - cast ur.role to text explicitly
CREATE OR REPLACE FUNCTION public.seed_meeting_attendees_from_roles(p_meeting_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- STEP 1: Copy from eos_meeting_participants first (the scheduling roster)
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

  -- STEP 2: Insert from eos_user_roles (text column now, no enum cast issues)
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
$function$;
