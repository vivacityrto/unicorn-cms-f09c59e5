-- Create Tasks_Tenants table
CREATE TABLE IF NOT EXISTS public.tasks_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients_legacy(id) ON DELETE CASCADE,
  package_id bigint REFERENCES public.packages(id) ON DELETE SET NULL,
  task_name text NOT NULL,
  description text,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  completed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
);

-- Create index for faster queries
CREATE INDEX idx_tasks_tenants_client_id ON public.tasks_tenants(client_id);
CREATE INDEX idx_tasks_tenants_tenant_id ON public.tasks_tenants(tenant_id);
CREATE INDEX idx_tasks_tenants_created_by ON public.tasks_tenants(created_by);
CREATE INDEX idx_tasks_tenants_due_date ON public.tasks_tenants(due_date);

-- Enable RLS
ALTER TABLE public.tasks_tenants ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view tasks in their tenant"
  ON public.tasks_tenants
  FOR SELECT
  USING (
    tenant_id = get_current_user_tenant() OR is_super_admin()
  );

CREATE POLICY "Users can create tasks in their tenant"
  ON public.tasks_tenants
  FOR INSERT
  WITH CHECK (
    tenant_id = get_current_user_tenant() AND created_by = auth.uid()
  );

CREATE POLICY "Users can update tasks in their tenant"
  ON public.tasks_tenants
  FOR UPDATE
  USING (
    tenant_id = get_current_user_tenant() OR is_super_admin()
  );

CREATE POLICY "Super admins can delete tasks"
  ON public.tasks_tenants
  FOR DELETE
  USING (is_super_admin());