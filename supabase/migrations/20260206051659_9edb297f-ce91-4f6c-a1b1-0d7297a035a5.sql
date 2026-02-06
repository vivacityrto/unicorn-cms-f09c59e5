-- Create a secure view that shows connection status without exposing tokens
-- This view uses SECURITY INVOKER to respect RLS of the querying user
CREATE OR REPLACE VIEW public.user_outlook_connection_status
WITH (security_invoker = true)
AS
SELECT 
  ot.id,
  ot.user_id,
  ot.tenant_id,
  ot.provider,
  ot.expires_at,
  CASE 
    WHEN ot.expires_at > now() THEN 'valid'
    ELSE 'expired'
  END as token_status,
  ot.created_at,
  ot.updated_at,
  -- Redact actual tokens
  '***REDACTED***' as access_token_masked,
  CASE WHEN ot.refresh_token IS NOT NULL THEN '***REDACTED***' ELSE NULL END as refresh_token_masked
FROM public.oauth_tokens ot
WHERE ot.provider = 'microsoft';

-- Grant select to authenticated users
GRANT SELECT ON public.user_outlook_connection_status TO authenticated;

-- Add RLS policy to oauth_tokens for users to SELECT their own tokens (status only via view)
-- First drop the old blocking policy
DROP POLICY IF EXISTS "Service role only can read tokens" ON public.oauth_tokens;

-- Create new policy that allows users to see their own tokens
CREATE POLICY "Users can view own tokens"
ON public.oauth_tokens
FOR SELECT
USING (auth.uid() = user_id);

-- Add last_synced_at column to oauth_tokens if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'oauth_tokens' AND column_name = 'last_synced_at'
  ) THEN
    ALTER TABLE public.oauth_tokens ADD COLUMN last_synced_at timestamptz;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'oauth_tokens' AND column_name = 'last_error'
  ) THEN
    ALTER TABLE public.oauth_tokens ADD COLUMN last_error text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'oauth_tokens' AND column_name = 'account_email'
  ) THEN
    ALTER TABLE public.oauth_tokens ADD COLUMN account_email text;
  END IF;
END $$;

-- Update the view to include new columns
DROP VIEW IF EXISTS public.user_outlook_connection_status;

CREATE VIEW public.user_outlook_connection_status
WITH (security_invoker = true)
AS
SELECT 
  ot.id,
  ot.user_id,
  ot.tenant_id,
  ot.provider,
  ot.expires_at,
  ot.last_synced_at,
  ot.last_error,
  ot.account_email,
  CASE 
    WHEN ot.expires_at > now() THEN 'valid'
    ELSE 'expired'
  END as token_status,
  CASE 
    WHEN ot.last_error IS NOT NULL THEN 'error'
    WHEN ot.expires_at <= now() THEN 'expired'
    ELSE 'connected'
  END as connection_status,
  ot.created_at,
  ot.updated_at
FROM public.oauth_tokens ot
WHERE ot.provider = 'microsoft'
  AND ot.user_id = auth.uid();

GRANT SELECT ON public.user_outlook_connection_status TO authenticated;

COMMENT ON VIEW public.user_outlook_connection_status IS 'Per-user Outlook connection status - filtered by auth.uid() for data isolation';