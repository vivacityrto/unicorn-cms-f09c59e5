-- Fix create_meeting_basic: eos_meetings has no status column
CREATE OR REPLACE FUNCTION public.create_meeting_basic(
  p_tenant_id integer,
  p_meeting_type text,
  p_title text,
  p_scheduled_date timestamp with time zone,
  p_duration_minutes integer,
  p_facilitator_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_meeting_id uuid;
BEGIN
  INSERT INTO public.eos_meetings (
    tenant_id,
    meeting_type,
    title,
    scheduled_date,
    duration_minutes,
    created_by
  ) VALUES (
    p_tenant_id,
    p_meeting_type::eos_meeting_type,
    p_title,
    p_scheduled_date,
    p_duration_minutes,
    p_facilitator_id
  )
  RETURNING id INTO v_meeting_id;

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