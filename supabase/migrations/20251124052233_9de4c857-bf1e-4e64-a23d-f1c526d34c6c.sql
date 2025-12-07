-- Add is_released column to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS is_released boolean DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN documents.is_released IS 'Whether this document is released and visible to clients in their tenant documents view';