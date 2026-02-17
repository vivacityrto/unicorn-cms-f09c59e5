
-- =============================================
-- Phase 1: Client Lifecycle Management
-- =============================================

-- 1. Add lifecycle columns to tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'enabled',
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_reason text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.tenants
  ADD CONSTRAINT chk_lifecycle_status CHECK (lifecycle_status IN ('active','suspended','closed','archived')),
  ADD CONSTRAINT chk_access_status CHECK (access_status IN ('enabled','disabled'));

-- 2. Backfill existing tenants
UPDATE public.tenants SET lifecycle_status = 'active',    access_status = 'enabled'  WHERE status = 'active';
UPDATE public.tenants SET lifecycle_status = 'suspended', access_status = 'disabled' WHERE status = 'inactive';
UPDATE public.tenants SET lifecycle_status = 'archived',  access_status = 'disabled', archived_at = now() WHERE status = 'archived';

CREATE INDEX IF NOT EXISTS idx_tenants_lifecycle_status ON public.tenants(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_tenants_access_status ON public.tenants(access_status);

-- =============================================
-- 3. Helper: Check tenant is writeable
-- =============================================
CREATE OR REPLACE FUNCTION public.tenant_is_writeable(p_tenant_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id
    AND lifecycle_status NOT IN ('closed', 'archived')
  );
$$;

-- Helper: resolve tenant_id from stage_instance
CREATE OR REPLACE FUNCTION public.stage_instance_tenant_id(p_si_id bigint)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT pi.tenant_id
  FROM public.stage_instances si
  JOIN public.package_instances pi ON pi.id = si.packageinstance_id
  WHERE si.id = p_si_id
  LIMIT 1;
$$;

-- =============================================
-- 4. Audit trigger for lifecycle changes
-- =============================================
CREATE OR REPLACE FUNCTION public.trg_tenant_lifecycle_audit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status THEN
    INSERT INTO public.client_audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, details, before_data, after_data)
    VALUES (
      NEW.id, auth.uid(), 'lifecycle_status_changed', 'tenant', NEW.id::text,
      jsonb_build_object('reason', COALESCE(NEW.closed_reason, 'No reason provided')),
      jsonb_build_object('lifecycle_status', OLD.lifecycle_status, 'access_status', OLD.access_status),
      jsonb_build_object('lifecycle_status', NEW.lifecycle_status, 'access_status', NEW.access_status)
    );
  END IF;

  IF OLD.access_status IS DISTINCT FROM NEW.access_status AND OLD.lifecycle_status IS NOT DISTINCT FROM NEW.lifecycle_status THEN
    INSERT INTO public.client_audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, details, before_data, after_data)
    VALUES (
      NEW.id, auth.uid(), 'access_status_changed', 'tenant', NEW.id::text,
      jsonb_build_object('reason', COALESCE(NEW.closed_reason, 'No reason provided')),
      jsonb_build_object('access_status', OLD.access_status),
      jsonb_build_object('access_status', NEW.access_status)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_lifecycle_audit ON public.tenants;
CREATE TRIGGER trg_tenant_lifecycle_audit
  AFTER UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_tenant_lifecycle_audit();

-- =============================================
-- 5. RLS: Block writes on closed/archived tenants
-- =============================================

-- consult_logs (has tenant_id directly)
DROP POLICY IF EXISTS consult_logs_staff_insert ON public.consult_logs;
CREATE POLICY consult_logs_staff_insert ON public.consult_logs
  FOR INSERT WITH CHECK (
    is_vivacity_staff(auth.uid())
    AND can_access_tenant(auth.uid(), tenant_id)
    AND (tenant_is_writeable(tenant_id) OR is_super_admin_safe(auth.uid()))
  );

DROP POLICY IF EXISTS consult_logs_staff_update ON public.consult_logs;
CREATE POLICY consult_logs_staff_update ON public.consult_logs
  FOR UPDATE
  USING (is_vivacity_staff(auth.uid()) AND can_access_tenant(auth.uid(), tenant_id))
  WITH CHECK (
    is_vivacity_staff(auth.uid())
    AND can_access_tenant(auth.uid(), tenant_id)
    AND (tenant_is_writeable(tenant_id) OR is_super_admin_safe(auth.uid()))
  );

-- document_instances (has tenant_id directly)
DROP POLICY IF EXISTS document_instances_write_admin_or_sa ON public.document_instances;
CREATE POLICY document_instances_write_admin_or_sa ON public.document_instances
  FOR INSERT WITH CHECK (
    (is_super_admin() OR is_tenant_admin(tenant_id))
    AND (tenant_is_writeable(tenant_id) OR is_super_admin_safe(auth.uid()))
  );

DROP POLICY IF EXISTS document_instances_update_admin_or_sa ON public.document_instances;
CREATE POLICY document_instances_update_admin_or_sa ON public.document_instances
  FOR UPDATE
  USING (is_super_admin() OR is_tenant_admin(tenant_id))
  WITH CHECK (
    (is_super_admin() OR is_tenant_admin(tenant_id))
    AND (tenant_is_writeable(tenant_id) OR is_super_admin_safe(auth.uid()))
  );

-- stage_instances (no tenant_id — resolve via package_instances)
ALTER TABLE public.stage_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_instances_lifecycle_insert ON public.stage_instances;
CREATE POLICY stage_instances_lifecycle_insert ON public.stage_instances
  FOR INSERT WITH CHECK (
    tenant_is_writeable(stage_instance_tenant_id(id))
    OR is_super_admin_safe(auth.uid())
  );

DROP POLICY IF EXISTS stage_instances_lifecycle_update ON public.stage_instances;
CREATE POLICY stage_instances_lifecycle_update ON public.stage_instances
  FOR UPDATE USING (true)
  WITH CHECK (
    tenant_is_writeable(stage_instance_tenant_id(id))
    OR is_super_admin_safe(auth.uid())
  );

-- client_task_instances (no tenant_id — resolve via stageinstance_id)
ALTER TABLE public.client_task_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cti_lifecycle_insert ON public.client_task_instances;
CREATE POLICY cti_lifecycle_insert ON public.client_task_instances
  FOR INSERT WITH CHECK (
    tenant_is_writeable(stage_instance_tenant_id(stageinstance_id))
    OR is_super_admin_safe(auth.uid())
  );

DROP POLICY IF EXISTS cti_lifecycle_update ON public.client_task_instances;
CREATE POLICY cti_lifecycle_update ON public.client_task_instances
  FOR UPDATE USING (true)
  WITH CHECK (
    tenant_is_writeable(stage_instance_tenant_id(stageinstance_id))
    OR is_super_admin_safe(auth.uid())
  );
