CREATE INDEX IF NOT EXISTS idx_audit_invites_tenant_created
  ON public.audit_invites (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_restricted_actions_tenant_created
  ON public.audit_restricted_actions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_audit_log_tenant_created
  ON public.client_audit_log (tenant_id, created_at DESC);