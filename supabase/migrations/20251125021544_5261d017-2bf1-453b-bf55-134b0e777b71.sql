-- Add missing columns to package_stages table
ALTER TABLE package_stages 
ADD COLUMN IF NOT EXISTS short_name TEXT,
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS order_number INTEGER DEFAULT 0;