-- ============================================================
-- Security Fix: Mask token_hash in auth_tokens table
-- Issue: auth_tokens_hash_exposure
-- Pattern: Follow oauth_tokens_safe approach
-- ============================================================

-- 1. DROP existing SELECT policy that exposes token_hash
DROP POLICY IF EXISTS "auth_tokens_select" ON public.auth_tokens;

-- 2. DROP overlapping ALL policies (keep only granular policies)
DROP POLICY IF EXISTS "auth_tokens_manage" ON public.auth_tokens;
DROP POLICY IF EXISTS "auth_tokens_manage_own" ON public.auth_tokens;
DROP POLICY IF EXISTS "auth_tokens_manage_superadmin" ON public.auth_tokens;

-- 3. CREATE restrictive policies - block SELECT, allow manage operations

-- SELECT: Block all authenticated users (use safe view instead)
CREATE POLICY "auth_tokens_select_blocked"
ON public.auth_tokens
FOR SELECT TO authenticated
USING (false);

-- INSERT: Users can create their own tokens
CREATE POLICY "auth_tokens_insert"
ON public.auth_tokens
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- UPDATE: Users can update their own tokens, SuperAdmins can update any
CREATE POLICY "auth_tokens_update"
ON public.auth_tokens
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
);

-- DELETE: Users can delete their own tokens, SuperAdmins can delete any
CREATE POLICY "auth_tokens_delete"
ON public.auth_tokens
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
);

-- 4. CREATE safe view that masks token_hash
CREATE OR REPLACE VIEW public.auth_tokens_safe
WITH (security_invoker = true)
AS
SELECT 
  id,
  user_id,
  email,
  token_type,
  '***REDACTED***'::text AS token_hash,
  expires_at,
  used_at,
  ip_issued,
  ua_issued,
  ip_used,
  ua_used,
  meta,
  created_at
FROM public.auth_tokens
WHERE user_id = auth.uid() 
   OR public.is_super_admin_safe(auth.uid());

-- Add comment for documentation
COMMENT ON VIEW public.auth_tokens_safe IS 
'Safe view of auth_tokens that masks token_hash values. Use this view for all client-side queries. Raw token access is restricted to service role only.';