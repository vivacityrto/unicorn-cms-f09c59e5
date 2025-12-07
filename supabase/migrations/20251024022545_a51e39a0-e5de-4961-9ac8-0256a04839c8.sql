
-- Fix packages table INSERT policy
-- The issue: INSERT policy was assigned to 'public' role instead of 'authenticated'

DROP POLICY IF EXISTS "Authenticated users can add packages" ON public.packages;

-- Recreate with correct role
CREATE POLICY "Authenticated users can add packages" 
ON public.packages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
