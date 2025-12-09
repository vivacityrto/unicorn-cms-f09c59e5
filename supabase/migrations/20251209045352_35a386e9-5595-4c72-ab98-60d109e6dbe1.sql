-- Create tenant_stages table to store tenant-specific stage data
CREATE TABLE public.tenant_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stage_id BIGINT NOT NULL REFERENCES public.documents_stages(id) ON DELETE CASCADE,
  package_id BIGINT REFERENCES public.packages(id) ON DELETE SET NULL,
  staff_tasks JSONB DEFAULT '[]'::jsonb,
  client_tasks JSONB DEFAULT '[]'::jsonb,
  documents JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, stage_id, package_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_tenant_stages_tenant_id ON public.tenant_stages(tenant_id);
CREATE INDEX idx_tenant_stages_stage_id ON public.tenant_stages(stage_id);
CREATE INDEX idx_tenant_stages_package_id ON public.tenant_stages(package_id);

-- Enable Row Level Security
ALTER TABLE public.tenant_stages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant isolation
CREATE POLICY "tenant_stages_select" ON public.tenant_stages
  FOR SELECT USING (
    is_super_admin() OR 
    tenant_id = get_current_user_tenant()
  );

CREATE POLICY "tenant_stages_insert" ON public.tenant_stages
  FOR INSERT WITH CHECK (
    is_super_admin() OR 
    tenant_id = get_current_user_tenant()
  );

CREATE POLICY "tenant_stages_update" ON public.tenant_stages
  FOR UPDATE USING (
    is_super_admin() OR 
    tenant_id = get_current_user_tenant()
  );

CREATE POLICY "tenant_stages_delete" ON public.tenant_stages
  FOR DELETE USING (
    is_super_admin() OR 
    tenant_id = get_current_user_tenant()
  );

-- Create trigger for automatic updated_at timestamp
CREATE TRIGGER update_tenant_stages_updated_at
  BEFORE UPDATE ON public.tenant_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();