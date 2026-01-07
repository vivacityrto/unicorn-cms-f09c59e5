-- Add frameworks column to documents_stages for Phase 9: Stage Framework Tagging
-- This allows stages to be tagged with applicable regulatory frameworks (RTO, CRICOS, GTO, Membership, Shared)

ALTER TABLE public.documents_stages
ADD COLUMN frameworks text[] NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.documents_stages.frameworks IS 'Regulatory frameworks this stage applies to. NULL or empty = Shared. Values: RTO, CRICOS, GTO, Membership, Shared';