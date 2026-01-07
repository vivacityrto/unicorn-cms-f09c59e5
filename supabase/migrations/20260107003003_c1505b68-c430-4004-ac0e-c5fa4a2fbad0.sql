-- Phase 8: Add requires_stage_keys column for cross-stage dependencies
ALTER TABLE public.documents_stages
ADD COLUMN requires_stage_keys text[] NULL;