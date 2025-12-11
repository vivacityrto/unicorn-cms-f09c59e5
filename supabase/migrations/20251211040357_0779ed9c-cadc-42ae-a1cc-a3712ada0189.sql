-- Add stage_ids column to tenants table to store assigned stages from documents_stages
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS stage_ids bigint[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.stage_ids IS 'Array of stage IDs from documents_stages table assigned to this tenant';