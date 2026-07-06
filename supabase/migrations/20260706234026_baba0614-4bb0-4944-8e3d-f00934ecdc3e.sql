-- Fix cross-tenant leak in seed_meeting_attendees_from_roles + correct stale flag + remove leaked row

UPDATE public.users
SET is_vivacity_internal = false
WHERE user_uuid = '8c604f1c-b5f6-45db-bae5-72298b895629';

DELETE FROM public.eos_meeting_attendees
WHERE meeting_id = '34637a44-88c9-406f-b602-3d62acc3b8f3'
  AND user_id = '8c604f1c-b5f6-45db-bae5-72298b895629';

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
  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  IF v_meeting IS NULL THEN RAISE EXCEPTION 'Meeting not found'; END IF;

  -- Step 1: from eos_meeting_participants (unchanged)
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

  -- Step 2: from eos_user_roles — inner-joined to users with active/internal/QA filter
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
    AND COALESCE(u.kpi_pod, '') <> 'qa'
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = ur.user_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  -- Step 3: Vivacity team — scoped to Vivacity's own tenant only
  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  SELECT p_meeting_id, u.user_uuid, 'core_team', 'invited', NOW(), NOW()
  FROM public.users u
  WHERE v_meeting.tenant_id = 6372
    AND u.is_vivacity_internal = true
    AND COALESCE(u.disabled, false) = false
    AND COALESCE(u.archived, false) = false
    AND COALESCE(u.kpi_pod, '') <> 'qa'
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = u.user_uuid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_vivacity_count = ROW_COUNT;

  RETURN v_participant_count + v_inserted_count + v_vivacity_count;
END;
$function$;