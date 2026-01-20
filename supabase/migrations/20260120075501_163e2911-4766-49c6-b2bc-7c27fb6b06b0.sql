-- EOS Meeting Attendance Tracking and Quorum Enforcement
-- Step 1: Create attendance status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_attendance_status') THEN
    CREATE TYPE public.meeting_attendance_status AS ENUM (
      'invited', 'accepted', 'declined', 'attended', 'late', 'left_early', 'no_show'
    );
  END IF;
END$$;

-- Step 2: Create meeting role enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_role') THEN
    CREATE TYPE public.meeting_role AS ENUM ('owner', 'attendee', 'guest', 'visionary', 'integrator', 'core_team');
  END IF;
END$$;

-- Step 3: Create eos_meeting_attendees table (enhanced attendance tracking)
CREATE TABLE IF NOT EXISTS public.eos_meeting_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  role_in_meeting public.meeting_role NOT NULL DEFAULT 'attendee',
  attendance_status public.meeting_attendance_status NOT NULL DEFAULT 'invited',
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  notes TEXT,
  marked_by UUID REFERENCES public.users(user_uuid),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);

-- Step 4: Add quorum-related columns to eos_meetings
ALTER TABLE public.eos_meetings
  ADD COLUMN IF NOT EXISTS quorum_met BOOLEAN,
  ADD COLUMN IF NOT EXISTS quorum_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS quorum_override_by UUID REFERENCES public.users(user_uuid);

-- Step 5: Create indexes
CREATE INDEX IF NOT EXISTS idx_eos_meeting_attendees_meeting 
  ON public.eos_meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_eos_meeting_attendees_user 
  ON public.eos_meeting_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_eos_meeting_attendees_status 
  ON public.eos_meeting_attendees(attendance_status);

-- Step 6: Enable RLS
ALTER TABLE public.eos_meeting_attendees ENABLE ROW LEVEL SECURITY;

-- Step 7: RLS Policies
CREATE POLICY "Attendees viewable by tenant members"
  ON public.eos_meeting_attendees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.eos_meetings m
      JOIN public.tenant_users tu ON tu.tenant_id = m.tenant_id
      WHERE m.id = eos_meeting_attendees.meeting_id
        AND tu.user_id = auth.uid()
    )
  );

CREATE POLICY "Attendees manageable by meeting owner or admin"
  ON public.eos_meeting_attendees FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.eos_meetings m
      JOIN public.tenant_users tu ON tu.tenant_id = m.tenant_id
      WHERE m.id = eos_meeting_attendees.meeting_id
        AND tu.user_id = auth.uid()
        AND tu.role IN ('SuperAdmin', 'Admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.eos_meetings m
      WHERE m.id = eos_meeting_attendees.meeting_id
        AND m.created_by = auth.uid()
    )
  );

-- Step 8: Function to calculate quorum status
CREATE OR REPLACE FUNCTION public.calculate_quorum(
  p_meeting_id UUID
)
RETURNS TABLE(
  quorum_required INTEGER,
  quorum_present INTEGER,
  quorum_met BOOLEAN,
  owner_present BOOLEAN,
  visionary_present BOOLEAN,
  integrator_present BOOLEAN,
  core_team_present INTEGER,
  core_team_required INTEGER,
  issues TEXT[]
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_type TEXT;
  v_total_invited INTEGER;
  v_total_present INTEGER;
  v_owner_present BOOLEAN := false;
  v_visionary_present BOOLEAN := false;
  v_integrator_present BOOLEAN := false;
  v_core_present INTEGER := 0;
  v_core_required INTEGER := 0;
  v_issues TEXT[] := '{}';
  v_quorum_met BOOLEAN := false;
  v_required_present NUMERIC;
BEGIN
  -- Get meeting type
  SELECT meeting_type::TEXT INTO v_meeting_type
  FROM eos_meetings WHERE id = p_meeting_id;

  -- Count attendees
  SELECT 
    COUNT(*) FILTER (WHERE attendance_status = 'invited' OR attendance_status IN ('attended', 'late')),
    COUNT(*) FILTER (WHERE attendance_status IN ('attended', 'late')),
    COALESCE(bool_or(role_in_meeting = 'owner' AND attendance_status IN ('attended', 'late')), false),
    COALESCE(bool_or(role_in_meeting = 'visionary' AND attendance_status IN ('attended', 'late')), false),
    COALESCE(bool_or(role_in_meeting = 'integrator' AND attendance_status IN ('attended', 'late')), false),
    COUNT(*) FILTER (WHERE role_in_meeting = 'core_team' AND attendance_status IN ('attended', 'late')),
    COUNT(*) FILTER (WHERE role_in_meeting = 'core_team')
  INTO v_total_invited, v_total_present, v_owner_present, v_visionary_present, v_integrator_present, v_core_present, v_core_required
  FROM eos_meeting_attendees
  WHERE meeting_id = p_meeting_id;

  -- Evaluate quorum by meeting type
  IF v_meeting_type = 'L10' THEN
    -- L10: Owner must be present, 60% of invited
    IF NOT v_owner_present THEN
      v_issues := array_append(v_issues, 'Meeting Owner must be present');
    END IF;
    v_required_present := CEIL(v_total_invited * 0.6);
    IF v_total_present < v_required_present THEN
      v_issues := array_append(v_issues, format('At least %s of %s attendees must be present', v_required_present::INTEGER, v_total_invited));
    END IF;
    v_quorum_met := v_owner_present AND v_total_present >= v_required_present;

  ELSIF v_meeting_type = 'Same_Page' THEN
    -- Same Page: Visionary AND Integrator must be present
    IF NOT v_visionary_present THEN
      v_issues := array_append(v_issues, 'Visionary must be present');
    END IF;
    IF NOT v_integrator_present THEN
      v_issues := array_append(v_issues, 'Integrator must be present');
    END IF;
    v_quorum_met := v_visionary_present AND v_integrator_present;

  ELSIF v_meeting_type = 'Quarterly' THEN
    -- Quarterly: Owner present, 80% of core team
    IF NOT v_owner_present THEN
      v_issues := array_append(v_issues, 'Meeting Owner must be present');
    END IF;
    IF v_core_required > 0 THEN
      v_required_present := CEIL(v_core_required * 0.8);
      IF v_core_present < v_required_present THEN
        v_issues := array_append(v_issues, format('At least %s of %s core team members must be present', v_required_present::INTEGER, v_core_required));
      END IF;
      v_quorum_met := v_owner_present AND v_core_present >= v_required_present;
    ELSE
      v_quorum_met := v_owner_present;
    END IF;

  ELSIF v_meeting_type = 'Annual' THEN
    -- Annual: Owner, Visionary, Integrator must be present
    IF NOT v_owner_present THEN
      v_issues := array_append(v_issues, 'Meeting Owner must be present');
    END IF;
    IF NOT v_visionary_present THEN
      v_issues := array_append(v_issues, 'Visionary must be present');
    END IF;
    IF NOT v_integrator_present THEN
      v_issues := array_append(v_issues, 'Integrator must be present');
    END IF;
    v_quorum_met := v_owner_present AND v_visionary_present AND v_integrator_present;

  ELSE
    -- Default: just need owner
    v_quorum_met := v_owner_present OR v_total_present > 0;
  END IF;

  RETURN QUERY SELECT 
    COALESCE(v_required_present::INTEGER, 1),
    v_total_present,
    v_quorum_met,
    v_owner_present,
    v_visionary_present,
    v_integrator_present,
    v_core_present,
    v_core_required,
    v_issues;
END;
$$;

-- Step 9: Function to validate and start meeting with quorum check
CREATE OR REPLACE FUNCTION public.start_meeting_with_quorum_check(
  p_meeting_id UUID,
  p_override_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_quorum RECORD;
  v_result JSONB;
BEGIN
  -- Get meeting
  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;
  
  IF v_meeting IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;
  
  IF v_meeting.status NOT IN ('scheduled', 'Scheduled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting is not in scheduled state');
  END IF;

  -- Calculate quorum
  SELECT * INTO v_quorum FROM calculate_quorum(p_meeting_id);
  
  -- For Same Page meetings, block start if quorum not met
  IF v_meeting.meeting_type = 'Same_Page' AND NOT v_quorum.quorum_met AND p_override_reason IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Cannot start Same Page meeting without Visionary and Integrator',
      'quorum', row_to_json(v_quorum),
      'requires_override', false,
      'blocked', true
    );
  END IF;
  
  -- For other meetings, warn but allow with override
  IF NOT v_quorum.quorum_met AND p_override_reason IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Quorum not met',
      'quorum', row_to_json(v_quorum),
      'requires_override', true,
      'blocked', false
    );
  END IF;
  
  -- Start the meeting
  UPDATE eos_meetings
  SET 
    status = 'in_progress',
    started_at = now(),
    quorum_met = v_quorum.quorum_met,
    quorum_override_reason = p_override_reason,
    quorum_override_by = CASE WHEN p_override_reason IS NOT NULL THEN auth.uid() ELSE NULL END,
    agenda_snapshot = (
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'segment_type', s.segment_type,
        'duration_minutes', s.duration_minutes,
        'sort_order', s.sort_order
      ) ORDER BY s.sort_order)
      FROM eos_meeting_segments s
      WHERE s.meeting_id = p_meeting_id
    ),
    updated_at = now()
  WHERE id = p_meeting_id;
  
  -- Log the event
  INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, user_id, details)
  SELECT 
    v_meeting.tenant_id,
    p_meeting_id,
    'meeting',
    CASE WHEN v_quorum.quorum_met THEN 'meeting_started' ELSE 'meeting_started_without_quorum' END,
    auth.uid(),
    jsonb_build_object(
      'quorum_met', v_quorum.quorum_met,
      'override_reason', p_override_reason,
      'quorum_details', row_to_json(v_quorum)
    );
  
  RETURN jsonb_build_object(
    'success', true,
    'quorum_met', v_quorum.quorum_met,
    'quorum', row_to_json(v_quorum)
  );
END;
$$;

-- Step 10: Function to update attendance
CREATE OR REPLACE FUNCTION public.update_meeting_attendance(
  p_meeting_id UUID,
  p_user_id UUID,
  p_status meeting_attendance_status,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status meeting_attendance_status;
  v_meeting RECORD;
BEGIN
  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;
  
  IF v_meeting IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;

  -- Get old status
  SELECT attendance_status INTO v_old_status
  FROM eos_meeting_attendees
  WHERE meeting_id = p_meeting_id AND user_id = p_user_id;
  
  -- Upsert attendance
  INSERT INTO eos_meeting_attendees (meeting_id, user_id, attendance_status, notes, marked_by, joined_at, updated_at)
  VALUES (
    p_meeting_id, 
    p_user_id, 
    p_status, 
    p_notes, 
    auth.uid(),
    CASE WHEN p_status IN ('attended', 'late') THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (meeting_id, user_id)
  DO UPDATE SET
    attendance_status = p_status,
    notes = COALESCE(EXCLUDED.notes, eos_meeting_attendees.notes),
    marked_by = auth.uid(),
    joined_at = CASE 
      WHEN p_status IN ('attended', 'late') AND eos_meeting_attendees.joined_at IS NULL 
      THEN now() 
      ELSE eos_meeting_attendees.joined_at 
    END,
    left_at = CASE WHEN p_status = 'left_early' THEN now() ELSE eos_meeting_attendees.left_at END,
    updated_at = now();
  
  -- Log the change
  INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
  VALUES (
    v_meeting.tenant_id,
    p_meeting_id,
    'attendance',
    'attendance_updated',
    p_user_id::TEXT,
    auth.uid(),
    jsonb_build_object(
      'attendee_user_id', p_user_id,
      'old_status', v_old_status,
      'new_status', p_status,
      'notes', p_notes
    )
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Step 11: Function to add guest attendee
CREATE OR REPLACE FUNCTION public.add_meeting_guest(
  p_meeting_id UUID,
  p_user_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
BEGIN
  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;
  
  IF v_meeting IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;
  
  INSERT INTO eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, notes, marked_by)
  VALUES (p_meeting_id, p_user_id, 'guest', 'attended', p_notes, auth.uid())
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
  
  -- Log
  INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
  VALUES (
    v_meeting.tenant_id,
    p_meeting_id,
    'attendance',
    'guest_added',
    p_user_id::TEXT,
    auth.uid(),
    jsonb_build_object('guest_user_id', p_user_id, 'notes', p_notes)
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Step 12: Function to mark all present
CREATE OR REPLACE FUNCTION public.mark_all_present(p_meeting_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE eos_meeting_attendees
  SET 
    attendance_status = 'attended',
    joined_at = COALESCE(joined_at, now()),
    marked_by = auth.uid(),
    updated_at = now()
  WHERE meeting_id = p_meeting_id
    AND attendance_status = 'invited';
  
  RETURN jsonb_build_object('success', true, 'updated', (SELECT COUNT(*) FROM eos_meeting_attendees WHERE meeting_id = p_meeting_id AND attendance_status = 'attended'));
END;
$$;

-- Step 13: Seed attendees from series when instance is created (trigger)
CREATE OR REPLACE FUNCTION public.seed_meeting_attendees()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If meeting has a series, copy attendees from another instance of same series
  IF NEW.series_id IS NOT NULL THEN
    INSERT INTO eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
    SELECT 
      NEW.id,
      a.user_id,
      a.role_in_meeting,
      'invited'
    FROM eos_meeting_attendees a
    JOIN eos_meetings m ON m.id = a.meeting_id
    WHERE m.series_id = NEW.series_id
      AND m.id != NEW.id
    GROUP BY a.user_id, a.role_in_meeting
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  -- Also copy from eos_meeting_participants if they exist
  INSERT INTO eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
  SELECT 
    NEW.id,
    p.user_id,
    CASE 
      WHEN p.role = 'Leader' THEN 'owner'::meeting_role
      ELSE 'attendee'::meeting_role
    END,
    'invited'
  FROM eos_meeting_participants p
  WHERE p.meeting_id = NEW.id
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger for seeding attendees
DROP TRIGGER IF EXISTS trg_seed_meeting_attendees ON public.eos_meetings;
CREATE TRIGGER trg_seed_meeting_attendees
  AFTER INSERT ON public.eos_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_meeting_attendees();

-- Step 14: Create attendance summary view
CREATE OR REPLACE VIEW public.eos_meeting_attendance_summary AS
SELECT 
  m.id AS meeting_id,
  m.meeting_type,
  m.title,
  m.scheduled_date,
  m.status,
  m.quorum_met,
  COUNT(a.id) FILTER (WHERE a.attendance_status = 'invited' OR a.attendance_status IN ('attended', 'late', 'left_early', 'no_show')) AS invited_count,
  COUNT(a.id) FILTER (WHERE a.attendance_status IN ('attended', 'late')) AS present_count,
  COUNT(a.id) FILTER (WHERE a.attendance_status = 'late') AS late_count,
  COUNT(a.id) FILTER (WHERE a.attendance_status = 'left_early') AS left_early_count,
  COUNT(a.id) FILTER (WHERE a.attendance_status = 'no_show') AS no_show_count,
  CASE 
    WHEN COUNT(a.id) FILTER (WHERE a.attendance_status != 'declined') > 0 
    THEN ROUND(100.0 * COUNT(a.id) FILTER (WHERE a.attendance_status IN ('attended', 'late')) / 
         NULLIF(COUNT(a.id) FILTER (WHERE a.attendance_status != 'declined'), 0), 1)
    ELSE 0 
  END AS attendance_rate
FROM eos_meetings m
LEFT JOIN eos_meeting_attendees a ON a.meeting_id = m.id
GROUP BY m.id;