-- Enable RLS on staff_tasks
ALTER TABLE public.staff_tasks ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check superadmin status
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_uuid = auth.uid()
      AND global_role = 'superadmin'
  )
$$;

-- All authenticated users can read staff tasks (reference data)
CREATE POLICY "Authenticated users can read staff_tasks"
ON public.staff_tasks
FOR SELECT
TO authenticated
USING (true);

-- Only SuperAdmins can insert staff tasks
CREATE POLICY "SuperAdmins can insert staff_tasks"
ON public.staff_tasks
FOR INSERT
TO authenticated
WITH CHECK (public.is_superadmin());

-- Only SuperAdmins can update staff tasks
CREATE POLICY "SuperAdmins can update staff_tasks"
ON public.staff_tasks
FOR UPDATE
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

-- Only SuperAdmins can delete staff tasks
CREATE POLICY "SuperAdmins can delete staff_tasks"
ON public.staff_tasks
FOR DELETE
TO authenticated
USING (public.is_superadmin());