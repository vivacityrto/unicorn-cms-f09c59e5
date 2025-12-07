-- Add is_released_to_client column to package_documents table
ALTER TABLE package_documents ADD COLUMN IF NOT EXISTS is_released_to_client boolean NOT NULL DEFAULT false;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_package_documents_released ON package_documents(package_id, is_released_to_client) WHERE is_released_to_client = true;