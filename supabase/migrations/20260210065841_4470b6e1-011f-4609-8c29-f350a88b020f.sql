
-- ============================================================================
-- tenant_sharepoint_settings: per-tenant SharePoint root folder configuration
-- ============================================================================

CREATE TABLE public.tenant_sharepoint_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  root_folder_url TEXT NOT NULL,
  drive_id TEXT,
  root_item_id TEXT,
  root_name TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  last_validated_at TIMESTAMPTZ,
  validation_status TEXT NOT NULL DEFAULT 'unvalidated'
    CHECK (validation_status IN ('unvalidated', 'valid', 'invalid')),
  validation_error TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One SharePoint root per tenant
CREATE UNIQUE INDEX uq_tenant_sharepoint_settings_tenant
  ON public.tenant_sharepoint_settings (tenant_id);

CREATE INDEX idx_tenant_sharepoint_settings_tenant
  ON public.tenant_sharepoint_settings (tenant_id);

-- Auto-update updated_at
CREATE TRIGGER update_tenant_sharepoint_settings_updated_at
  BEFORE UPDATE ON public.tenant_sharepoint_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.tenant_sharepoint_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_sharepoint_settings FORCE ROW LEVEL SECURITY;

-- SELECT: tenant members can read their own tenant's row; Vivacity staff can read all
CREATE POLICY "tenant_sharepoint_select"
  ON public.tenant_sharepoint_settings
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_safe(auth.uid())
    OR public.has_tenant_access_safe(tenant_id, auth.uid())
  );

-- INSERT: Vivacity staff only (Super Admin or Team Leader)
CREATE POLICY "tenant_sharepoint_insert"
  ON public.tenant_sharepoint_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_vivacity_team_safe(auth.uid())
  );

-- UPDATE: Vivacity staff only
CREATE POLICY "tenant_sharepoint_update"
  ON public.tenant_sharepoint_settings
  FOR UPDATE TO authenticated
  USING (
    public.is_vivacity_team_safe(auth.uid())
  )
  WITH CHECK (
    public.is_vivacity_team_safe(auth.uid())
  );

-- DELETE: Super Admin only
CREATE POLICY "tenant_sharepoint_delete"
  ON public.tenant_sharepoint_settings
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin_safe(auth.uid())
  );

-- ============================================================================
-- Audit trigger: log all changes to audit_events
-- ============================================================================
CREATE OR REPLACE FUNCTION public.audit_tenant_sharepoint_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
    VALUES (
      'create',
      'tenant_sharepoint_settings',
      NEW.id::text,
      auth.uid(),
      jsonb_build_object(
        'tenant_id', NEW.tenant_id,
        'root_folder_url', NEW.root_folder_url,
        'reason', 'SharePoint root folder configured'
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
    VALUES (
      'update',
      'tenant_sharepoint_settings',
      NEW.id::text,
      auth.uid(),
      jsonb_build_object(
        'tenant_id', NEW.tenant_id,
        'before', jsonb_build_object(
          'root_folder_url', OLD.root_folder_url,
          'is_enabled', OLD.is_enabled,
          'validation_status', OLD.validation_status
        ),
        'after', jsonb_build_object(
          'root_folder_url', NEW.root_folder_url,
          'is_enabled', NEW.is_enabled,
          'validation_status', NEW.validation_status
        ),
        'reason', 'SharePoint root folder updated'
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
    VALUES (
      'delete',
      'tenant_sharepoint_settings',
      OLD.id::text,
      auth.uid(),
      jsonb_build_object(
        'tenant_id', OLD.tenant_id,
        'root_folder_url', OLD.root_folder_url,
        'reason', 'SharePoint root folder removed'
      )
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_tenant_sharepoint_settings
  AFTER INSERT OR UPDATE OR DELETE
  ON public.tenant_sharepoint_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_tenant_sharepoint_settings();

-- ============================================================================
-- SharePoint audit log for browse/download actions
-- ============================================================================
CREATE TABLE public.sharepoint_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('browse', 'download')),
  drive_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sharepoint_access_log_tenant ON public.sharepoint_access_log (tenant_id);
CREATE INDEX idx_sharepoint_access_log_user ON public.sharepoint_access_log (user_id);

ALTER TABLE public.sharepoint_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sharepoint_access_log FORCE ROW LEVEL SECURITY;

-- INSERT: any authenticated user (edge function with service role will insert)
CREATE POLICY "sharepoint_access_log_insert"
  ON public.sharepoint_access_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- SELECT: Vivacity staff or own records
CREATE POLICY "sharepoint_access_log_select"
  ON public.sharepoint_access_log
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_safe(auth.uid())
    OR user_id = auth.uid()
  );
