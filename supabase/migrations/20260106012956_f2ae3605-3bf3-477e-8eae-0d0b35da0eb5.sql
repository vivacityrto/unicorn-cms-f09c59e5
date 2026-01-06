-- Drop existing function first (parameter names differ)
DROP FUNCTION IF EXISTS public.create_meeting_basic(integer, text, text, timestamptz, integer, uuid);

-- Recreate with correct enum value 'Leader' (capitalized)
CREATE FUNCTION public.create_meeting_basic(
  p_tenant_id integer,
  p_title text,
  p_meeting_type text,
  p_scheduled_date timestamptz,
  p_duration_minutes integer,
  p_facilitator_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_id uuid;
BEGIN
  -- Create the meeting
  INSERT INTO public.eos_meetings (
    tenant_id,
    title,
    meeting_type,
    scheduled_date,
    duration_minutes,
    facilitator_id,
    status
  ) VALUES (
    p_tenant_id,
    p_title,
    p_meeting_type::public.eos_meeting_type,
    p_scheduled_date,
    p_duration_minutes,
    p_facilitator_id,
    'Scheduled'
  )
  RETURNING id INTO v_meeting_id;

  -- Add facilitator as a participant with correct enum value (capital L)
  INSERT INTO public.eos_meeting_participants (
    meeting_id,
    user_id,
    role,
    attended
  ) VALUES (
    v_meeting_id,
    p_facilitator_id,
    'Leader'::public.eos_participant_role,
    false
  );

  RETURN v_meeting_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_meeting_basic(integer, text, text, timestamptz, integer, uuid) TO authenticated;