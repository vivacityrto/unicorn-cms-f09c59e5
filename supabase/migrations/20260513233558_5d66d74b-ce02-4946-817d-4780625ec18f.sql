CREATE INDEX IF NOT EXISTS idx_pbal_tenant_created
  ON public.package_builder_audit_log (tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;