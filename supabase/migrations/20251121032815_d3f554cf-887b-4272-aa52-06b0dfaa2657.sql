-- Alter the created_by column to be UUID and reference users table
ALTER TABLE public.rto_tips DROP COLUMN created_by;

ALTER TABLE public.rto_tips ADD COLUMN created_by UUID REFERENCES auth.users(id);

-- Update demo data to use a real user UUID (we'll update this after we get the UUID)
-- For now, we'll leave it NULL and update it separately