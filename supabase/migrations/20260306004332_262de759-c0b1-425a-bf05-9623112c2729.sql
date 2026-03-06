
-- Function to derive org_type from package history
CREATE OR REPLACE FUNCTION public.derive_org_type_for_tenant(p_tenant_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_rto boolean := false;
  has_cricos boolean := false;
  has_gto boolean := false;
  derived_type text;
BEGIN
  -- Check for RTO indicator packages
  SELECT EXISTS (
    SELECT 1
    FROM package_instances pi
    JOIN packages p ON p.id = pi.package_id
    WHERE pi.tenant_id = p_tenant_id
      AND p.slug IN (
        'KS-RTO','M-AM','M-DR','M-GR','M-RR','M-SAR','DOC-R',
        'CHC','AV','ACC','FT-St','DD','GC','AO>2','PP','SH-AR','SK-EC','KS'
      )
  ) INTO has_rto;

  -- Check for CRICOS indicator packages
  SELECT EXISTS (
    SELECT 1
    FROM package_instances pi
    JOIN packages p ON p.id = pi.package_id
    WHERE pi.tenant_id = p_tenant_id
      AND p.slug IN (
        'KS-CRI','M-BC','M-DC','M-GC','M-RC','M-SAC','DOC-C'
      )
  ) INTO has_cricos;

  -- Check for GTO indicator packages
  SELECT EXISTS (
    SELECT 1
    FROM package_instances pi
    JOIN packages p ON p.id = pi.package_id
    WHERE pi.tenant_id = p_tenant_id
      AND p.slug IN (
        'KS-GTO','KS-GTO-N','M-GTO'
      )
  ) INTO has_gto;

  -- Derive the org_type
  IF has_rto AND has_cricos THEN
    derived_type := 'rto_cricos';
  ELSIF has_rto THEN
    derived_type := 'rto';
  ELSIF has_cricos THEN
    derived_type := 'cricos';
  ELSIF has_gto THEN
    derived_type := 'gto';
  ELSE
    RETURN; -- No indicator packages found, leave unchanged
  END IF;

  -- Only update if org_type is currently NULL (don't override manual overrides)
  UPDATE tenant_profile
  SET org_type = derived_type
  WHERE tenant_id = p_tenant_id
    AND (org_type IS NULL OR org_type = '');
END;
$$;

-- Trigger function for package_instances AFTER INSERT
CREATE OR REPLACE FUNCTION public.trg_derive_org_type_on_package_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM derive_org_type_for_tenant(NEW.tenant_id);
  RETURN NEW;
END;
$$;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS trg_package_instance_org_type ON public.package_instances;
CREATE TRIGGER trg_package_instance_org_type
  AFTER INSERT ON public.package_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_derive_org_type_on_package_insert();

-- Backfill: run derivation for all active tenants where org_type IS NULL
DO $$
DECLARE
  t_id integer;
BEGIN
  FOR t_id IN
    SELECT DISTINCT tp.tenant_id
    FROM tenant_profile tp
    JOIN tenants t ON t.id = tp.tenant_id
    WHERE t.status = 'active'
      AND (tp.org_type IS NULL OR tp.org_type = '')
  LOOP
    PERFORM derive_org_type_for_tenant(t_id);
  END LOOP;
END;
$$;
