-- Security Fix: Remove dangerous users table policy that exposes all user data
-- The "Allow role checks for SECURITY DEFINER functions" policy uses USING(true)
-- which exposes ALL user personal information to ANY authenticated user.
-- SECURITY DEFINER functions bypass RLS anyway, so this policy is unnecessary.

-- Drop the dangerous policy
DROP POLICY IF EXISTS "Allow role checks for SECURITY DEFINER functions" ON public.users;

-- Note: SECURITY DEFINER functions will continue to work properly
-- because they execute with the privileges of the function owner,
-- bypassing RLS automatically.