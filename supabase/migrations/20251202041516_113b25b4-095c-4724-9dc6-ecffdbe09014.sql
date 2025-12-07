-- Add missing columns to tenant_notes table
ALTER TABLE tenant_notes 
ADD COLUMN IF NOT EXISTS note_type text,
ADD COLUMN IF NOT EXISTS priority text,
ADD COLUMN IF NOT EXISTS started_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS completed_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS uploaded_files text[],
ADD COLUMN IF NOT EXISTS file_names text[],
ADD COLUMN IF NOT EXISTS assignees uuid[];

-- Create index on assignees for faster queries
CREATE INDEX IF NOT EXISTS idx_tenant_notes_assignees ON tenant_notes USING GIN(assignees);