-- Add AI-assisted document analysis columns to documents table
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS ai_category_suggestion text,
ADD COLUMN IF NOT EXISTS ai_description_draft text,
ADD COLUMN IF NOT EXISTS ai_confidence integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS detected_merge_fields text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS detected_dropdown_sources jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS source_signals jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS framework_type text CHECK (framework_type IN ('RTO', 'CRICOS', 'GTO', NULL)),
ADD COLUMN IF NOT EXISTS ai_analysis_status text DEFAULT 'pending' CHECK (ai_analysis_status IN ('pending', 'analyzing', 'completed', 'failed', 'skipped'));

-- Add document_id to document_files if missing
ALTER TABLE public.document_files 
ADD COLUMN IF NOT EXISTS document_id bigint REFERENCES public.documents(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS file_type text,
ADD COLUMN IF NOT EXISTS file_size bigint,
ADD COLUMN IF NOT EXISTS original_filename text;

-- Create index on stage_documents for faster lookups
CREATE INDEX IF NOT EXISTS idx_stage_documents_document_id ON public.stage_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_stage_documents_stage_id ON public.stage_documents(stage_id);

-- Create view for document usage count
CREATE OR REPLACE VIEW public.document_stage_usage AS
SELECT 
  d.id as document_id,
  d.title,
  COUNT(DISTINCT sd.stage_id) as stage_count,
  array_agg(DISTINCT ds.title) FILTER (WHERE ds.title IS NOT NULL) as stage_names
FROM public.documents d
LEFT JOIN public.stage_documents sd ON sd.document_id = d.id
LEFT JOIN public.documents_stages ds ON ds.id = sd.stage_id
GROUP BY d.id, d.title;

-- Add comment explaining AI columns
COMMENT ON COLUMN public.documents.ai_category_suggestion IS 'AI-suggested document category based on content analysis';
COMMENT ON COLUMN public.documents.ai_description_draft IS 'AI-generated draft description of document purpose and usage';
COMMENT ON COLUMN public.documents.ai_confidence IS 'Confidence score (0-100) of AI categorization';
COMMENT ON COLUMN public.documents.detected_merge_fields IS 'Merge fields detected in document content';
COMMENT ON COLUMN public.documents.detected_dropdown_sources IS 'Data validation sources detected in Excel documents';
COMMENT ON COLUMN public.documents.source_signals IS 'Signals extracted from document for AI analysis';
COMMENT ON COLUMN public.documents.framework_type IS 'Regulatory framework type: RTO, CRICOS, or GTO';
COMMENT ON COLUMN public.documents.ai_analysis_status IS 'Status of AI content analysis';