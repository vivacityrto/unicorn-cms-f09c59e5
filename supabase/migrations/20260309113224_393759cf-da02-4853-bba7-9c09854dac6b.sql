
-- Recreate the function with bigint parameter to match package_instances.tenant_id type
CREATE OR REPLACE FUNCTION public.derive_org_type_for_tenant(p_tenant_id bigint)
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
  SELECT EXISTS (
    SELECT 1 FROM package_instances pi
    JOIN packages p ON p.id = pi.package_id
    WHERE pi.tenant_id = p_tenant_id
      AND p.slug IN ('KS-RTO','M-AM','M-DR','M-GR','M-RR','M-SAR','DOC-R',
        'CHC','AV','ACC','FT-St','DD','GC','AO>2','PP','SH-AR','SK-EC','KS')
  ) INTO has_rto;

  SELECT EXISTS (
    SELECT 1 FROM package_instances pi
    JOIN packages p ON p.id = pi.package_id
    WHERE pi.tenant_id = p_tenant_id
      AND p.slug IN ('KS-CRI','M-BC','M-DC','M-GC','M-RC','M-SAC','DOC-C')
  ) INTO has_cricos;

  SELECT EXISTS (
    SELECT 1 FROM package_instances pi
    JOIN packages p ON p.id = pi.package_id
    WHERE pi.tenant_id = p_tenant_id
      AND p.slug IN ('KS-GTO','KS-GTO-N','M-GTO')
  ) INTO has_gto;

  IF has_rto AND has_cricos THEN
    derived_type := 'RTO+CRICOS';
  ELSIF has_rto THEN
    derived_type := 'RTO';
  ELSIF has_cricos THEN
    derived_type := 'CRICOS';
  ELSIF has_gto THEN
    derived_type := 'GTO';
  ELSE
    derived_type := NULL;
  END IF;

  IF derived_type IS NOT NULL THEN
    UPDATE tenant_profile
    SET org_type = derived_type, updated_at = now()
    WHERE tenant_id = p_tenant_id;
  END IF;
END;
$$;

-- Drop the old integer version to avoid ambiguity
DROP FUNCTION IF EXISTS public.derive_org_type_for_tenant(integer);
