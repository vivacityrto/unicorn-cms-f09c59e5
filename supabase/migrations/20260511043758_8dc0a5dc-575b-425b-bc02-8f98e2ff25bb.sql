-- 1. academy-evidence bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'academy-evidence',
  'academy-evidence',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies on storage.objects scoped to this bucket
-- Path scheme: pdp/{user_uuid}/{cycle_id}/{uuid}-{filename}
-- foldername index: [1]='pdp', [2]=user_uuid, [3]=cycle_id

DROP POLICY IF EXISTS "academy_evidence_insert_owner" ON storage.objects;
CREATE POLICY "academy_evidence_insert_owner"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'academy-evidence'
  AND (storage.foldername(name))[1] = 'pdp'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "academy_evidence_select" ON storage.objects;
CREATE POLICY "academy_evidence_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'academy-evidence'
  AND (
    -- Owner of the file (their own folder)
    (storage.foldername(name))[2] = auth.uid()::text
    OR
    -- Vivacity internal staff: read all
    is_vivacity_team_safe(auth.uid())
    OR
    -- Tenant admins/owners: read evidence for cycles in their tenant
    EXISTS (
      SELECT 1
      FROM public.pdp_cycles c
      JOIN public.tenant_users tu ON tu.tenant_id = c.tenant_id
      WHERE (storage.foldername(name))[3] ~ '^[0-9]+$'
        AND c.id = ((storage.foldername(name))[3])::bigint
        AND tu.user_id = auth.uid()
        AND tu.role = ANY (ARRAY['admin','owner'])
    )
  )
);

DROP POLICY IF EXISTS "academy_evidence_update_owner" ON storage.objects;
CREATE POLICY "academy_evidence_update_owner"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'academy-evidence'
  AND (storage.foldername(name))[2] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'academy-evidence'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "academy_evidence_delete_owner_or_admin" ON storage.objects;
CREATE POLICY "academy_evidence_delete_owner_or_admin"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'academy-evidence'
  AND (
    (storage.foldername(name))[2] = auth.uid()::text
    OR is_super_admin_safe(auth.uid())
  )
);

-- 3. Add standard_id column on pdp_evidence_items (additive, nullable, FK)
ALTER TABLE public.pdp_evidence_items
  ADD COLUMN IF NOT EXISTS standard_id uuid
    REFERENCES public.standards_reference(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pdp_evidence_standard
  ON public.pdp_evidence_items(standard_id);
