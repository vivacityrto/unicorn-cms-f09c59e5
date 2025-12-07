-- Update invitation_tokens table to use bigint for organisation_id
-- This matches the tenants.id column type (bigint)

-- First, drop the existing column
ALTER TABLE public.invitation_tokens 
DROP COLUMN IF EXISTS organisation_id;

-- Add it back as bigint
ALTER TABLE public.invitation_tokens 
ADD COLUMN organisation_id BIGINT;

-- Add a comment for clarity
COMMENT ON COLUMN public.invitation_tokens.organisation_id IS 'References tenants.id (bigint)';