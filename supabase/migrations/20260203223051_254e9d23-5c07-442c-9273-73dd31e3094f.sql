-- Phase 1A: Fix audit_accountability_chart_change() to use UUID instead of text cast
CREATE OR REPLACE FUNCTION public.audit_accountability_chart_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    COALESCE(NEW.id, OLD.id),  -- UUID directly, no ::text cast
    TG_OP,
    auth.uid(),
    jsonb_build_object(
      'old', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
      'new', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Phase 2C: Drop the cascade trigger to prevent Rocks writes during owner assignment
-- This decouples Accountability Chart from Rocks updates
DROP TRIGGER IF EXISTS tr_cascade_seat_owner_to_rocks ON public.accountability_seat_assignments;

-- Add comment explaining the function is now detached
COMMENT ON FUNCTION public.cascade_seat_owner_to_rocks() IS 
  'DISABLED: This function is no longer triggered automatically from accountability_seat_assignments. 
   Rock owner sync from Accountability was removed to prevent cross-module side effects.
   If rock-owner sync is needed, invoke it explicitly from the Rocks module via a dedicated RPC.';