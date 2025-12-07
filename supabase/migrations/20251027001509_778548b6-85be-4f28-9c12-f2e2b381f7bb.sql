-- Add first_name and last_name columns to user_invitations table
ALTER TABLE user_invitations 
ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS last_name text;