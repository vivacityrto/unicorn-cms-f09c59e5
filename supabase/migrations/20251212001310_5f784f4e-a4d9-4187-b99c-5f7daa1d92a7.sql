-- Add status column to documents_stages table
ALTER TABLE public.documents_stages 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'not_started';

-- Add comment for documentation
COMMENT ON COLUMN public.documents_stages.status IS 'Stage status: not_started, in_progress, completed';