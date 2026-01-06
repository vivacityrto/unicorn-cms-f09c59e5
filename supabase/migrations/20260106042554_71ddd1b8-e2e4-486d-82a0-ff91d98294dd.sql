-- Fix security issue: Replace view that exposes auth.users with a secure RPC-only approach
-- Drop the insecure view
DROP VIEW IF EXISTS public.v_user_audit;

-- The get_user_audit RPC is already secure (SECURITY DEFINER with SuperAdmin check)
-- and doesn't expose auth.users directly to authenticated role