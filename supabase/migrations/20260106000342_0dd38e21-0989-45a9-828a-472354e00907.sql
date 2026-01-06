-- Drop legacy duplicate RLS policies on eos_meetings
DROP POLICY IF EXISTS "eos_meetings_select" ON public.eos_meetings;
DROP POLICY IF EXISTS "eos_meetings_insert" ON public.eos_meetings;
DROP POLICY IF EXISTS "eos_meetings_update" ON public.eos_meetings;
DROP POLICY IF EXISTS "eos_meetings_delete" ON public.eos_meetings;

-- Drop legacy duplicate RLS policies on eos_meeting_participants
DROP POLICY IF EXISTS "eos_meeting_participants_select" ON public.eos_meeting_participants;
DROP POLICY IF EXISTS "eos_meeting_participants_insert" ON public.eos_meeting_participants;
DROP POLICY IF EXISTS "eos_meeting_participants_update" ON public.eos_meeting_participants;
DROP POLICY IF EXISTS "eos_meeting_participants_delete" ON public.eos_meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_select" ON public.eos_meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_insert" ON public.eos_meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_update" ON public.eos_meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_delete" ON public.eos_meeting_participants;

-- Drop legacy duplicate RLS policies on eos_meeting_segments
DROP POLICY IF EXISTS "eos_meeting_segments_select" ON public.eos_meeting_segments;
DROP POLICY IF EXISTS "eos_meeting_segments_insert" ON public.eos_meeting_segments;
DROP POLICY IF EXISTS "eos_meeting_segments_update" ON public.eos_meeting_segments;
DROP POLICY IF EXISTS "eos_meeting_segments_delete" ON public.eos_meeting_segments;

-- Create a security definer function to create meetings without template
-- This bypasses RLS and avoids the recursion issue
CREATE OR REPLACE FUNCTION public.create_meeting_basic(
  p_tenant_id integer,
  p_meeting_type text,
  p_title text,
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
  -- Insert the meeting
  INSERT INTO public.eos_meetings (
    tenant_id,
    meeting_type,
    title,
    scheduled_date,
    duration_minutes,
    created_by,
    status
  ) VALUES (
    p_tenant_id,
    p_meeting_type::eos_meeting_type,
    p_title,
    p_scheduled_date,
    p_duration_minutes,
    p_facilitator_id,
    'scheduled'
  )
  RETURNING id INTO v_meeting_id;

  -- Add the facilitator as a participant with 'leader' role
  INSERT INTO public.eos_meeting_participants (
    meeting_id,
    user_id,
    role
  ) VALUES (
    v_meeting_id,
    p_facilitator_id,
    'leader'
  );

  RETURN v_meeting_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_meeting_basic(integer, text, text, timestamptz, integer, uuid) TO authenticated;