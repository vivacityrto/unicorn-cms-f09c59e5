-- Create tenant_notes table for storing quick notes
CREATE TABLE public.tenant_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  note_details text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_tenant_notes_tenant_id ON public.tenant_notes(tenant_id);
CREATE INDEX idx_tenant_notes_created_by ON public.tenant_notes(created_by);
CREATE INDEX idx_tenant_notes_created_at ON public.tenant_notes(created_at DESC);

-- Enable RLS
ALTER TABLE public.tenant_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "tenant_notes_select" ON public.tenant_notes
  FOR SELECT USING (
    is_super_admin() OR 
    tenant_id = get_current_user_tenant()
  );

CREATE POLICY "tenant_notes_insert" ON public.tenant_notes
  FOR INSERT WITH CHECK (
    is_super_admin() OR 
    tenant_id = get_current_user_tenant()
  );

CREATE POLICY "tenant_notes_update" ON public.tenant_notes
  FOR UPDATE USING (
    is_super_admin() OR 
    (tenant_id = get_current_user_tenant() AND created_by = auth.uid())
  );

CREATE POLICY "tenant_notes_delete" ON public.tenant_notes
  FOR DELETE USING (
    is_super_admin() OR 
    (tenant_id = get_current_user_tenant() AND created_by = auth.uid())
  );

-- Trigger for updated_at
CREATE TRIGGER update_tenant_notes_updated_at
  BEFORE UPDATE ON public.tenant_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Grant permissions
GRANT ALL ON public.tenant_notes TO authenticated;