
-- ============================================================================
-- QC Confidentiality: Restrict admin oversight to SuperAdmin - Administrator only
-- Remove Vivacity Team (Team Leader, General) access to QC records
-- ============================================================================

-- 1. Create a dedicated helper for QC admin oversight
CREATE OR REPLACE FUNCTION public.is_qc_admin_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = p_user_id
      AND unicorn_role = 'Super Admin'
      AND superadmin_level = 'Administrator'
      AND archived IS DISTINCT FROM true
  );
$$;

COMMENT ON FUNCTION public.is_qc_admin_safe(uuid) IS 
'Checks if user is SuperAdmin - Administrator level. Used for QC confidentiality oversight.';

GRANT EXECUTE ON FUNCTION public.is_qc_admin_safe(uuid) TO authenticated;

-- 2. Update can_access_qc to use the new function
CREATE OR REPLACE FUNCTION public.can_access_qc(_user_id UUID, _qc_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qc RECORD;
BEGIN
  SELECT reviewee_id, manager_ids, tenant_id INTO v_qc
  FROM public.eos_qc
  WHERE id = _qc_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Reviewee or Manager
  IF v_qc.reviewee_id = _user_id OR _user_id = ANY(v_qc.manager_ids) THEN
    RETURN true;
  END IF;
  
  -- Only SuperAdmin - Administrator level has oversight
  IF public.is_qc_admin_safe(_user_id) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- 3. Replace eos_qc SELECT policy
DROP POLICY IF EXISTS "eos_qc_select" ON public.eos_qc;

CREATE POLICY "eos_qc_select" ON public.eos_qc
FOR SELECT TO authenticated
USING (
  public.is_qc_admin_safe(auth.uid())
  OR reviewee_id = auth.uid()
  OR auth.uid() = ANY(manager_ids)
);

-- 4. Replace eos_qc manage policy
DROP POLICY IF EXISTS "eos_qc_manage" ON public.eos_qc;

CREATE POLICY "eos_qc_manage" ON public.eos_qc
FOR ALL TO authenticated
USING (
  public.is_qc_admin_safe(auth.uid())
  OR auth.uid() = ANY(manager_ids)
)
WITH CHECK (
  public.is_qc_admin_safe(auth.uid())
  OR auth.uid() = ANY(manager_ids)
);
