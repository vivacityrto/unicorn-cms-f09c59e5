-- Create trigger function to sync tenants.rto_id to tenant_profile.rto_number
CREATE OR REPLACE FUNCTION public.sync_tenant_rto_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if rto_id is set
  IF NEW.rto_id IS NOT NULL AND NEW.rto_id != '' THEN
    INSERT INTO public.tenant_profile (tenant_id, rto_number, updated_at)
    VALUES (NEW.id, NEW.rto_id, now())
    ON CONFLICT (tenant_id)
    DO UPDATE SET 
      rto_number = EXCLUDED.rto_number,
      updated_at = now()
    WHERE tenant_profile.rto_number IS NULL OR tenant_profile.rto_number = '';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on tenants table
CREATE TRIGGER sync_rto_id_to_profile
  AFTER INSERT OR UPDATE OF rto_id ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tenant_rto_to_profile();