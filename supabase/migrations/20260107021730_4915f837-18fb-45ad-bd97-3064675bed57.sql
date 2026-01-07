-- Add missing columns to stage_documents for better document management
ALTER TABLE public.stage_documents 
ADD COLUMN IF NOT EXISTS is_tenant_visible boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS notes text NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_stage_documents_stage_sort ON public.stage_documents(stage_id, sort_order);

-- Ensure RLS is enabled with proper policies
ALTER TABLE public.stage_documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Authenticated users can view stage_documents" ON public.stage_documents;
DROP POLICY IF EXISTS "Authenticated users can insert stage_documents" ON public.stage_documents;
DROP POLICY IF EXISTS "Authenticated users can update stage_documents" ON public.stage_documents;
DROP POLICY IF EXISTS "Authenticated users can delete stage_documents" ON public.stage_documents;

CREATE POLICY "Authenticated users can view stage_documents"
ON public.stage_documents FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert stage_documents"
ON public.stage_documents FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update stage_documents"
ON public.stage_documents FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete stage_documents"
ON public.stage_documents FOR DELETE
TO authenticated
USING (true);