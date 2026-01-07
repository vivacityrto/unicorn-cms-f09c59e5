-- Add version_label column to documents_stages
ALTER TABLE public.documents_stages 
ADD COLUMN IF NOT EXISTS version_label text NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.documents_stages.version_label IS 'Human-readable version label for audit and rollout clarity (e.g., v2025.1, July 2026)';