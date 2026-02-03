-- Fix audit_accountability_chart_change trigger function to properly cast entity_id as UUID
CREATE OR REPLACE FUNCTION public.audit_accountability_chart_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_eos_events (
    tenant_id,
    entity,
    entity_id,
    action,
    user_id,
    details
  ) VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),  -- Remove ::text cast, keep as UUID
    TG_OP,
    auth.uid(),
    jsonb_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME,
      'new_data', CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) ELSE NULL END,
      'old_data', CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD) ELSE NULL END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;