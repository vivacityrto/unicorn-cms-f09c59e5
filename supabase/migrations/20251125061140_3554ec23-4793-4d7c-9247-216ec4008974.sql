-- Add categories_id column to package_documents table
ALTER TABLE package_documents ADD COLUMN IF NOT EXISTS categories_id bigint;

-- Add foreign key constraint to documents_categories
ALTER TABLE package_documents ADD CONSTRAINT fk_package_documents_categories 
FOREIGN KEY (categories_id) REFERENCES documents_categories(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_package_documents_categories ON package_documents(categories_id);