
-- ============================================================
-- Replace meeting_attendance_status ENUM with dd_ lookup table
-- ============================================================

-- 1) Create dd_meeting_attendance_status lookup table
CREATE TABLE public.dd_meeting_attendance_status (
  id serial PRIMARY KEY,
  label text NOT NULL,
  value text NOT NULL UNIQUE,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.dd_meeting_attendance_status (label, value, description, sort_order) VALUES
  ('Invited',    'invited',    'Invited to the meeting',           0),
  ('Accepted',   'accepted',   'Accepted the invitation',          1),
  ('Declined',   'declined',   'Declined the invitation',          2),
  ('Present',    'attended',   'Present at the meeting',           3),
  ('Late',       'late',       'Arrived late to the meeting',      4),
  ('Left Early', 'left_early', 'Left the meeting early',           5),
  ('No Show',    'no_show',    'Did not attend the meeting',       6),
  ('Absent',     'absent',     'Marked as absent from the meeting',7);

ALTER TABLE public.dd_meeting_attendance_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dd_meeting_attendance_status"
  ON public.dd_meeting_attendance_status FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Vivacity team can manage dd_meeting_attendance_status"
  ON public.dd_meeting_attendance_status FOR ALL
  USING (public.is_vivacity_team_safe(auth.uid()));

-- 2) Drop the function that has the enum in its signature
DROP FUNCTION IF EXISTS public.update_meeting_attendance(uuid, uuid, meeting_attendance_status, text);

-- 3) Drop views that depend on the column
DROP VIEW IF EXISTS public.eos_meeting_attendance_summary;
DROP VIEW IF EXISTS public.seat_linked_data;

-- 4) Convert column from enum to TEXT
ALTER TABLE public.eos_meeting_attendees
  ALTER COLUMN attendance_status TYPE text USING attendance_status::text;

ALTER TABLE public.eos_meeting_attendees
  ALTER COLUMN attendance_status SET DEFAULT 'invited';

ALTER TABLE public.eos_meeting_attendees
  ADD CONSTRAINT fk_attendance_status_dd
  FOREIGN KEY (attendance_status) REFERENCES public.dd_meeting_attendance_status(value);

-- 5) Drop the old enum type (no more dependencies)
DROP TYPE IF EXISTS public.meeting_attendance_status;

-- 6) Recreate RPCs

CREATE OR REPLACE FUNCTION public.update_meeting_attendance(
  p_meeting_id UUID, p_user_id UUID, p_status TEXT, p_notes TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_old_status TEXT; v_meeting RECORD;
BEGIN
  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;
  IF v_meeting IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Meeting not found'); END IF;
  SELECT attendance_status INTO v_old_status FROM eos_meeting_attendees WHERE meeting_id = p_meeting_id AND user_id = p_user_id;
  INSERT INTO eos_meeting_attendees (meeting_id, user_id, attendance_status, notes, marked_by, joined_at, updated_at)
  VALUES (p_meeting_id, p_user_id, p_status, p_notes, auth.uid(),
    CASE WHEN p_status IN ('attended', 'late') THEN now() ELSE NULL END, now())
  ON CONFLICT (meeting_id, user_id) DO UPDATE SET
    attendance_status = p_status,
    notes = COALESCE(EXCLUDED.notes, eos_meeting_attendees.notes),
    marked_by = auth.uid(),
    joined_at = CASE WHEN p_status IN ('attended', 'late') AND eos_meeting_attendees.joined_at IS NULL THEN now() ELSE eos_meeting_attendees.joined_at END,
    left_at = CASE WHEN p_status = 'left_early' THEN now() ELSE eos_meeting_attendees.left_at END,
    updated_at = now();
  INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
  VALUES (v_meeting.tenant_id, p_meeting_id, 'attendance', 'attendance_updated', p_user_id, auth.uid(),
    jsonb_build_object('attendee_user_id', p_user_id, 'old_status', v_old_status, 'new_status', p_status, 'notes', p_notes));
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_meeting_guest(
  p_meeting_id UUID, p_user_id UUID, p_notes TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_meeting RECORD;
BEGIN
  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;
  IF v_meeting IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Meeting not found'); END IF;
  INSERT INTO eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, notes, marked_by)
  VALUES (p_meeting_id, p_user_id, 'guest', 'attended', p_notes, auth.uid())
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
  INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
  VALUES (v_meeting.tenant_id, p_meeting_id, 'attendance', 'guest_added', p_user_id, auth.uid(),
    jsonb_build_object('guest_user_id', p_user_id, 'notes', p_notes));
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_present(p_meeting_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE eos_meeting_attendees SET attendance_status = 'attended', joined_at = COALESCE(joined_at, now()),
    marked_by = auth.uid(), updated_at = now()
  WHERE meeting_id = p_meeting_id AND attendance_status = 'invited';
  RETURN jsonb_build_object('success', true, 'updated',
    (SELECT COUNT(*) FROM eos_meeting_attendees WHERE meeting_id = p_meeting_id AND attendance_status = 'attended'));
END;
$$;

CREATE OR REPLACE FUNCTION public.add_meeting_attendee(
  p_meeting_id uuid, p_user_id uuid, p_role meeting_role DEFAULT 'attendee'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_meeting RECORD; v_attendee_id UUID;
BEGIN
  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found'; END IF;
  IF v_meeting.status IN ('ended', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot add attendees to an ended or cancelled meeting'; END IF;
  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  VALUES (p_meeting_id, p_user_id, p_role,
    CASE WHEN v_meeting.status IN ('in_progress', 'live') THEN 'attended' ELSE 'invited' END, NOW(), NOW())
  ON CONFLICT (meeting_id, user_id) DO UPDATE SET
    role_in_meeting = EXCLUDED.role_in_meeting,
    attendance_status = CASE WHEN v_meeting.status IN ('in_progress', 'live') THEN 'attended' ELSE eos_meeting_attendees.attendance_status END,
    updated_at = NOW()
  RETURNING id INTO v_attendee_id;
  RETURN v_attendee_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_meeting_attendees_from_roles(p_meeting_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_meeting RECORD; v_inserted_count integer := 0; v_participant_count integer := 0; v_vivacity_count integer := 0;
BEGIN
  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  IF v_meeting IS NULL THEN RAISE EXCEPTION 'Meeting not found'; END IF;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  SELECT p_meeting_id, mp.user_id,
    CASE mp.role::text WHEN 'Leader' THEN 'owner'::meeting_role ELSE 'attendee'::meeting_role END,
    'invited', NOW(), NOW()
  FROM public.eos_meeting_participants mp
  WHERE mp.meeting_id = p_meeting_id AND NOT EXISTS (
    SELECT 1 FROM public.eos_meeting_attendees a WHERE a.meeting_id = p_meeting_id AND a.user_id = mp.user_id)
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_participant_count = ROW_COUNT;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  SELECT p_meeting_id, ur.user_id,
    CASE ur.role WHEN 'visionary' THEN 'visionary'::meeting_role WHEN 'integrator' THEN 'integrator'::meeting_role ELSE 'core_team'::meeting_role END,
    'invited', NOW(), NOW()
  FROM public.eos_user_roles ur
  WHERE ur.tenant_id = v_meeting.tenant_id AND NOT EXISTS (
    SELECT 1 FROM public.eos_meeting_attendees a WHERE a.meeting_id = p_meeting_id AND a.user_id = ur.user_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  SELECT p_meeting_id, u.user_uuid, 'core_team'::meeting_role, 'invited', NOW(), NOW()
  FROM public.users u
  WHERE u.user_type = 'Vivacity Team' AND u.disabled IS NOT TRUE AND u.archived IS NOT TRUE
    AND NOT EXISTS (SELECT 1 FROM public.eos_meeting_attendees a WHERE a.meeting_id = p_meeting_id AND a.user_id = u.user_uuid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_vivacity_count = ROW_COUNT;

  RETURN v_participant_count + v_inserted_count + v_vivacity_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_meeting_attendees()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.series_id IS NOT NULL THEN
    INSERT INTO eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
    SELECT NEW.id, a.user_id, a.role_in_meeting, 'invited'
    FROM eos_meeting_attendees a JOIN eos_meetings m ON m.id = a.meeting_id
    WHERE m.series_id = NEW.series_id AND m.id != NEW.id
    GROUP BY a.user_id, a.role_in_meeting
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  INSERT INTO eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
  SELECT NEW.id, p.user_id,
    CASE WHEN p.role = 'Leader' THEN 'owner'::meeting_role ELSE 'attendee'::meeting_role END, 'invited'
  FROM eos_meeting_participants p WHERE p.meeting_id = NEW.id
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 7) Recreate both views

CREATE OR REPLACE VIEW public.seat_linked_data AS
SELECT 
  s.id AS seat_id, s.tenant_id, s.seat_name, s.eos_role_type,
  sa.user_id AS primary_owner_id,
  (SELECT COUNT(*) FROM public.eos_rocks r 
   WHERE r.owner_id = sa.user_id AND r.tenant_id = s.tenant_id AND r.status NOT IN ('Complete')) AS active_rocks_count,
  (SELECT COUNT(*) FROM public.eos_meeting_attendees ma
   JOIN public.eos_meetings m ON m.id = ma.meeting_id
   WHERE ma.user_id = sa.user_id AND m.tenant_id = s.tenant_id
   AND ma.attendance_status = 'attended' AND m.status = 'closed') AS meetings_attended_count,
  (SELECT COUNT(*) FROM public.eos_meeting_attendees ma
   JOIN public.eos_meetings m ON m.id = ma.meeting_id
   WHERE ma.user_id = sa.user_id AND m.tenant_id = s.tenant_id
   AND ma.attendance_status = 'no_show' AND m.status = 'closed') AS meetings_missed_count
FROM public.accountability_seats s
LEFT JOIN public.accountability_seat_assignments sa 
  ON sa.seat_id = s.id AND sa.assignment_type = 'Primary' AND sa.end_date IS NULL;

ALTER VIEW public.seat_linked_data SET (security_invoker = true);
GRANT SELECT ON public.seat_linked_data TO authenticated;

CREATE OR REPLACE VIEW public.eos_meeting_attendance_summary AS
SELECT 
  m.id AS meeting_id, m.meeting_type, m.title, m.scheduled_date, m.status, m.quorum_met,
  COUNT(a.id) FILTER (WHERE a.attendance_status = 'invited' OR a.attendance_status IN ('attended', 'late', 'left_early', 'no_show')) AS invited_count,
  COUNT(a.id) FILTER (WHERE a.attendance_status IN ('attended', 'late')) AS present_count,
  COUNT(a.id) FILTER (WHERE a.attendance_status = 'late') AS late_count,
  COUNT(a.id) FILTER (WHERE a.attendance_status = 'left_early') AS left_early_count,
  COUNT(a.id) FILTER (WHERE a.attendance_status = 'no_show') AS no_show_count,
  CASE WHEN COUNT(a.id) FILTER (WHERE a.attendance_status != 'declined') > 0 
    THEN ROUND(100.0 * COUNT(a.id) FILTER (WHERE a.attendance_status IN ('attended', 'late')) / 
         NULLIF(COUNT(a.id) FILTER (WHERE a.attendance_status != 'declined'), 0), 1)
    ELSE 0 END AS attendance_rate
FROM eos_meetings m LEFT JOIN eos_meeting_attendees a ON a.meeting_id = m.id
GROUP BY m.id;
