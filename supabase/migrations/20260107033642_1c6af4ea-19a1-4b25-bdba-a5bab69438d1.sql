-- Add scan metadata to documents
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS scan_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS scanned_at timestamptz,
ADD COLUMN IF NOT EXISTS named_ranges jsonb DEFAULT '[]'::jsonb;

-- Add index for scan_status
CREATE INDEX IF NOT EXISTS idx_documents_scan_status ON public.documents(scan_status);