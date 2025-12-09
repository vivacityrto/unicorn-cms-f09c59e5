-- Create reusable_audit_templates table for storing reusable response sets
CREATE TABLE public.reusable_audit_templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_global BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for better performance
CREATE INDEX idx_reusable_audit_templates_tenant_id ON public.reusable_audit_templates(tenant_id);
CREATE INDEX idx_reusable_audit_templates_is_global ON public.reusable_audit_templates(is_global);

-- Enable RLS
ALTER TABLE public.reusable_audit_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view global templates or their tenant's templates
CREATE POLICY "reusable_audit_templates_select" ON public.reusable_audit_templates
  FOR SELECT USING (
    is_super_admin() OR 
    is_global = true OR 
    user_in_tenant(tenant_id)
  );

-- Users can insert templates for their tenant
CREATE POLICY "reusable_audit_templates_insert" ON public.reusable_audit_templates
  FOR INSERT WITH CHECK (
    user_in_tenant(tenant_id) AND (created_by = auth.uid() OR created_by IS NULL)
  );

-- Users can update their own templates or super admins can update any
CREATE POLICY "reusable_audit_templates_update" ON public.reusable_audit_templates
  FOR UPDATE USING (
    is_super_admin() OR (user_in_tenant(tenant_id) AND created_by = auth.uid())
  );

-- Users can delete their own templates or super admins can delete any
CREATE POLICY "reusable_audit_templates_delete" ON public.reusable_audit_templates
  FOR DELETE USING (
    is_super_admin() OR (user_in_tenant(tenant_id) AND created_by = auth.uid())
  );

-- Seed initial default global templates
INSERT INTO public.reusable_audit_templates (tenant_id, name, options, is_global, created_by)
SELECT 
  (SELECT id FROM public.tenants LIMIT 1),
  name,
  options::jsonb,
  true,
  NULL
FROM (VALUES
  ('Risk Assessment', '[{"label": "Safe", "color": "bg-green-500"}, {"label": "At Risk", "color": "bg-red-500"}, {"label": "N/A", "color": "bg-muted"}]'),
  ('Pass/Fail', '[{"label": "Pass", "color": "bg-green-500"}, {"label": "Fail", "color": "bg-red-500"}, {"label": "N/A", "color": "bg-muted"}]'),
  ('Yes/No', '[{"label": "Yes", "color": "bg-green-500"}, {"label": "No", "color": "bg-red-500"}, {"label": "N/A", "color": "bg-muted"}]'),
  ('Compliance', '[{"label": "Compliant", "color": "bg-green-500"}, {"label": "Non-Compliant", "color": "bg-red-500"}]')
) AS t(name, options);