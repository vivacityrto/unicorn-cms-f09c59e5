-- Create compliance_pack_exports table
CREATE TABLE public.compliance_pack_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES auth.users(id),
  tenant_id integer NOT NULL REFERENCES public.tenants(id),
  stage_release_id uuid NULL REFERENCES public.stage_releases(id),
  package_id bigint NULL REFERENCES public.packages(id),
  export_scope text NOT NULL DEFAULT 'stage_release' CHECK (export_scope IN ('stage_release', 'package', 'date_range')),
  date_from date NULL,
  date_to date NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'failed')),
  storage_path text NULL,
  file_name text NULL,
  file_size_bytes bigint NULL,
  error text NULL,
  contents_summary jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

-- Create indexes
CREATE INDEX idx_compliance_exports_tenant ON public.compliance_pack_exports(tenant_id);
CREATE INDEX idx_compliance_exports_status ON public.compliance_pack_exports(status);
CREATE INDEX idx_compliance_exports_requested_by ON public.compliance_pack_exports(requested_by);

-- Enable RLS
ALTER TABLE public.compliance_pack_exports ENABLE ROW LEVEL SECURITY;

-- RLS policies: Only Admin/SuperAdmin can access
CREATE POLICY "Admin can view compliance exports" ON public.compliance_pack_exports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Admin')
    )
  );

CREATE POLICY "Admin can create compliance exports" ON public.compliance_pack_exports
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Admin')
    )
  );

CREATE POLICY "Admin can update own exports" ON public.compliance_pack_exports
  FOR UPDATE
  USING (
    requested_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role = 'Super Admin'
    )
  );

-- Create storage bucket for compliance packs
INSERT INTO storage.buckets (id, name, public)
VALUES ('compliance-packs', 'compliance-packs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for compliance packs bucket
CREATE POLICY "Admin can read compliance packs" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'compliance-packs' AND
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Admin')
    )
  );

CREATE POLICY "Service can write compliance packs" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'compliance-packs');

CREATE POLICY "Service can update compliance packs" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'compliance-packs');