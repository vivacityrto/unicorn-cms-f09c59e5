-- Add Phase Registry columns for enhanced tracking
-- These columns support compliance tracking and lifecycle management

-- Registry code for official compliance identification
ALTER TABLE public.documents_stages 
ADD COLUMN IF NOT EXISTS registry_code text;

-- Effective date when phase became/becomes available
ALTER TABLE public.documents_stages 
ADD COLUMN IF NOT EXISTS effective_date date;

-- Timestamp when phase was deprecated (null if active)
ALTER TABLE public.documents_stages 
ADD COLUMN IF NOT EXISTS deprecated_at timestamp with time zone;

-- Add comment for documentation
COMMENT ON TABLE public.documents_stages IS 'Phase Registry - Authoritative source for all workflow phases in Unicorn 2.0. Note: Table retains legacy "stage" naming for backwards compatibility.';

COMMENT ON COLUMN public.documents_stages.registry_code IS 'Official registry code for compliance tracking and reporting';
COMMENT ON COLUMN public.documents_stages.effective_date IS 'Date when this phase became or becomes effective for use';
COMMENT ON COLUMN public.documents_stages.deprecated_at IS 'Timestamp when phase was deprecated, null if still active';
COMMENT ON COLUMN public.documents_stages.stage_key IS 'Unique phase identifier code (e.g., TAS, HC-PREP)';
COMMENT ON COLUMN public.documents_stages.stage_type IS 'Phase classification: delivery, internal, milestone, review';

-- Create index on registry_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_documents_stages_registry_code 
ON public.documents_stages(registry_code) 
WHERE registry_code IS NOT NULL;

-- Create index on effective_date for date-based queries
CREATE INDEX IF NOT EXISTS idx_documents_stages_effective_date 
ON public.documents_stages(effective_date) 
WHERE effective_date IS NOT NULL;