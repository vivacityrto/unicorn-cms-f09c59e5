-- Function to update tenant status based on user statuses
CREATE OR REPLACE FUNCTION update_tenant_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the tenant's status based on all its users
  UPDATE public.tenants t
  SET status = CASE
    WHEN EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.tenant_id = t.id 
      AND u.disabled = false 
      AND u.archived = false
    ) THEN 'active'
    ELSE 'inactive'
  END
  WHERE t.id = COALESCE(NEW.tenant_id, OLD.tenant_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to update tenant status when users are modified
DROP TRIGGER IF EXISTS trigger_update_tenant_status ON public.users;
CREATE TRIGGER trigger_update_tenant_status
  AFTER INSERT OR UPDATE OF disabled, archived, tenant_id OR DELETE
  ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_status();