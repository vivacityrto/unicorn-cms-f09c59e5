-- Migration 3/5: Audit trigger for public.client_audit_responses -> public.client_audit_log
-- tenant_id resolved via JOIN to public.client_audits.subject_tenant_id.
-- Hardened: SECURITY DEFINER + SET search_path = '' + fully-qualified references.

CREATE OR REPLACE FUNCTION public.fn_audit_client_audit_responses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_action     text;
  v_actor      uuid;
  v_tenant     bigint;
  v_audit_id   uuid;
  v_entity_id  uuid;
  v_before     jsonb;
  v_after      jsonb;
  -- AI scratch fields stripped from snapshot
  v_strip      text[] := ARRAY[
    'ai_excerpts','ai_gaps','ai_analyzed_at','ai_analysis_id',
    'ai_model','ai_confidence','ai_suggested_rating','ai_suggested_notes'
  ];
  v_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action    := 'create';
    v_actor     := COALESCE(auth.uid(), NEW.responded_by);
    v_audit_id  := NEW.audit_id;
    v_entity_id := NEW.id;
    v_after     := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action    := 'update';
    v_actor     := COALESCE(auth.uid(), NEW.responded_by, OLD.responded_by);
    v_audit_id  := COALESCE(NEW.audit_id, OLD.audit_id);
    v_entity_id := COALESCE(NEW.id, OLD.id);
    v_before    := to_jsonb(OLD);
    v_after     := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action    := 'delete';
    v_actor     := COALESCE(auth.uid(), OLD.responded_by);
    v_audit_id  := OLD.audit_id;
    v_entity_id := OLD.id;
    v_before    := to_jsonb(OLD);
  END IF;

  -- Strip AI scratch columns from snapshots
  FOREACH v_key IN ARRAY v_strip LOOP
    IF v_before IS NOT NULL THEN v_before := v_before - v_key; END IF;
    IF v_after  IS NOT NULL THEN v_after  := v_after  - v_key; END IF;
  END LOOP;

  -- Resolve tenant_id via parent audit
  SELECT ca.subject_tenant_id INTO v_tenant
  FROM public.client_audits ca
  WHERE ca.id = v_audit_id;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'fn_audit_client_audit_responses: orphan audit_id=% (no parent client_audits row); skipping audit row', v_audit_id;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data, details
  ) VALUES (
    v_tenant,
    v_actor,
    v_action,
    'client_audit_response',
    v_entity_id::text,
    v_before,
    v_after,
    jsonb_build_object(
      'audit_id',    v_audit_id,
      'section_id',  COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'section_id')::uuid, NULL),
      'question_id', COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'question_id')::uuid, NULL)
    )
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_audit_client_audit_responses() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_audit_client_audit_responses ON public.client_audit_responses;

CREATE TRIGGER trg_audit_client_audit_responses
AFTER INSERT OR UPDATE OR DELETE ON public.client_audit_responses
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_client_audit_responses();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_audit_client_audit_responses ON public.client_audit_responses;
-- DROP FUNCTION IF EXISTS public.fn_audit_client_audit_responses();