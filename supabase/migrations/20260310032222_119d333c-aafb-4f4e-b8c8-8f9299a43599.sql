
-- ============================================================================
-- QC Confidentiality: Restrict access to Reviewee, Manager, SuperAdmin, Vivacity Team only
-- Remove tenant-wide access (has_tenant_access_safe) and Admin role access
-- ============================================================================

-- 1. Update can_access_qc function to remove tenant Admin access
CREATE OR REPLACE FUNCTION public.can_access_qc(_user_id UUID, _qc_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qc RECORD;
BEGIN
  -- Get QC details
  SELECT reviewee_id, manager_ids, tenant_id INTO v_qc
  FROM public.eos_qc
  WHERE id = _qc_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if user is reviewee or manager
  IF v_qc.reviewee_id = _user_id OR _user_id = ANY(v_qc.manager_ids) THEN
    RETURN true;
  END IF;
  
  -- Check if user is SuperAdmin or Vivacity Team (admin oversight)
  IF public.is_super_admin_safe(_user_id) OR public.is_vivacity_team_safe(_user_id) THEN
    RETURN true;
  END IF;
  
  -- No tenant-wide admin access - QCs are confidential
  RETURN false;
END;
$$;

-- 2. Replace eos_qc SELECT policy to remove has_tenant_access_safe
DROP POLICY IF EXISTS "eos_qc_select" ON public.eos_qc;

CREATE POLICY "eos_qc_select" ON public.eos_qc
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR reviewee_id = auth.uid()
  OR auth.uid() = ANY(manager_ids)
);
