-- Add missing columns to user_invitations table for custom token flow

-- Add token_hash column for secure token storage
ALTER TABLE public.user_invitations 
ADD COLUMN IF NOT EXISTS token_hash text UNIQUE;

-- Add expires_at for token expiration
ALTER TABLE public.user_invitations 
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

-- Add status column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'user_invitations' 
                 AND column_name = 'status') THEN
    ALTER TABLE public.user_invitations 
    ADD COLUMN status text DEFAULT 'pending';
  END IF;
END $$;

-- Create index on token_hash for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_invitations_token_hash 
ON public.user_invitations(token_hash);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_user_invitations_status_v2
ON public.user_invitations(status);

-- Add comment for documentation
COMMENT ON COLUMN public.user_invitations.token_hash IS 'SHA-256 hash of the invitation token for secure validation';
COMMENT ON COLUMN public.user_invitations.expires_at IS 'Timestamp when the invitation token expires (typically 7 days from creation)';
COMMENT ON COLUMN public.user_invitations.status IS 'Status of invitation: pending, accepted, expired, or revoked';