-- Add file_paths column to package_documents table
ALTER TABLE package_documents 
ADD COLUMN IF NOT EXISTS file_paths TEXT[];