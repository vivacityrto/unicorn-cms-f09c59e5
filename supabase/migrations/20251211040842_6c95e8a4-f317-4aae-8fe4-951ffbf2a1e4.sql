-- Create documents_notes table for stage-specific notes
CREATE TABLE public.documents_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id bigint NOT NULL REFERENCES public.documents_stages(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_id bigint REFERENCES public.packages(id) ON DELETE SET NULL,
  note_details text NOT NULL,
  note_type text,
  priority text,
  started_date timestamp with time zone,
  completed_date timestamp with time zone,
  uploaded_files text[],
  file_names text[],
  assignees uuid[],
  duration integer,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.documents_notes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "documents_notes_select" ON public.documents_notes
  FOR SELECT USING (
    is_super_admin() OR 
    tenant_id = get_current_user_tenant()
  );

CREATE POLICY "documents_notes_insert" ON public.documents_notes
  FOR INSERT WITH CHECK (
    is_super_admin() OR 
    tenant_id = get_current_user_tenant()
  );

CREATE POLICY "documents_notes_update" ON public.documents_notes
  FOR UPDATE USING (
    is_super_admin() OR 
    tenant_id = get_current_user_tenant()
  );

CREATE POLICY "documents_notes_delete" ON public.documents_notes
  FOR DELETE USING (
    is_super_admin() OR 
    tenant_id = get_current_user_tenant()
  );

-- Create updated_at trigger
CREATE TRIGGER update_documents_notes_updated_at
  BEFORE UPDATE ON public.documents_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();