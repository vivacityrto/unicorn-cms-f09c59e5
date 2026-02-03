-- Add parent_function_id column to support sub-functions under Functional Leads
-- A lead has parent_function_id = NULL, child functions reference their lead

ALTER TABLE public.accountability_functions 
ADD COLUMN parent_function_id uuid NULL 
REFERENCES public.accountability_functions(id) ON DELETE CASCADE;

-- Add index for efficient querying of children by parent
CREATE INDEX idx_accountability_functions_parent ON public.accountability_functions(parent_function_id, sort_order);

-- Add composite index for tenant + parent queries
CREATE INDEX idx_accountability_functions_tenant_parent ON public.accountability_functions(tenant_id, parent_function_id);

-- Add comment for documentation
COMMENT ON COLUMN public.accountability_functions.parent_function_id IS 
  'NULL for top-level functions/leads, references parent function ID for nested sub-functions';

-- RLS: Already has Vivacity Team filtering; ensure it covers parent_function_id access
-- The existing policies filter by tenant_id which is sufficient