-- =====================================================
-- Protect OAuth tokens from client-side exposure
-- Tokens should only be accessible via edge functions with service role
-- =====================================================

-- 1. Drop existing permissive policies that allow users to see their token values
DROP POLICY IF EXISTS "Users can view own tokens" ON public.oauth_tokens;
DROP POLICY IF EXISTS "Users can manage own tokens" ON public.oauth_tokens;

-- 2. Create a secure view that hides sensitive token values
-- Users can see their token metadata (provider, expiry, scope) but NOT the actual tokens
CREATE OR REPLACE VIEW public.oauth_tokens_safe AS
SELECT 
  id,
  user_id,
  tenant_id,
  provider,
  -- Mask token values - only show that they exist
  CASE WHEN access_token IS NOT NULL THEN '***REDACTED***' ELSE NULL END as access_token_status,
  CASE WHEN refresh_token IS NOT NULL THEN '***REDACTED***' ELSE NULL END as refresh_token_status,
  expires_at,
  scope,
  created_at,
  updated_at,
  -- Computed field for UI to check if token is expired
  (expires_at < NOW()) as is_expired
FROM public.oauth_tokens;

-- 3. Enable RLS on the view (views inherit table RLS but we make it explicit)
ALTER VIEW public.oauth_tokens_safe SET (security_invoker = true);

-- 4. Create restrictive RLS policies on the base table
-- SELECT: Only service role (edge functions) can read actual token values
-- Users cannot SELECT from the base table at all
CREATE POLICY "Service role only can read tokens"
ON public.oauth_tokens FOR SELECT
USING (
  -- Only allow access via service role (edge functions)
  -- Regular authenticated users must use the safe view
  auth.uid() IS NULL -- This blocks all authenticated users from SELECT
);

-- INSERT: Users can create their own tokens (via edge function flow)
CREATE POLICY "Users can insert own tokens"
ON public.oauth_tokens FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can update their own tokens (via edge function flow)  
CREATE POLICY "Users can update own tokens"
ON public.oauth_tokens FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can delete their own tokens
CREATE POLICY "Users can delete own tokens"
ON public.oauth_tokens FOR DELETE
USING (auth.uid() = user_id);

-- 5. Grant SELECT on safe view to authenticated users
GRANT SELECT ON public.oauth_tokens_safe TO authenticated;

-- 6. Add comment explaining the security model
COMMENT ON VIEW public.oauth_tokens_safe IS 
'Secure view of oauth_tokens that masks actual token values. 
Use this view for client-side queries. 
Actual tokens are only accessible via edge functions using service role.';

COMMENT ON TABLE public.oauth_tokens IS 
'OAuth tokens for external services. 
SECURITY: Direct SELECT is blocked for authenticated users. 
Use oauth_tokens_safe view for client queries. 
Edge functions access via service role for token operations.';