
-- ============================================================
-- Phase 1: Native Task Model (No ClickUp dependency)
-- ============================================================

-- 1. task_definitions — master task template
CREATE TABLE IF NOT EXISTS public.task_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NULL,
  compliance_clause text NULL,
  risk_weight integer NOT NULL DEFAULT 1,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_definitions_clause
  ON public.task_definitions (compliance_clause);

ALTER TABLE public.task_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_definitions_staff_select
  ON public.task_definitions FOR SELECT TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

CREATE POLICY task_definitions_staff_insert
  ON public.task_definitions FOR INSERT TO authenticated
  WITH CHECK (public.is_vivacity_staff(auth.uid()));

CREATE POLICY task_definitions_staff_update
  ON public.task_definitions FOR UPDATE TO authenticated
  USING (public.is_vivacity_staff(auth.uid()))
  WITH CHECK (public.is_vivacity_staff(auth.uid()));

CREATE POLICY task_definitions_staff_delete
  ON public.task_definitions FOR DELETE TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

-- 2. task_requirements — scoped assignment rules
CREATE TABLE IF NOT EXISTS public.task_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_definition_id uuid NOT NULL
    REFERENCES public.task_definitions(id) ON DELETE CASCADE,
  scope_type text NOT NULL
    CHECK (scope_type IN ('package','tenant')),
  package_id bigint NULL
    REFERENCES public.packages(id) ON DELETE CASCADE,
  tenant_id bigint NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  due_days_after_start integer NULL,
  is_required boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_requirements_scope_chk CHECK (
    (scope_type = 'package' AND package_id IS NOT NULL AND tenant_id IS NULL)
    OR
    (scope_type = 'tenant' AND tenant_id IS NOT NULL AND package_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_task_requirements_package
  ON public.task_requirements (package_id) WHERE scope_type = 'package';

CREATE INDEX IF NOT EXISTS idx_task_requirements_tenant
  ON public.task_requirements (tenant_id) WHERE scope_type = 'tenant';

ALTER TABLE public.task_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_requirements_staff_select
  ON public.task_requirements FOR SELECT TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

CREATE POLICY task_requirements_staff_insert
  ON public.task_requirements FOR INSERT TO authenticated
  WITH CHECK (public.is_vivacity_staff(auth.uid()));

CREATE POLICY task_requirements_staff_update
  ON public.task_requirements FOR UPDATE TO authenticated
  USING (public.is_vivacity_staff(auth.uid()))
  WITH CHECK (public.is_vivacity_staff(auth.uid()));

CREATE POLICY task_requirements_staff_delete
  ON public.task_requirements FOR DELETE TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

-- 3. tenant_task_instances — per-tenant task state
CREATE TABLE IF NOT EXISTS public.tenant_task_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  task_requirement_id uuid NOT NULL
    REFERENCES public.task_requirements(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','done','blocked','n_a')),
  due_at timestamptz NULL,
  completed_at timestamptz NULL,
  completed_by uuid NULL
    REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, task_requirement_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_task_instances_tenant
  ON public.tenant_task_instances (tenant_id, status);

ALTER TABLE public.tenant_task_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_task_instances_staff_select
  ON public.tenant_task_instances FOR SELECT TO authenticated
  USING (public.is_vivacity_staff(auth.uid()) AND public.can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY tenant_task_instances_staff_insert
  ON public.tenant_task_instances FOR INSERT TO authenticated
  WITH CHECK (public.is_vivacity_staff(auth.uid()) AND public.can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY tenant_task_instances_staff_update
  ON public.tenant_task_instances FOR UPDATE TO authenticated
  USING (public.is_vivacity_staff(auth.uid()) AND public.can_access_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_vivacity_staff(auth.uid()) AND public.can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY tenant_task_instances_staff_delete
  ON public.tenant_task_instances FOR DELETE TO authenticated
  USING (public.is_vivacity_staff(auth.uid()) AND public.can_access_tenant(auth.uid(), tenant_id));

-- updated_at trigger for task_definitions
CREATE TRIGGER update_task_definitions_updated_at
  BEFORE UPDATE ON public.task_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
