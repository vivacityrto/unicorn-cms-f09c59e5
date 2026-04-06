
-- =====================================================
-- FIX 1: Drop service-role policies that incorrectly use {public} role
-- These policies were meant for service_role but used public, allowing unauthenticated access
-- Service role bypasses RLS, so these policies are unnecessary
-- =====================================================

-- tenant_rto_scope_staging: full public access
DROP POLICY IF EXISTS "tenant_rto_scope_staging_service_all" ON public.tenant_rto_scope_staging;

-- strategic_signal_summary
DROP POLICY IF EXISTS "strategic_signal_summary_insert_system" ON public.strategic_signal_summary;

-- tenant_retention_forecasts
DROP POLICY IF EXISTS "service_role_insert_retention_forecasts" ON public.tenant_retention_forecasts;

-- retention_forecast_history
DROP POLICY IF EXISTS "service_role_insert_retention_history" ON public.retention_forecast_history;

-- workflow_performance_metrics
DROP POLICY IF EXISTS "service_role_upsert_wpm" ON public.workflow_performance_metrics;
DROP POLICY IF EXISTS "service_role_update_wpm" ON public.workflow_performance_metrics;

-- workflow_optimisation_signals
DROP POLICY IF EXISTS "service_role_insert_wos" ON public.workflow_optimisation_signals;

-- playbook_steps
DROP POLICY IF EXISTS "pb_steps_service_insert" ON public.playbook_steps;

-- playbook_triggers
DROP POLICY IF EXISTS "pb_triggers_service_insert" ON public.playbook_triggers;

-- playbook_activations
DROP POLICY IF EXISTS "pb_activations_service_insert" ON public.playbook_activations;

-- client_ai_sessions
DROP POLICY IF EXISTS "service_insert_client_ai_sessions" ON public.client_ai_sessions;
DROP POLICY IF EXISTS "service_update_client_ai_sessions" ON public.client_ai_sessions;

-- client_ai_messages
DROP POLICY IF EXISTS "service_insert_client_ai_messages" ON public.client_ai_messages;

-- compliance_playbooks
DROP POLICY IF EXISTS "playbooks_service_insert" ON public.compliance_playbooks;

-- real_time_risk_alerts
DROP POLICY IF EXISTS "rt_risk_alerts_service_insert" ON public.real_time_risk_alerts;

-- predictive_operational_risk_snapshots (WITH CHECK always true)
DROP POLICY IF EXISTS "predictive_operational_risk_snapshots_system_insert" ON public.predictive_operational_risk_snapshots;

-- =====================================================
-- FIX 2: Restrict tga_rtos, tga_import_state, client_tga_snapshot SELECT to authenticated
-- These contain RTO contact details (email, phone, ABN)
-- =====================================================

-- tga_rtos: drop public SELECT, add authenticated SELECT
DROP POLICY IF EXISTS "tga_rtos_select" ON public.tga_rtos;
CREATE POLICY "tga_rtos_select_authenticated" ON public.tga_rtos
  FOR SELECT TO authenticated USING (true);

-- tga_import_state: drop public SELECT, add authenticated SELECT
DROP POLICY IF EXISTS "tga_import_state_select" ON public.tga_import_state;
CREATE POLICY "tga_import_state_select_authenticated" ON public.tga_import_state
  FOR SELECT TO authenticated USING (true);

-- client_tga_snapshot: drop public SELECT, add authenticated SELECT
DROP POLICY IF EXISTS "client_tga_snapshot_select" ON public.client_tga_snapshot;
CREATE POLICY "client_tga_snapshot_select_authenticated" ON public.client_tga_snapshot
  FOR SELECT TO authenticated USING (true);

-- =====================================================
-- FIX 3: Fix is_vivacity() function — type mismatch (id bigint vs auth.uid() uuid)
-- Must use user_uuid column and unicorn_role enum
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_vivacity()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = auth.uid()
    AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  );
END;
$$;

-- =====================================================
-- FIX 4: Fix document-files storage policies
-- Replace open authenticated policies with tenant-scoped path checks
-- Path convention: {tenant_id}/... 
-- =====================================================

-- Drop overly permissive public role policies
DROP POLICY IF EXISTS "Users can view document files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload document files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update document files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete document files" ON storage.objects;

-- Drop overly permissive authenticated role policies  
DROP POLICY IF EXISTS "Authenticated users can read document-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload document-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update document-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete document-files" ON storage.objects;

-- Create tenant-scoped policies using path-based checks
CREATE POLICY "document_files_select_tenant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'document-files'
    AND (
      is_vivacity_internal_safe(auth.uid())
      OR has_tenant_access_safe(
        (string_to_array(name, '/'))[1]::bigint,
        auth.uid()
      )
    )
  );

CREATE POLICY "document_files_insert_tenant" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'document-files'
    AND (
      is_vivacity_internal_safe(auth.uid())
      OR has_tenant_access_safe(
        (string_to_array(name, '/'))[1]::bigint,
        auth.uid()
      )
    )
  );

CREATE POLICY "document_files_update_tenant" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'document-files'
    AND (
      is_vivacity_internal_safe(auth.uid())
      OR has_tenant_access_safe(
        (string_to_array(name, '/'))[1]::bigint,
        auth.uid()
      )
    )
  );

CREATE POLICY "document_files_delete_tenant" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'document-files'
    AND (
      is_vivacity_internal_safe(auth.uid())
      OR has_tenant_access_safe(
        (string_to_array(name, '/'))[1]::bigint,
        auth.uid()
      )
    )
  );
