-- Tighten compliance_audits / responses / corrective_actions write access.
-- Previously a single FOR ALL policy allowed any tenant user to write.
-- Split into SELECT (all tenant members) vs INSERT/UPDATE/DELETE (Admin or Vivacity staff).

DROP POLICY IF EXISTS compliance_audits_access ON public.compliance_audits;
DROP POLICY IF EXISTS compliance_responses_access ON public.compliance_audit_responses;
DROP POLICY IF EXISTS compliance_caa_access ON public.compliance_corrective_actions;

-- compliance_audits
CREATE POLICY compliance_audits_select ON public.compliance_audits
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = (SELECT auth.uid())
        AND (u.is_vivacity_internal = true
             OR u.global_role = ANY (ARRAY['superadmin','admin'])
             OR u.tenant_id = compliance_audits.tenant_id)
    )
  );

CREATE POLICY compliance_audits_write ON public.compliance_audits
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = (SELECT auth.uid())
        AND (u.is_vivacity_internal = true
             OR u.global_role = ANY (ARRAY['superadmin','admin'])
             OR EXISTS (
                  SELECT 1 FROM public.tenant_members tm
                  WHERE tm.user_id = u.user_uuid
                    AND tm.tenant_id = compliance_audits.tenant_id
                    AND tm.role = 'Admin'
                    AND tm.status = 'active'
                ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = (SELECT auth.uid())
        AND (u.is_vivacity_internal = true
             OR u.global_role = ANY (ARRAY['superadmin','admin'])
             OR EXISTS (
                  SELECT 1 FROM public.tenant_members tm
                  WHERE tm.user_id = u.user_uuid
                    AND tm.tenant_id = compliance_audits.tenant_id
                    AND tm.role = 'Admin'
                    AND tm.status = 'active'
                ))
    )
  );

-- compliance_audit_responses
CREATE POLICY compliance_responses_select ON public.compliance_audit_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compliance_audits ca
      JOIN public.users u ON u.user_uuid = (SELECT auth.uid())
      WHERE ca.id = compliance_audit_responses.audit_id
        AND (u.is_vivacity_internal = true
             OR u.global_role = ANY (ARRAY['superadmin','admin'])
             OR u.tenant_id = ca.tenant_id)
    )
  );

CREATE POLICY compliance_responses_write ON public.compliance_audit_responses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compliance_audits ca
      JOIN public.users u ON u.user_uuid = (SELECT auth.uid())
      WHERE ca.id = compliance_audit_responses.audit_id
        AND (u.is_vivacity_internal = true
             OR u.global_role = ANY (ARRAY['superadmin','admin'])
             OR EXISTS (
                  SELECT 1 FROM public.tenant_members tm
                  WHERE tm.user_id = u.user_uuid
                    AND tm.tenant_id = ca.tenant_id
                    AND tm.role = 'Admin'
                    AND tm.status = 'active'
                ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.compliance_audits ca
      JOIN public.users u ON u.user_uuid = (SELECT auth.uid())
      WHERE ca.id = compliance_audit_responses.audit_id
        AND (u.is_vivacity_internal = true
             OR u.global_role = ANY (ARRAY['superadmin','admin'])
             OR EXISTS (
                  SELECT 1 FROM public.tenant_members tm
                  WHERE tm.user_id = u.user_uuid
                    AND tm.tenant_id = ca.tenant_id
                    AND tm.role = 'Admin'
                    AND tm.status = 'active'
                ))
    )
  );

-- compliance_corrective_actions
CREATE POLICY compliance_caa_select ON public.compliance_corrective_actions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compliance_audits ca
      JOIN public.users u ON u.user_uuid = (SELECT auth.uid())
      WHERE ca.id = compliance_corrective_actions.audit_id
        AND (u.is_vivacity_internal = true
             OR u.global_role = ANY (ARRAY['superadmin','admin'])
             OR u.tenant_id = ca.tenant_id)
    )
  );

CREATE POLICY compliance_caa_write ON public.compliance_corrective_actions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compliance_audits ca
      JOIN public.users u ON u.user_uuid = (SELECT auth.uid())
      WHERE ca.id = compliance_corrective_actions.audit_id
        AND (u.is_vivacity_internal = true
             OR u.global_role = ANY (ARRAY['superadmin','admin'])
             OR EXISTS (
                  SELECT 1 FROM public.tenant_members tm
                  WHERE tm.user_id = u.user_uuid
                    AND tm.tenant_id = ca.tenant_id
                    AND tm.role = 'Admin'
                    AND tm.status = 'active'
                ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.compliance_audits ca
      JOIN public.users u ON u.user_uuid = (SELECT auth.uid())
      WHERE ca.id = compliance_corrective_actions.audit_id
        AND (u.is_vivacity_internal = true
             OR u.global_role = ANY (ARRAY['superadmin','admin'])
             OR EXISTS (
                  SELECT 1 FROM public.tenant_members tm
                  WHERE tm.user_id = u.user_uuid
                    AND tm.tenant_id = ca.tenant_id
                    AND tm.role = 'Admin'
                    AND tm.status = 'active'
                ))
    )
  );