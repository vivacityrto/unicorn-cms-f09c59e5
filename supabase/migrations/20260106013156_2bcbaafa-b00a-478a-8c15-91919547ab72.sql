-- Drop existing function
DROP FUNCTION IF EXISTS public.create_meeting_basic(integer, text, text, timestamptz, integer, uuid);

-- Recreate with correct schema (no facilitator_id column, use created_by instead)
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
  -- Create the meeting (using created_by, NOT facilitator_id which doesn't exist)
  INSERT INTO public.eos_meetings (
    tenant_id,
    title,
    meeting_type,
    scheduled_date,
    duration_minutes,
    created_by,
    is_complete
  ) VALUES (
    p_tenant_id,
    p_title,
    p_meeting_type::public.eos_meeting_type,
    p_scheduled_date,
    p_duration_minutes,
    p_facilitator_id,
    false
  )
  RETURNING id INTO v_meeting_id;

  -- Add facilitator as a participant with Leader role
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