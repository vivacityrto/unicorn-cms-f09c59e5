CREATE OR REPLACE FUNCTION public.fn_audit_client_audit_findings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id bigint;
  v_actor uuid;
  v_action text;
  v_before jsonb;
  v_after jsonb;
  v_audit_id uuid;
BEGIN
  v_actor := auth.uid();

  IF (TG_OP = 'DELETE') THEN
    v_action := 'delete';
    v_audit_id := OLD.audit_id;
    v_before := to_jsonb(OLD);
    v_after := NULL;
  ELSIF (TG_OP = 'INSERT') THEN
    v_action := 'create';
    v_audit_id := NEW.audit_id;
    v_before := NULL;
    v_after := to_jsonb(NEW);
  ELSE
    v_action := 'update';
    v_audit_id := NEW.audit_id;
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  END IF;

  SELECT ca.subject_tenant_id INTO v_tenant_id
    FROM public.client_audits ca
   WHERE ca.id = v_audit_id;

  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data, details, created_at
  ) VALUES (
    v_tenant_id,
    v_actor,
    v_action,
    'client_audit_finding',
    (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END)::text,
    v_before,
    v_after,
    jsonb_build_object(
      'audit_id', v_audit_id,
      'response_id', (CASE WHEN TG_OP = 'DELETE' THEN OLD.response_id ELSE NEW.response_id END),
      'section_id', (CASE WHEN TG_OP = 'DELETE' THEN OLD.section_id ELSE NEW.section_id END),
      'finding_code', (CASE WHEN TG_OP = 'DELETE' THEN OLD.finding_code ELSE NEW.finding_code END)
    ),
    now()
  );

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;