-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can upload task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update task files" ON storage.objects;

-- Allow authenticated users to upload files to their task folders
CREATE POLICY "Users can upload task files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'task-files');

-- Allow authenticated users to view task files
CREATE POLICY "Users can view task files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'task-files');

-- Allow authenticated users to delete task files
CREATE POLICY "Users can delete task files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'task-files');

-- Allow authenticated users to update task files
CREATE POLICY "Users can update task files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'task-files');