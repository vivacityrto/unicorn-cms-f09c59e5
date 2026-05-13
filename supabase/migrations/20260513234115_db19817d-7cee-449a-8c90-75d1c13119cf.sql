CREATE INDEX IF NOT EXISTS idx_assistant_audit_log_tenant_created
  ON public.assistant_audit_log (client_tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_client_impersonation_tenant_started
  ON public.audit_client_impersonation (tenant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_eos_events_tenant_created
  ON public.audit_eos_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consultant_assignment_audit_log_tenant_created
  ON public.consultant_assignment_audit_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eos_minutes_audit_log_tenant_created
  ON public.eos_minutes_audit_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eos_template_audit_log_tenant_created
  ON public.eos_template_audit_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meeting_sync_audit_tenant_created
  ON public.meeting_sync_audit (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_document_audit_tenant_occurred
  ON public.portal_document_audit (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_sharepoint_access_log_tenant_created
  ON public.sharepoint_access_log (tenant_id, created_at DESC);