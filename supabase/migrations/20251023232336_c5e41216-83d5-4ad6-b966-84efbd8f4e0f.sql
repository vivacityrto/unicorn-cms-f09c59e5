-- Add status column to packages table
ALTER TABLE public.packages 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Add a check constraint for status
ALTER TABLE public.packages
ADD CONSTRAINT packages_status_check CHECK (status IN ('active', 'inactive'));

-- Drop the packages_with_client_counts view since we'll query packages directly
DROP VIEW IF EXISTS public.packages_with_client_counts;

-- Update RLS policies for packages to allow status updates
DROP POLICY IF EXISTS "Super Admins can update packages" ON public.packages;

CREATE POLICY "Super Admins can update packages"
ON public.packages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = auth.uid()
    AND unicorn_role IN ('Super Admin', 'Team Leader')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = auth.uid()
    AND unicorn_role IN ('Super Admin', 'Team Leader')
  )
);