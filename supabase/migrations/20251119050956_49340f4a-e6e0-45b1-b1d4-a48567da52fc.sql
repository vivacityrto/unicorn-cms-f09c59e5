-- Add details column to packages table for storing package descriptions
ALTER TABLE packages
ADD COLUMN IF NOT EXISTS details text;