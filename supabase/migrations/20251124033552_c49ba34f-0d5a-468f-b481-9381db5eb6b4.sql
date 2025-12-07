-- Add package_id column to documents table
ALTER TABLE public.documents 
ADD COLUMN package_id bigint REFERENCES public.packages(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_documents_package_id ON public.documents(package_id);

-- Update RLS policies to include package context
DROP POLICY IF EXISTS documents_select ON public.documents;
CREATE POLICY documents_select ON public.documents
  FOR SELECT
  USING (
    is_super_admin() OR 
    (get_current_user_role() = 'Team Leader') OR 
    ((tenant_id IS NOT NULL) AND (get_current_user_tenant() = tenant_id)) OR
    (tenant_id IS NULL) OR
    (package_id IS NOT NULL)
  );