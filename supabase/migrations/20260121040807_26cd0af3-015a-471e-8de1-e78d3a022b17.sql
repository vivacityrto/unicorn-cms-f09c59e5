-- Create processes table for SOP management
CREATE TABLE public.processes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  short_description TEXT,
  category TEXT NOT NULL CHECK (category IN ('operations', 'compliance', 'eos', 'hr', 'client_delivery')),
  tags TEXT[] DEFAULT '{}',
  owner_user_id UUID REFERENCES auth.users(id),
  applies_to TEXT NOT NULL DEFAULT 'vivacity_internal' CHECK (applies_to IN ('vivacity_internal', 'client_type', 'package')),
  applies_to_package_id INTEGER REFERENCES public.packages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'under_review', 'approved', 'archived')),
  content JSONB DEFAULT '{}',
  purpose TEXT,
  scope TEXT,
  instructions TEXT,
  evidence_records TEXT,
  related_standards TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  review_date DATE,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  reviewer_user_id UUID REFERENCES auth.users(id),
  edit_reason TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Create process versions table for version history
CREATE TABLE public.process_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  short_description TEXT,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  owner_user_id UUID REFERENCES auth.users(id),
  applies_to TEXT NOT NULL,
  applies_to_package_id INTEGER REFERENCES public.packages(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  content JSONB DEFAULT '{}',
  purpose TEXT,
  scope TEXT,
  instructions TEXT,
  evidence_records TEXT,
  related_standards TEXT,
  review_date DATE,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  reviewer_user_id UUID REFERENCES auth.users(id),
  edit_reason TEXT,
  snapshot_data JSONB,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(process_id, version)
);

-- Create process audit log table for immutable audit trail
CREATE TABLE public.process_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'approved', 'submitted_for_review', 'archived', 'version_created', 'edit_requested')),
  actor_user_id UUID REFERENCES auth.users(id),
  details JSONB DEFAULT '{}',
  before_data JSONB,
  after_data JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for processes table
-- SuperAdmin and Team Leader can view all processes
CREATE POLICY "SuperAdmin and Team Leader can view all processes"
ON public.processes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  )
);

-- Admin can view tenant-specific processes
CREATE POLICY "Admin can view tenant processes"
ON public.processes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role = 'Admin'
    AND (tenant_id IS NULL OR u.tenant_id = tenant_id)
  )
);

-- User can view approved processes for their tenant
CREATE POLICY "User can view approved processes"
ON public.processes FOR SELECT
USING (
  status = 'approved' AND
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role = 'User'
    AND (tenant_id IS NULL OR u.tenant_id = tenant_id)
  )
);

-- SuperAdmin and Admin can create processes
CREATE POLICY "SuperAdmin and Admin can create processes"
ON public.processes FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Admin')
  )
);

-- SuperAdmin and Admin can update processes (with approval lock check in app)
CREATE POLICY "SuperAdmin and Admin can update processes"
ON public.processes FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Admin')
  )
);

-- Only SuperAdmin can delete processes
CREATE POLICY "Only SuperAdmin can delete processes"
ON public.processes FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role = 'Super Admin'
  )
);

-- RLS Policies for process_versions table
CREATE POLICY "Users can view process versions"
ON public.process_versions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.processes p 
    WHERE p.id = process_id
  )
);

CREATE POLICY "System can insert process versions"
ON public.process_versions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Admin')
  )
);

-- RLS Policies for process_audit_log table
CREATE POLICY "Users can view process audit logs"
ON public.process_audit_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Admin')
  )
);

CREATE POLICY "System can insert process audit logs"
ON public.process_audit_log FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid()
  )
);

-- Create indexes for performance
CREATE INDEX idx_processes_tenant_id ON public.processes(tenant_id);
CREATE INDEX idx_processes_status ON public.processes(status);
CREATE INDEX idx_processes_category ON public.processes(category);
CREATE INDEX idx_processes_owner_user_id ON public.processes(owner_user_id);
CREATE INDEX idx_processes_created_at ON public.processes(created_at DESC);
CREATE INDEX idx_process_versions_process_id ON public.process_versions(process_id);
CREATE INDEX idx_process_audit_log_process_id ON public.process_audit_log(process_id);
CREATE INDEX idx_process_audit_log_created_at ON public.process_audit_log(created_at DESC);

-- Create function to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_processes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_processes_updated_at
BEFORE UPDATE ON public.processes
FOR EACH ROW
EXECUTE FUNCTION public.update_processes_updated_at();