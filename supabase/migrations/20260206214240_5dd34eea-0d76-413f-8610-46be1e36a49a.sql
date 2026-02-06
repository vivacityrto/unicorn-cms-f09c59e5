-- ============================================================================
-- Phase 4C: RLS Policy Standardization - Assistant, Auth & Global Tables
-- ============================================================================

-- ============================================================================
-- ASSISTANT_THREADS (NO tenant_id - user-owned via viewer_user_id)
-- ============================================================================
DROP POLICY IF EXISTS "assistant_threads_select" ON public.assistant_threads;
DROP POLICY IF EXISTS "assistant_threads_insert" ON public.assistant_threads;
DROP POLICY IF EXISTS "assistant_threads_update" ON public.assistant_threads;
DROP POLICY IF EXISTS "assistant_threads_delete" ON public.assistant_threads;
DROP POLICY IF EXISTS "assistant_threads_manage" ON public.assistant_threads;

CREATE POLICY "assistant_threads_select" ON public.assistant_threads
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR viewer_user_id = auth.uid()
);

CREATE POLICY "assistant_threads_manage" ON public.assistant_threads
FOR ALL TO authenticated
USING (viewer_user_id = auth.uid())
WITH CHECK (viewer_user_id = auth.uid());

-- ============================================================================
-- ASSISTANT_MESSAGES (NO tenant_id - linked via thread)
-- ============================================================================
DROP POLICY IF EXISTS "assistant_messages_select" ON public.assistant_messages;
DROP POLICY IF EXISTS "assistant_messages_insert" ON public.assistant_messages;
DROP POLICY IF EXISTS "assistant_messages_manage" ON public.assistant_messages;

CREATE POLICY "assistant_messages_select" ON public.assistant_messages
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.assistant_threads t
    WHERE t.id = assistant_messages.thread_id
    AND t.viewer_user_id = auth.uid()
  )
);

CREATE POLICY "assistant_messages_insert" ON public.assistant_messages
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.assistant_threads t
    WHERE t.id = assistant_messages.thread_id
    AND t.viewer_user_id = auth.uid()
  )
);

-- ============================================================================
-- ASSISTANT_AUDIT_LOG (NO tenant_id - user-owned via viewer_user_id)
-- ============================================================================
DROP POLICY IF EXISTS "assistant_audit_log_select" ON public.assistant_audit_log;
DROP POLICY IF EXISTS "assistant_audit_log_insert" ON public.assistant_audit_log;
DROP POLICY IF EXISTS "assistant_audit_log_manage" ON public.assistant_audit_log;

CREATE POLICY "assistant_audit_log_select" ON public.assistant_audit_log
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR viewer_user_id = auth.uid()
);

CREATE POLICY "assistant_audit_log_insert" ON public.assistant_audit_log
FOR INSERT TO authenticated
WITH CHECK (viewer_user_id = auth.uid());

-- ============================================================================
-- APP_SETTINGS (NO tenant_id - global settings)
-- ============================================================================
DROP POLICY IF EXISTS "app_settings_select" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_update" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_manage" ON public.app_settings;
DROP POLICY IF EXISTS "SuperAdmins can view app settings" ON public.app_settings;
DROP POLICY IF EXISTS "SuperAdmins can update app settings" ON public.app_settings;

CREATE POLICY "app_settings_select" ON public.app_settings
FOR SELECT TO authenticated
USING (public.is_super_admin_safe(auth.uid()) OR public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "app_settings_manage" ON public.app_settings
FOR ALL TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- ============================================================================
-- AUTH_TOKENS (NO tenant_id - user-owned)
-- ============================================================================
DROP POLICY IF EXISTS "auth_tokens_select" ON public.auth_tokens;
DROP POLICY IF EXISTS "auth_tokens_insert" ON public.auth_tokens;
DROP POLICY IF EXISTS "auth_tokens_update" ON public.auth_tokens;
DROP POLICY IF EXISTS "auth_tokens_delete" ON public.auth_tokens;
DROP POLICY IF EXISTS "auth_tokens_manage" ON public.auth_tokens;

CREATE POLICY "auth_tokens_select" ON public.auth_tokens
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR user_id = auth.uid()
);

CREATE POLICY "auth_tokens_manage" ON public.auth_tokens
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- CLICKUP_TASKS (NO tenant_id - global import table, staff only)
-- ============================================================================
DROP POLICY IF EXISTS "clickup_tasks_select" ON public.clickup_tasks;
DROP POLICY IF EXISTS "clickup_tasks_insert" ON public.clickup_tasks;
DROP POLICY IF EXISTS "clickup_tasks_update" ON public.clickup_tasks;
DROP POLICY IF EXISTS "clickup_tasks_manage" ON public.clickup_tasks;

CREATE POLICY "clickup_tasks_select" ON public.clickup_tasks
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

CREATE POLICY "clickup_tasks_manage" ON public.clickup_tasks
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
-- EMAIL_TEMPLATES (NO tenant_id - global)
-- ============================================================================
DROP POLICY IF EXISTS "email_templates_select" ON public.email_templates;
DROP POLICY IF EXISTS "email_templates_manage" ON public.email_templates;

CREATE POLICY "email_templates_select" ON public.email_templates
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

CREATE POLICY "email_templates_manage" ON public.email_templates
FOR ALL TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- ============================================================================
-- OAUTH_STATES (NO tenant_id, NO user_id - system table with state key)
-- This is a system table used for OAuth flows, needs special handling
-- ============================================================================
DROP POLICY IF EXISTS "oauth_states_insert" ON public.oauth_states;
DROP POLICY IF EXISTS "oauth_states_select" ON public.oauth_states;
DROP POLICY IF EXISTS "oauth_states_delete" ON public.oauth_states;

-- OAuth states are ephemeral and accessed by state key, not user
-- Allow authenticated users to manage their own OAuth flows
CREATE POLICY "oauth_states_select" ON public.oauth_states
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "oauth_states_insert" ON public.oauth_states
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "oauth_states_delete" ON public.oauth_states
FOR DELETE TO authenticated
USING (true);