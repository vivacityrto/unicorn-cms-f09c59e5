-- ============================================================================
-- Phase 2: RLS Policy Standardization - EOS Tables (Final Fix)
-- ============================================================================

-- ============================================================================
-- EOS_QC (Quarterly Conversations) - Uses workspace_id, not tenant_id
-- ============================================================================
DROP POLICY IF EXISTS "eos_qc_select" ON public.eos_qc;
DROP POLICY IF EXISTS "eos_qc_manage" ON public.eos_qc;
DROP POLICY IF EXISTS "Vivacity team can view qc" ON public.eos_qc;
DROP POLICY IF EXISTS "Vivacity team can manage qc" ON public.eos_qc;

CREATE POLICY "eos_qc_select" ON public.eos_qc
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
  OR reviewee_id = auth.uid()
  OR auth.uid() = ANY(manager_ids)
);

CREATE POLICY "eos_qc_manage" ON public.eos_qc
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR auth.uid() = ANY(manager_ids)
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR auth.uid() = ANY(manager_ids)
);

-- ============================================================================
-- EOS_WORKSPACES - Lookup table, no tenant_id
-- ============================================================================
DROP POLICY IF EXISTS "eos_workspaces_select" ON public.eos_workspaces;
DROP POLICY IF EXISTS "eos_workspaces_manage" ON public.eos_workspaces;

-- All authenticated users can view workspaces (it's a lookup table)
CREATE POLICY "eos_workspaces_select" ON public.eos_workspaces
FOR SELECT TO authenticated
USING (true);

-- Only SuperAdmins can manage workspaces
CREATE POLICY "eos_workspaces_manage" ON public.eos_workspaces
FOR ALL TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));