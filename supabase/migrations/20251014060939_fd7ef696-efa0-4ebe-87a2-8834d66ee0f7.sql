-- Make token column nullable since we're using token_hash for security
-- We don't want to store plain tokens in the database

ALTER TABLE public.user_invitations 
ALTER COLUMN token DROP NOT NULL;

-- Add comment explaining the change
COMMENT ON COLUMN public.user_invitations.token IS 'Deprecated: Use token_hash instead. Plain tokens should not be stored in database for security reasons.';