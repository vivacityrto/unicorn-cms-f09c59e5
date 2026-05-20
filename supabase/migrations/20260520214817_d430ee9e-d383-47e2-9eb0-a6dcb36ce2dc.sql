-- Migration 2: Structural swap from meeting_role enum to dd_meeting_role lookup

-- ============================================================
-- Pre-flight assertions
-- ============================================================
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM public.dd_meeting_role) != 6 THEN
    RAISE EXCEPTION 'Pre-flight failed: dd_meeting_role does not have 6 rows';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.eos_meeting_attendees a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.dd_meeting_role d WHERE d.value = a.role_in_meeting::text
    )
  ) THEN
    RAISE EXCEPTION 'Pre-flight failed: eos_meeting_attendees contains values not in dd_meeting_role';
  END IF;
END $$;

DO $$ DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.eos_meeting_attendees;
  RAISE NOTICE 'Pre-migration eos_meeting_attendees row count: %', v_count;
END $$;

-- ============================================================
-- Step 1: Recreate seed_meeting_attendees (remove ::meeting_role casts)
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_meeting_attendees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    CASE WHEN p.role = 'Leader' THEN 'owner'::text ELSE 'attendee'::text END, 'invited'
  FROM eos_meeting_participants p WHERE p.meeting_id = NEW.id
  ON CONFLICT (meeting_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- Step 2: Recreate seed_meeting_attendees_from_roles (remove ::meeting_role casts)
-- ============================================================
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
  IF v_meeting IS NULL THEN RAISE EXCEPTION 'Meeting not found'; END IF;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  SELECT p_meeting_id, mp.user_id,
    CASE mp.role::text WHEN 'Leader' THEN 'owner' ELSE 'attendee' END,
    'invited', NOW(), NOW()
  FROM public.eos_meeting_participants mp
  WHERE mp.meeting_id = p_meeting_id AND NOT EXISTS (
    SELECT 1 FROM public.eos_meeting_attendees a WHERE a.meeting_id = p_meeting_id AND a.user_id = mp.user_id)
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_participant_count = ROW_COUNT;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  SELECT p_meeting_id, ur.user_id,
    CASE ur.role WHEN 'visionary' THEN 'visionary' WHEN 'integrator' THEN 'integrator' ELSE 'core_team' END,
    'invited', NOW(), NOW()
  FROM public.eos_user_roles ur
  WHERE ur.tenant_id = v_meeting.tenant_id AND NOT EXISTS (
    SELECT 1 FROM public.eos_meeting_attendees a WHERE a.meeting_id = p_meeting_id AND a.user_id = ur.user_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  SELECT p_meeting_id, u.user_uuid, 'core_team', 'invited', NOW(), NOW()
  FROM public.users u
  WHERE u.user_type = 'Vivacity Team' AND u.disabled IS NOT TRUE AND u.archived IS NOT TRUE
    AND NOT EXISTS (SELECT 1 FROM public.eos_meeting_attendees a WHERE a.meeting_id = p_meeting_id AND a.user_id = u.user_uuid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_vivacity_count = ROW_COUNT;

  RETURN v_participant_count + v_inserted_count + v_vivacity_count;
END;
$function$;

-- ============================================================
-- Step 3: DROP then RECREATE add_meeting_attendee (param signature change)
-- ============================================================
DROP FUNCTION public.add_meeting_attendee(uuid, uuid, meeting_role);

CREATE OR REPLACE FUNCTION public.add_meeting_attendee(
  p_meeting_id uuid,
  p_user_id uuid,
  p_role text DEFAULT 'attendee'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

GRANT EXECUTE ON FUNCTION public.add_meeting_attendee(uuid, uuid, text) TO authenticated;

-- ============================================================
-- Step 4: Alter column type and reset default
-- ============================================================
ALTER TABLE public.eos_meeting_attendees
  ALTER COLUMN role_in_meeting DROP DEFAULT;

ALTER TABLE public.eos_meeting_attendees
  ALTER COLUMN role_in_meeting TYPE text USING role_in_meeting::text;

ALTER TABLE public.eos_meeting_attendees
  ALTER COLUMN role_in_meeting SET DEFAULT 'attendee';

-- ============================================================
-- Step 5: Add FK constraint
-- ============================================================
ALTER TABLE public.eos_meeting_attendees
  ADD CONSTRAINT fk_eos_meeting_attendees_role
    FOREIGN KEY (role_in_meeting)
    REFERENCES public.dd_meeting_role(value)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- ============================================================
-- Step 6: Retention comment on legacy enum
-- ============================================================
COMMENT ON TYPE public.meeting_role IS
  'Legacy enum retained for rollback safety. Superseded by dd_meeting_role (Phase 5G, 21 May 2026). Do not drop without Carl/Dave sign-off after a documented stable period in production.';

-- ============================================================
-- Post-flight assertions
-- ============================================================
DO $$ DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.eos_meeting_attendees;
  RAISE NOTICE 'Post-migration eos_meeting_attendees row count: %', v_count;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.eos_meeting_attendees a
    WHERE NOT EXISTS (SELECT 1 FROM public.dd_meeting_role d WHERE d.value = a.role_in_meeting)
  ) THEN
    RAISE EXCEPTION 'Post-flight failed: invalid role_in_meeting values found after migration';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.eos_meeting_attendees'::regclass
      AND conname = 'fk_eos_meeting_attendees_role'
  ) THEN
    RAISE EXCEPTION 'Post-flight failed: FK constraint fk_eos_meeting_attendees_role not found';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND pg_get_functiondef(oid) ILIKE '%::meeting_role%'
  ) THEN
    RAISE EXCEPTION 'Post-flight failed: ::meeting_role cast still present in a public function';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_role' AND typnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'Post-flight failed: legacy meeting_role enum not found in public schema';
  END IF;
END $$;