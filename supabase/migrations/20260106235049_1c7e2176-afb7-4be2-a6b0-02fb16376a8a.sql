-- Phase 3: Add is_archived column for soft delete
ALTER TABLE public.documents_stages 
ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- Add index for filtering archived stages
CREATE INDEX IF NOT EXISTS idx_documents_stages_is_archived 
ON public.documents_stages(is_archived);

-- Add composite index for common filters
CREATE INDEX IF NOT EXISTS idx_documents_stages_archived_certified 
ON public.documents_stages(is_archived, is_certified);