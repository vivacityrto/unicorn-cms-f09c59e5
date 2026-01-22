-- Create security definer function to check tenant membership (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.user_has_tenant_access(p_tenant_id BIGINT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = auth.uid()
    AND tenant_id = p_tenant_id
  )
$$;

-- Drop the buggy policies
DROP POLICY IF EXISTS "notes_tenant_read" ON public.notes;
DROP POLICY IF EXISTS "notes_tenant_insert" ON public.notes;
DROP POLICY IF EXISTS "notes_tenant_update" ON public.notes;
DROP POLICY IF EXISTS "notes_tenant_delete" ON public.notes;

-- Create corrected RLS policies using security definer function
CREATE POLICY "notes_tenant_read" ON public.notes
FOR SELECT
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "notes_tenant_insert" ON public.notes
FOR INSERT
WITH CHECK (public.user_has_tenant_access(tenant_id) AND created_by = auth.uid());

CREATE POLICY "notes_tenant_update" ON public.notes
FOR UPDATE
USING (
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM tenant_users 
    WHERE user_id = auth.uid() 
    AND tenant_id = notes.tenant_id 
    AND role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "notes_tenant_delete" ON public.notes
FOR DELETE
USING (
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM tenant_users 
    WHERE user_id = auth.uid() 
    AND tenant_id = notes.tenant_id 
    AND role IN ('admin', 'superadmin')
  )
);