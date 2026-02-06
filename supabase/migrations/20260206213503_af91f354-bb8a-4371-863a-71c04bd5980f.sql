-- ============================================================================
-- Phase 3: RLS Policy Standardization - Audit & Logging Tables
-- ============================================================================

-- ============================================================================
-- AUDIT (Main audit table)
-- ============================================================================
DROP POLICY IF EXISTS "audit_select" ON public.audit;
DROP POLICY IF EXISTS "audit_insert" ON public.audit;
DROP POLICY IF EXISTS "audit_update" ON public.audit;
DROP POLICY IF EXISTS "audit_delete" ON public.audit;

CREATE POLICY "audit_select" ON public.audit
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "audit_insert" ON public.audit
FOR INSERT TO authenticated
WITH CHECK (
  public.has_tenant_access_safe(tenant_id, auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "audit_update" ON public.audit
FOR UPDATE TO authenticated
USING (public.has_tenant_access_safe(tenant_id, auth.uid()))
WITH CHECK (public.has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "audit_delete" ON public.audit
FOR DELETE TO authenticated
USING (public.is_super_admin_safe(auth.uid()));

-- ============================================================================
-- AUDIT_SECTION
-- ============================================================================
DROP POLICY IF EXISTS "audit_section_select" ON public.audit_section;
DROP POLICY IF EXISTS "audit_section_insert" ON public.audit_section;
DROP POLICY IF EXISTS "audit_section_update" ON public.audit_section;
DROP POLICY IF EXISTS "audit_section_delete" ON public.audit_section;

CREATE POLICY "audit_section_select" ON public.audit_section
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.audit a
    WHERE a.id = audit_section.audit_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
);

CREATE POLICY "audit_section_manage" ON public.audit_section
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.audit a
    WHERE a.id = audit_section.audit_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.audit a
    WHERE a.id = audit_section.audit_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
);

-- ============================================================================
-- AUDIT_QUESTION_BANK (Global reference data)
-- ============================================================================
DROP POLICY IF EXISTS "audit_question_bank_select" ON public.audit_question_bank;
DROP POLICY IF EXISTS "audit_question_bank_insert" ON public.audit_question_bank;
DROP POLICY IF EXISTS "audit_question_bank_update" ON public.audit_question_bank;
DROP POLICY IF EXISTS "audit_question_bank_delete" ON public.audit_question_bank;

CREATE POLICY "audit_question_bank_select" ON public.audit_question_bank
FOR SELECT TO authenticated
USING (active = true OR public.is_super_admin_safe(auth.uid()));

CREATE POLICY "audit_question_bank_manage" ON public.audit_question_bank
FOR ALL TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- ============================================================================
-- AUDIT_QUESTION
-- ============================================================================
DROP POLICY IF EXISTS "audit_question_select" ON public.audit_question;
DROP POLICY IF EXISTS "audit_question_insert" ON public.audit_question;
DROP POLICY IF EXISTS "audit_question_update" ON public.audit_question;
DROP POLICY IF EXISTS "audit_question_delete" ON public.audit_question;

CREATE POLICY "audit_question_select" ON public.audit_question
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.audit_section s
    JOIN public.audit a ON a.id = s.audit_id
    WHERE s.id = audit_question.audit_section_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
);

CREATE POLICY "audit_question_manage" ON public.audit_question
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.audit_section s
    JOIN public.audit a ON a.id = s.audit_id
    WHERE s.id = audit_question.audit_section_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.audit_section s
    JOIN public.audit a ON a.id = s.audit_id
    WHERE s.id = audit_question.audit_section_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
);

-- ============================================================================
-- AUDIT_RESPONSE
-- ============================================================================
DROP POLICY IF EXISTS "audit_response_select" ON public.audit_response;
DROP POLICY IF EXISTS "audit_response_insert" ON public.audit_response;
DROP POLICY IF EXISTS "audit_response_update" ON public.audit_response;
DROP POLICY IF EXISTS "audit_response_delete" ON public.audit_response;

CREATE POLICY "audit_response_select" ON public.audit_response
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.audit_question q
    JOIN public.audit_section s ON s.id = q.audit_section_id
    JOIN public.audit a ON a.id = s.audit_id
    WHERE q.id = audit_response.audit_question_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
);

CREATE POLICY "audit_response_insert" ON public.audit_response
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.audit_question q
    JOIN public.audit_section s ON s.id = q.audit_section_id
    JOIN public.audit a ON a.id = s.audit_id
    WHERE q.id = audit_response.audit_question_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
);

CREATE POLICY "audit_response_update" ON public.audit_response
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.audit_question q
    JOIN public.audit_section s ON s.id = q.audit_section_id
    JOIN public.audit a ON a.id = s.audit_id
    WHERE q.id = audit_response.audit_question_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
);

-- ============================================================================
-- AUDIT_FINDING
-- ============================================================================
DROP POLICY IF EXISTS "audit_finding_select" ON public.audit_finding;
DROP POLICY IF EXISTS "audit_finding_insert" ON public.audit_finding;
DROP POLICY IF EXISTS "audit_finding_update" ON public.audit_finding;
DROP POLICY IF EXISTS "audit_finding_delete" ON public.audit_finding;

CREATE POLICY "audit_finding_select" ON public.audit_finding
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.audit a
    WHERE a.id = audit_finding.audit_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
);

CREATE POLICY "audit_finding_insert" ON public.audit_finding
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.audit a
    WHERE a.id = audit_finding.audit_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
);

CREATE POLICY "audit_finding_update" ON public.audit_finding
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.audit a
    WHERE a.id = audit_finding.audit_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
);

-- ============================================================================
-- AUDIT_ACTION
-- ============================================================================
DROP POLICY IF EXISTS "audit_action_select" ON public.audit_action;
DROP POLICY IF EXISTS "audit_action_insert" ON public.audit_action;
DROP POLICY IF EXISTS "audit_action_update" ON public.audit_action;
DROP POLICY IF EXISTS "audit_action_delete" ON public.audit_action;

CREATE POLICY "audit_action_select" ON public.audit_action
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR assigned_to = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.audit a
    WHERE a.id = audit_action.audit_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
);

CREATE POLICY "audit_action_insert" ON public.audit_action
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.audit a
    WHERE a.id = audit_action.audit_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
);

CREATE POLICY "audit_action_update" ON public.audit_action
FOR UPDATE TO authenticated
USING (
  assigned_to = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.audit a
    WHERE a.id = audit_action.audit_id
    AND public.has_tenant_access_safe(a.tenant_id, auth.uid())
  )
);

-- ============================================================================
-- AUDIT_TEMPLATES
-- ============================================================================
DROP POLICY IF EXISTS "audit_templates_select" ON public.audit_templates;
DROP POLICY IF EXISTS "audit_templates_insert" ON public.audit_templates;
DROP POLICY IF EXISTS "audit_templates_update" ON public.audit_templates;
DROP POLICY IF EXISTS "audit_templates_delete" ON public.audit_templates;
DROP POLICY IF EXISTS "SuperAdmins can manage templates" ON public.audit_templates;
DROP POLICY IF EXISTS "Users can view published templates" ON public.audit_templates;

CREATE POLICY "audit_templates_select" ON public.audit_templates
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR (access = 'public' AND status = 'published')
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "audit_templates_manage" ON public.audit_templates
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

-- ============================================================================
-- AUDIT_TEMPLATE_QUESTIONS
-- ============================================================================
DROP POLICY IF EXISTS "audit_template_questions_select" ON public.audit_template_questions;
DROP POLICY IF EXISTS "audit_template_questions_manage" ON public.audit_template_questions;

CREATE POLICY "audit_template_questions_select" ON public.audit_template_questions
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.audit_templates t
    WHERE t.id = audit_template_questions.template_id
    AND ((t.access = 'public' AND t.status = 'published')
      OR public.has_tenant_access_safe(t.tenant_id, auth.uid()))
  )
);

CREATE POLICY "audit_template_questions_manage" ON public.audit_template_questions
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

-- ============================================================================
-- AUDIT_TEMPLATE_RESPONSE_SETS
-- ============================================================================
DROP POLICY IF EXISTS "audit_template_response_sets_select" ON public.audit_template_response_sets;
DROP POLICY IF EXISTS "audit_template_response_sets_manage" ON public.audit_template_response_sets;

CREATE POLICY "audit_template_response_sets_select" ON public.audit_template_response_sets
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR is_global = true
  OR (tenant_id IS NOT NULL AND public.has_tenant_access_safe(tenant_id, auth.uid()))
);

CREATE POLICY "audit_template_response_sets_manage" ON public.audit_template_response_sets
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

-- ============================================================================
-- AUDIT_INSPECTION
-- ============================================================================
DROP POLICY IF EXISTS "audit_inspection_select" ON public.audit_inspection;
DROP POLICY IF EXISTS "audit_inspection_insert" ON public.audit_inspection;
DROP POLICY IF EXISTS "audit_inspection_update" ON public.audit_inspection;
DROP POLICY IF EXISTS "audit_inspection_delete" ON public.audit_inspection;

CREATE POLICY "audit_inspection_select" ON public.audit_inspection
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "audit_inspection_manage" ON public.audit_inspection
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- ============================================================================
-- AUDIT_LOG (User profile changes)
-- ============================================================================
DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;
DROP POLICY IF EXISTS "Users can view their own audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "SuperAdmins can view all audit logs" ON public.audit_log;

CREATE POLICY "audit_log_select" ON public.audit_log
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR user_uuid = auth.uid()
  OR editor_uuid = auth.uid()
);

CREATE POLICY "audit_log_insert" ON public.audit_log
FOR INSERT TO authenticated
WITH CHECK (editor_uuid = auth.uid());

-- ============================================================================
-- AUDIT_EVENTS (General events log)
-- ============================================================================
DROP POLICY IF EXISTS "audit_events_select" ON public.audit_events;
DROP POLICY IF EXISTS "audit_events_insert" ON public.audit_events;
DROP POLICY IF EXISTS "SuperAdmins can view audit events" ON public.audit_events;

CREATE POLICY "audit_events_select" ON public.audit_events
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

CREATE POLICY "audit_events_insert" ON public.audit_events
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- AUDIT_EOS_EVENTS
-- ============================================================================
DROP POLICY IF EXISTS "audit_eos_events_select" ON public.audit_eos_events;
DROP POLICY IF EXISTS "audit_eos_events_insert" ON public.audit_eos_events;

CREATE POLICY "audit_eos_events_select" ON public.audit_eos_events
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "audit_eos_events_insert" ON public.audit_eos_events
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- ============================================================================
-- AUDIT_INVITES (Protected - SuperAdmin only for writes)
-- ============================================================================
DROP POLICY IF EXISTS "audit_invites_select" ON public.audit_invites;
DROP POLICY IF EXISTS "audit_invites_insert" ON public.audit_invites;
DROP POLICY IF EXISTS "audit_invites_update" ON public.audit_invites;
DROP POLICY IF EXISTS "audit_invites_delete" ON public.audit_invites;

CREATE POLICY "audit_invites_select" ON public.audit_invites
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

CREATE POLICY "audit_invites_manage" ON public.audit_invites
FOR ALL TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- ============================================================================
-- AUDIT_CLIENT_IMPERSONATION
-- ============================================================================
DROP POLICY IF EXISTS "audit_client_impersonation_select" ON public.audit_client_impersonation;
DROP POLICY IF EXISTS "audit_client_impersonation_insert" ON public.audit_client_impersonation;

CREATE POLICY "audit_client_impersonation_select" ON public.audit_client_impersonation
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

CREATE POLICY "audit_client_impersonation_insert" ON public.audit_client_impersonation
FOR INSERT TO authenticated
WITH CHECK (
  actor_user_id = auth.uid()
  AND public.is_vivacity_team_safe(auth.uid())
);

-- ============================================================================
-- AUDIT_RESTRICTED_ACTIONS
-- ============================================================================
DROP POLICY IF EXISTS "audit_restricted_actions_select" ON public.audit_restricted_actions;
DROP POLICY IF EXISTS "audit_restricted_actions_insert" ON public.audit_restricted_actions;

CREATE POLICY "audit_restricted_actions_select" ON public.audit_restricted_actions
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

CREATE POLICY "audit_restricted_actions_insert" ON public.audit_restricted_actions
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- AUDIT_AVATARS
-- ============================================================================
DROP POLICY IF EXISTS "audit_avatars_select" ON public.audit_avatars;
DROP POLICY IF EXISTS "audit_avatars_insert" ON public.audit_avatars;
DROP POLICY IF EXISTS "audit_avatars_delete" ON public.audit_avatars;

CREATE POLICY "audit_avatars_select" ON public.audit_avatars
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR user_id = auth.uid()
);

CREATE POLICY "audit_avatars_manage" ON public.audit_avatars
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- AUDIT_UPGRADE_ATTEMPTS
-- ============================================================================
DROP POLICY IF EXISTS "audit_upgrade_attempts_select" ON public.audit_upgrade_attempts;
DROP POLICY IF EXISTS "audit_upgrade_attempts_insert" ON public.audit_upgrade_attempts;

CREATE POLICY "audit_upgrade_attempts_select" ON public.audit_upgrade_attempts
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

CREATE POLICY "audit_upgrade_attempts_insert" ON public.audit_upgrade_attempts
FOR INSERT TO authenticated
WITH CHECK (
  actor_user_id = auth.uid()
  AND public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- ============================================================================
-- AUDIT_GWC_TRENDS
-- ============================================================================
DROP POLICY IF EXISTS "audit_gwc_trends_select" ON public.audit_gwc_trends;
DROP POLICY IF EXISTS "audit_gwc_trends_insert" ON public.audit_gwc_trends;

CREATE POLICY "audit_gwc_trends_select" ON public.audit_gwc_trends
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "audit_gwc_trends_insert" ON public.audit_gwc_trends
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- ============================================================================
-- AUDIT_PEOPLE_ANALYZER
-- ============================================================================
DROP POLICY IF EXISTS "audit_people_analyzer_select" ON public.audit_people_analyzer;
DROP POLICY IF EXISTS "audit_people_analyzer_insert" ON public.audit_people_analyzer;

CREATE POLICY "audit_people_analyzer_select" ON public.audit_people_analyzer
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "audit_people_analyzer_insert" ON public.audit_people_analyzer
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- ============================================================================
-- AUDIT_SEAT_HEALTH
-- ============================================================================
DROP POLICY IF EXISTS "audit_seat_health_select" ON public.audit_seat_health;
DROP POLICY IF EXISTS "audit_seat_health_insert" ON public.audit_seat_health;

CREATE POLICY "audit_seat_health_select" ON public.audit_seat_health
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "audit_seat_health_insert" ON public.audit_seat_health
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- ============================================================================
-- AUDIT_SUCCESSION_EVENTS
-- ============================================================================
DROP POLICY IF EXISTS "audit_succession_events_select" ON public.audit_succession_events;
DROP POLICY IF EXISTS "audit_succession_events_insert" ON public.audit_succession_events;

CREATE POLICY "audit_succession_events_select" ON public.audit_succession_events
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "audit_succession_events_insert" ON public.audit_succession_events
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_tenant_access_safe(tenant_id, auth.uid())
);