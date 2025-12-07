-- Add RLS policies for invitation_tokens table
-- Enable RLS on invitation_tokens
ALTER TABLE public.invitation_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Super Admins can insert invitation tokens
CREATE POLICY "Super Admins can insert invitation tokens"
ON public.invitation_tokens
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

-- Policy: Super Admins can view all invitation tokens
CREATE POLICY "Super Admins can view all invitation tokens"
ON public.invitation_tokens
FOR SELECT
TO authenticated
USING (is_super_admin());

-- Policy: Super Admins can update invitation tokens
CREATE POLICY "Super Admins can update invitation tokens"
ON public.invitation_tokens
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Policy: Users can view their own invitation tokens by email
CREATE POLICY "Users can view their own invitation tokens"
ON public.invitation_tokens
FOR SELECT
TO authenticated
USING (email = current_user_email());