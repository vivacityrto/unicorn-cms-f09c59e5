CREATE OR REPLACE FUNCTION public.fn_audit_tenant_engagement_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action text;
  v_details jsonb;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    v_action := 'settings_created';
    v_details := jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'after', to_jsonb(NEW)
    );
  ELSE
    v_action := 'settings_updated';
    v_details := jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'before', to_jsonb(OLD),
      'after', to_jsonb(NEW)
    );
  END IF;

  INSERT INTO public.audit_events (entity, entity_id, action, user_id, details, created_at)
  VALUES ('tenant_engagement_settings', NEW.id, v_action, auth.uid(), v_details, now());

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_audit_tenant_engagement_settings() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_audit_tenant_engagement_settings_insert ON public.tenant_engagement_settings;
CREATE TRIGGER trg_audit_tenant_engagement_settings_insert
AFTER INSERT ON public.tenant_engagement_settings
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_tenant_engagement_settings();

DROP TRIGGER IF EXISTS trg_audit_tenant_engagement_settings_update ON public.tenant_engagement_settings;
CREATE TRIGGER trg_audit_tenant_engagement_settings_update
AFTER UPDATE ON public.tenant_engagement_settings
FOR EACH ROW
WHEN (OLD IS DISTINCT FROM NEW)
EXECUTE FUNCTION public.fn_audit_tenant_engagement_settings();

-- Rollback:
-- DROP TRIGGER IF EXISTS trg_audit_tenant_engagement_settings_insert ON public.tenant_engagement_settings;
-- DROP TRIGGER IF EXISTS trg_audit_tenant_engagement_settings_update ON public.tenant_engagement_settings;
-- DROP FUNCTION IF EXISTS public.fn_audit_tenant_engagement_settings();