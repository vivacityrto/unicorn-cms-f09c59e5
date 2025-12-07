
-- Fix packages INSERT policy for authenticated users
-- Drop existing INSERT policy if it exists
DROP POLICY IF EXISTS "Authenticated users can add packages" ON public.packages;

-- Create a simple INSERT policy for authenticated users
CREATE POLICY "Authenticated users can add packages"
ON public.packages
FOR INSERT
TO authenticated
WITH CHECK (true);
