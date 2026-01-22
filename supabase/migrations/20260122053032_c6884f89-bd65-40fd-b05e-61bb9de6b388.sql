-- Drop the buggy policies
DROP POLICY IF EXISTS "notes_tenant_read" ON public.notes;
DROP POLICY IF EXISTS "notes_tenant_insert" ON public.notes;
DROP POLICY IF EXISTS "notes_tenant_update" ON public.notes;
DROP POLICY IF EXISTS "notes_tenant_delete" ON public.notes;

-- Create corrected RLS policies for notes table
-- Read: Users can read notes for tenants they belong to
CREATE POLICY "notes_tenant_read" ON public.notes
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_uuid = auth.uid()
  )
);

-- Insert: Users can create notes for tenants they belong to
CREATE POLICY "notes_tenant_insert" ON public.notes
FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_uuid = auth.uid()
  ) AND created_by = auth.uid()
);

-- Update: Users can update their own notes or admins can update any note for their tenant
CREATE POLICY "notes_tenant_update" ON public.notes
FOR UPDATE
USING (
  created_by = auth.uid() OR
  tenant_id IN (
    SELECT tenant_id FROM tenant_users 
    WHERE user_uuid = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- Delete: Users can delete their own notes or admins can delete any note for their tenant
CREATE POLICY "notes_tenant_delete" ON public.notes
FOR DELETE
USING (
  created_by = auth.uid() OR
  tenant_id IN (
    SELECT tenant_id FROM tenant_users 
    WHERE user_uuid = auth.uid() AND role IN ('admin', 'superadmin')
  )
);