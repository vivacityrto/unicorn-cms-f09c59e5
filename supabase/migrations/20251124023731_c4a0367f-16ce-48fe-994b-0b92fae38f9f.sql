-- Add is_active column to package_stages table
ALTER TABLE package_stages 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_package_stages_is_active ON package_stages(is_active);