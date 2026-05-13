BEGIN;

-- Add tenant_id (nullable: some events are platform-level with no tenant
-- context, e.g. global role changes by a super admin)
ALTER TABLE public.audit_user_events
  ADD COLUMN IF NOT EXISTS tenant_id bigint
    REFERENCES public.tenants(id) ON DELETE SET NULL;

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS audit_user_events_tenant_idx
  ON public.audit_user_events (tenant_id, created_at DESC);

-- Tenant admins can see audit events for their own tenant
DROP POLICY IF EXISTS "audit_user_events_select_tenant_admin"
  ON public.audit_user_events;
CREATE POLICY "audit_user_events_select_tenant_admin"
  ON public.audit_user_events FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = (SELECT auth.uid())
        AND tu.tenant_id = audit_user_events.tenant_id
        AND tu.access_scope = 'full'
        AND tu.relationship_role IN ('primary_contact', 'secondary_contact')
    )
  );

COMMIT;