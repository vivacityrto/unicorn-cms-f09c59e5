-- Add duration column to tenant_notes table (in minutes)
ALTER TABLE public.tenant_notes 
ADD COLUMN duration integer DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.tenant_notes.duration IS 'Duration in minutes consumed for this note';