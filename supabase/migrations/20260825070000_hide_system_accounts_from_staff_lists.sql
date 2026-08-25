-- The bulk-generate automation account (bulk-generate-automation@vivacity.com.au)
-- is a real `users` row with is_vivacity_internal = true so it can pass staff-only
-- RPC gates, but that means every staff-listing query/function that filters on
-- is_vivacity_internal = true (team directory, meeting attendee auto-seeding,
-- consultant/auditor/KPI pickers, etc.) also picks it up as if it were a person.
-- Add an explicit flag so listing surfaces can exclude system/service accounts
-- without weakening the internal-staff permission checks those accounts still
-- need to pass.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_system_account boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_system_account IS
  'True for non-human service/automation accounts (e.g. bulk-generate-automation@vivacity.com.au). These still pass is_vivacity_internal-gated RPCs but must be excluded from any staff-facing listing (team directory, meeting attendee auto-seed, pickers).';

UPDATE public.users
SET is_system_account = true
WHERE lower(COALESCE(email, email_address)) = 'bulk-generate-automation@vivacity.com.au';

-- Team directory RPCs backing most staff pickers across the app.
CREATE OR REPLACE FUNCTION public.get_vivacity_team_directory()
 RETURNS TABLE(user_uuid uuid, first_name text, last_name text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT u.user_uuid, u.first_name, u.last_name, u.avatar_url
  FROM public.users u
  WHERE u.is_vivacity_internal = true
    AND COALESCE(u.archived, false) = false
    AND COALESCE(u.disabled, false) = false
    AND COALESCE(u.is_system_account, false) = false
    AND COALESCE(u.kpi_pod, '') <> 'qa'
  ORDER BY u.first_name NULLS LAST, u.last_name NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.get_vivacity_team_directory_staff()
 RETURNS TABLE(user_uuid uuid, first_name text, last_name text, avatar_url text, email text, job_title text, unicorn_role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT u.user_uuid, u.first_name, u.last_name, u.avatar_url,
         u.email, u.job_title, u.unicorn_role
  FROM public.users u
  WHERE public.is_vivacity_team_safe(auth.uid())
    AND u.is_vivacity_internal = true
    AND COALESCE(u.archived, false) = false
    AND COALESCE(u.disabled, false) = false
    AND COALESCE(u.is_system_account, false) = false
    AND COALESCE(u.kpi_pod, '') <> 'qa'
  ORDER BY u.first_name NULLS LAST, u.last_name NULLS LAST;
$function$;

-- L10 meeting attendee auto-seeding — the two paths that pull in "every
-- Vivacity internal user" for a meeting's tenant.
CREATE OR REPLACE FUNCTION public.seed_meeting_attendees_from_roles(p_meeting_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_meeting RECORD;
  v_inserted_count integer := 0;
  v_participant_count integer := 0;
  v_vivacity_count integer := 0;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  IF v_meeting IS NULL THEN RAISE EXCEPTION 'Meeting not found'; END IF;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  SELECT p_meeting_id, mp.user_id,
    CASE mp.role::text WHEN 'Leader' THEN 'owner' ELSE 'attendee' END,
    'invited', NOW(), NOW()
  FROM public.eos_meeting_participants mp
  WHERE mp.meeting_id = p_meeting_id
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = mp.user_id)
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_participant_count = ROW_COUNT;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  SELECT p_meeting_id, ur.user_id,
    CASE ur.role WHEN 'visionary' THEN 'visionary' WHEN 'integrator' THEN 'integrator' ELSE 'core_team' END,
    'invited', NOW(), NOW()
  FROM public.eos_user_roles ur
  INNER JOIN public.users u ON u.user_uuid = ur.user_id
  WHERE ur.tenant_id = v_meeting.tenant_id
    AND u.is_vivacity_internal = true
    AND COALESCE(u.disabled, false) = false
    AND COALESCE(u.archived, false) = false
    AND COALESCE(u.is_system_account, false) = false
    AND COALESCE(u.kpi_pod, '') <> 'qa'
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = ur.user_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  SELECT p_meeting_id, u.user_uuid, 'core_team', 'invited', NOW(), NOW()
  FROM public.users u
  WHERE v_meeting.tenant_id = 6372
    AND u.is_vivacity_internal = true
    AND COALESCE(u.disabled, false) = false
    AND COALESCE(u.archived, false) = false
    AND COALESCE(u.is_system_account, false) = false
    AND COALESCE(u.kpi_pod, '') <> 'qa'
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = u.user_uuid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_vivacity_count = ROW_COUNT;

  RETURN v_participant_count + v_inserted_count + v_vivacity_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_l10_meeting_participants(p_meeting_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_meeting_type text;
  v_added_count integer := 0;
  v_total_count integer := 0;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT meeting_type::text INTO v_meeting_type
  FROM public.eos_meetings WHERE id = p_meeting_id;

  IF v_meeting_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;

  IF v_meeting_type != 'L10' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an L10 meeting');
  END IF;

  WITH inserted AS (
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT p_meeting_id, au.id, 'Member'
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.is_vivacity_internal = true
      AND u.archived IS DISTINCT FROM true
      AND COALESCE(u.is_system_account, false) = false
    ON CONFLICT (meeting_id, user_id) DO NOTHING
    RETURNING user_id
  )
  SELECT count(*) INTO v_added_count FROM inserted;

  SELECT count(*) INTO v_total_count
  FROM public.eos_meeting_participants WHERE meeting_id = p_meeting_id;

  RETURN jsonb_build_object(
    'success', true, 'meeting_id', p_meeting_id,
    'added_count', v_added_count, 'total_count', v_total_count
  );
END;
$function$;

-- Clean up attendee rows the automation account was already auto-seeded into
-- before this fix (only ever inserted by the functions replaced above).
DELETE FROM public.eos_meeting_attendees a
USING public.users u
WHERE a.user_id = u.user_uuid
  AND u.is_system_account = true;

DELETE FROM public.eos_meeting_participants p
USING auth.users au
JOIN public.users u ON u.user_uuid = au.id
WHERE p.user_id = au.id
  AND u.is_system_account = true;
