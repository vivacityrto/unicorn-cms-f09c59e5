-- Migrate the centralized staff-directory/meeting-seeding functions from the
-- legacy kpi_pod='qa' check to the new is_qa_persona flag (Carl, 2026-09-15).
-- sync_l10_meeting_participants had NO qa-persona exclusion at all before
-- this change -- a separate, previously-unknown gap closed incidentally here.

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
    AND COALESCE(u.is_qa_persona, false) = false
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
    AND COALESCE(u.is_qa_persona, false) = false
  ORDER BY u.first_name NULLS LAST, u.last_name NULLS LAST;
$function$;

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
    AND COALESCE(u.is_qa_persona, false) = false
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
    AND COALESCE(u.is_qa_persona, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = u.user_uuid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_vivacity_count = ROW_COUNT;

  RETURN v_participant_count + v_inserted_count + v_vivacity_count;
END;
$function$;

-- sync_l10_meeting_participants previously had NO qa-persona exclusion at
-- all (a pre-existing gap, unrelated to kpi_pod) -- closed here.
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
      AND COALESCE(u.is_qa_persona, false) = false
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
