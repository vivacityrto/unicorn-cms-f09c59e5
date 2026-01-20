-- Update audit_eos_change() to handle tables without meeting_id column (like eos_qc)
CREATE OR REPLACE FUNCTION public.audit_eos_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id BIGINT;
  v_meeting_id UUID;
  v_action TEXT;
  v_record JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_record := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'updated';
    v_record := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_record := to_jsonb(OLD);
  END IF;

  -- Safely extract tenant_id
  v_tenant_id := COALESCE(
    (v_record->>'tenant_id')::BIGINT,
    NULL
  );

  -- Safely extract meeting_id if it exists
  v_meeting_id := CASE 
    WHEN v_record ? 'meeting_id' THEN (v_record->>'meeting_id')::UUID
    ELSE NULL
  END;

  INSERT INTO public.audit_eos_events (
    tenant_id,
    user_id,
    meeting_id,
    entity,
    entity_id,
    action,
    details
  ) VALUES (
    v_tenant_id,
    auth.uid(),
    v_meeting_id,
    TG_TABLE_NAME,
    COALESCE((v_record->>'id')::UUID, NULL),
    v_action,
    v_record
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;