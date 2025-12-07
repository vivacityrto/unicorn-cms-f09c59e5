-- Add missing columns to package_stages table
ALTER TABLE package_stages
ADD COLUMN IF NOT EXISTS stage_name text,
ADD COLUMN IF NOT EXISTS short_name text,
ADD COLUMN IF NOT EXISTS stage_description text,
ADD COLUMN IF NOT EXISTS video_url text,
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Update any existing rows to set a default stage_name from documents_stages if stage_id exists
UPDATE package_stages ps
SET stage_name = COALESCE(ds.title, 'Unnamed Stage')
FROM documents_stages ds
WHERE ps.stage_id = ds.id
AND ps.stage_name IS NULL;