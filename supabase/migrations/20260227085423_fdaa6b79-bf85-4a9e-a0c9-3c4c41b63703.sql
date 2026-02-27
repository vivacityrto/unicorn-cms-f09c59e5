
-- Add is_recurring to public.stages (the actual stage registry table)
ALTER TABLE public.stages
ADD COLUMN is_recurring boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stages.is_recurring IS 'Whether tasks in this stage should reset on package renewal';
