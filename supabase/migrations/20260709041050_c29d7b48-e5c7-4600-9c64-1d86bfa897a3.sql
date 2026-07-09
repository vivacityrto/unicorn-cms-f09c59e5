-- Extend user_daily_notes with structured note fields (back-compat: keep `content`)
ALTER TABLE public.user_daily_notes
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'purple',
  ADD COLUMN IF NOT EXISTS body  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Security fix: compliance-packs bucket admin read policy was missing a tenant check.
-- Add tenant scoping so Admins/Super Admins can only read files in their own tenant folder.
DROP POLICY IF EXISTS "Admin can read compliance packs" ON storage.objects;

CREATE POLICY "Admin can read compliance packs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'compliance-packs'
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND u.unicorn_role IN ('Super Admin', 'Admin')
  )
  AND (
    -- Super Admin: full access. Admin: only their tenant's folder.
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role = 'Super Admin'
    )
    OR public.has_tenant_access_safe(
         ((storage.foldername(name))[1])::bigint,
         auth.uid()
       )
  )
);
