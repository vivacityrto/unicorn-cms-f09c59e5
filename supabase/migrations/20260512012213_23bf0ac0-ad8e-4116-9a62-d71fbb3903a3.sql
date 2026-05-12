-- Create buckets (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('doc-templates',  'doc-templates',  false, 52428800, NULL),
  ('generated-docs', 'generated-docs', false, 10485760,
   ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- doc-templates: Vivacity staff full CRUD
CREATE POLICY "doc-templates: staff select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'doc-templates' AND public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "doc-templates: staff insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'doc-templates' AND public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "doc-templates: staff update"
  ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'doc-templates' AND public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (bucket_id = 'doc-templates' AND public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "doc-templates: staff delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'doc-templates' AND public.is_vivacity_team_safe(auth.uid()));

-- generated-docs: owner OR staff SELECT only; service role handles writes
CREATE POLICY "generated-docs: owner or staff select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'generated-docs'
    AND (
      (
        (storage.foldername(name))[1] = 'pdp'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      OR public.is_vivacity_team_safe(auth.uid())
    )
  );

-- Rollback (manual, if ever needed):
-- DROP POLICY IF EXISTS "doc-templates: staff select"   ON storage.objects;
-- DROP POLICY IF EXISTS "doc-templates: staff insert"   ON storage.objects;
-- DROP POLICY IF EXISTS "doc-templates: staff update"   ON storage.objects;
-- DROP POLICY IF EXISTS "doc-templates: staff delete"   ON storage.objects;
-- DROP POLICY IF EXISTS "generated-docs: owner or staff select" ON storage.objects;
-- DELETE FROM storage.objects WHERE bucket_id IN ('doc-templates','generated-docs');
-- DELETE FROM storage.buckets WHERE id IN ('doc-templates','generated-docs');