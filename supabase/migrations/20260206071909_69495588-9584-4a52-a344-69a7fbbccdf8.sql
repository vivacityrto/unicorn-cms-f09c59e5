-- Add source tracking for email attachments to document_links
ALTER TABLE public.document_links 
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'sharepoint';

ALTER TABLE public.document_links 
ADD COLUMN IF NOT EXISTS source_email_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.document_links.source_type IS 'Source of document: sharepoint, outlook_attachment, upload';
COMMENT ON COLUMN public.document_links.source_email_id IS 'Reference to email_messages if document was linked from an email attachment';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_document_links_source_email ON public.document_links(source_email_id) WHERE source_email_id IS NOT NULL;

-- Update document_link_audit to track email attachment linking
ALTER TABLE public.document_link_audit DROP CONSTRAINT IF EXISTS document_link_audit_action_check;

-- Allow new action type for email attachments
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'document_link_audit_action_check'
    ) THEN
        ALTER TABLE public.document_link_audit 
        ADD CONSTRAINT document_link_audit_action_check 
        CHECK (action IN ('document_linked', 'version_confirmed', 'document_unlinked', 'document_linked_from_email'));
    END IF;
END $$;