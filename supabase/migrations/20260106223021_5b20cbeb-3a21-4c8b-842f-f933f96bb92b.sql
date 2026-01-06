-- Add certified stage metadata fields to documents_stages
ALTER TABLE public.documents_stages 
ADD COLUMN IF NOT EXISTS is_certified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS certified_notes text NULL;