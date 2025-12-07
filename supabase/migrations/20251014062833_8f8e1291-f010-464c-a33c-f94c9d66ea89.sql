-- Add expires_at and update status field for user_invitations

-- Add expires_at column (24 hours from creation)
ALTER TABLE public.user_invitations 
ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '24 hours');

-- Update existing rows to set expires_at
UPDATE public.user_invitations 
SET expires_at = created_at + interval '24 hours'
WHERE expires_at IS NULL;

-- Make expires_at NOT NULL
ALTER TABLE public.user_invitations 
ALTER COLUMN expires_at SET NOT NULL;

-- Drop old status constraint if exists
ALTER TABLE public.user_invitations 
DROP CONSTRAINT IF EXISTS user_invitations_status_check;

-- Add new status constraint with pending, expired, failed, sent
ALTER TABLE public.user_invitations 
ADD CONSTRAINT user_invitations_status_check 
CHECK (status IN ('pending', 'expired', 'failed', 'sent'));

-- Update existing 'sent' status to remain as is, others default to 'pending'
UPDATE public.user_invitations 
SET status = 'pending'
WHERE status NOT IN ('pending', 'expired', 'failed', 'sent');

-- Create function to auto-expire invitations
CREATE OR REPLACE FUNCTION public.check_invitation_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-expire if past expiration and still pending
  IF NEW.status = 'pending' AND NEW.expires_at < now() THEN
    NEW.status := 'expired';
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to check expiry on updates
DROP TRIGGER IF EXISTS check_invitation_expiry_trigger ON public.user_invitations;
CREATE TRIGGER check_invitation_expiry_trigger
  BEFORE UPDATE ON public.user_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_invitation_expiry();

-- Create index for efficient expiry checks
CREATE INDEX IF NOT EXISTS idx_user_invitations_expires_at 
ON public.user_invitations(expires_at) 
WHERE status = 'pending';