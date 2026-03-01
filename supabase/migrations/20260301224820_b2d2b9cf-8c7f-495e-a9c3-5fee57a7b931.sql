-- Fix: UPDATE policy for client-logos needs WITH CHECK for upsert to work
DROP POLICY IF EXISTS "Staff can update client logos" ON storage.objects;
CREATE POLICY "Staff can update client logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'client-logos' AND is_vivacity_team_safe(auth.uid()))
WITH CHECK (bucket_id = 'client-logos' AND is_vivacity_team_safe(auth.uid()));

-- Also add SELECT policy so staff can read/check existing objects (needed for upsert)
CREATE POLICY "Anyone can view client logos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'client-logos');