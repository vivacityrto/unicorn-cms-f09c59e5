-- Create rto_tips table
CREATE TABLE IF NOT EXISTS public.rto_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL,
  tenant_id BIGINT REFERENCES public.tenants(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rto_tips ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "rto_tips_select" ON public.rto_tips
  FOR SELECT
  USING (
    is_super_admin() OR 
    (tenant_id = get_current_user_tenant()) OR
    (tenant_id IS NULL)
  );

CREATE POLICY "rto_tips_insert" ON public.rto_tips
  FOR INSERT
  WITH CHECK (
    is_super_admin() OR
    (tenant_id = get_current_user_tenant())
  );

CREATE POLICY "rto_tips_update" ON public.rto_tips
  FOR UPDATE
  USING (
    is_super_admin() OR
    (tenant_id = get_current_user_tenant())
  );

CREATE POLICY "rto_tips_delete" ON public.rto_tips
  FOR DELETE
  USING (is_super_admin());

-- Insert demo data (tenant_id NULL means visible to all)
INSERT INTO public.rto_tips (title, details, category, status, created_by, created_at, tenant_id) VALUES
  ('Understanding ASQA Compliance Standards', 'A comprehensive guide to maintaining compliance with ASQA standards and requirements for RTOs.', 'Compliance', 'active', 'Admin User', '2024-01-15 00:00:00+00', NULL),
  ('Best Practices for Document Management', 'Learn how to effectively organize and manage your RTO documentation for audits and reviews.', 'Documentation', 'active', 'Admin User', '2024-01-20 00:00:00+00', NULL),
  ('Trainer Qualification Requirements', 'Essential information about maintaining valid trainer qualifications and industry currency.', 'Training', 'active', 'Admin User', '2024-02-01 00:00:00+00', NULL),
  ('Effective Assessment Strategies', 'Tips and techniques for designing and implementing effective assessment tools for your courses.', 'Assessment', 'active', 'Admin User', '2024-02-10 00:00:00+00', NULL),
  ('Managing Student Records', 'Guidelines for maintaining accurate and compliant student records and data management.', 'Administration', 'active', 'Admin User', '2024-02-15 00:00:00+00', NULL),
  ('Quality Assurance Processes', 'How to implement robust quality assurance processes to maintain high training standards.', 'Quality', 'draft', 'Admin User', '2024-02-20 00:00:00+00', NULL);

-- Create index for better query performance
CREATE INDEX idx_rto_tips_category ON public.rto_tips(category);
CREATE INDEX idx_rto_tips_status ON public.rto_tips(status);
CREATE INDEX idx_rto_tips_tenant_id ON public.rto_tips(tenant_id);