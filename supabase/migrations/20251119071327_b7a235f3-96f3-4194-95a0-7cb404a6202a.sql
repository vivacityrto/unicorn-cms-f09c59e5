-- Create storage bucket for task files
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-files', 'task-files', false);

-- Add file_paths column to tasks_tenants table
ALTER TABLE tasks_tenants
ADD COLUMN file_paths text[] DEFAULT '{}';

-- RLS policies for task-files bucket
CREATE POLICY "Users can view their tenant task files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'task-files' 
  AND (
    is_super_admin() 
    OR EXISTS (
      SELECT 1 FROM tasks_tenants t
      WHERE (storage.foldername(name))[1] = t.id::text
      AND (t.tenant_id = get_current_user_tenant() OR is_super_admin())
    )
  )
);

CREATE POLICY "Users can upload task files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'task-files'
  AND (is_super_admin() OR auth.uid() IS NOT NULL)
);

CREATE POLICY "Users can delete their tenant task files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'task-files'
  AND (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM tasks_tenants t
      WHERE (storage.foldername(name))[1] = t.id::text
      AND t.tenant_id = get_current_user_tenant()
    )
  )
);