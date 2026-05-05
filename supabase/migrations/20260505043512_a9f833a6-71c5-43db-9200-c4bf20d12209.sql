-- ============================================================================
-- M4: suggest attachment visibility — gate on parent suggest_items.is_client_visible
--
-- Path convention (verified): {tenant_id}/{suggest_item_id}/{filename}
--   storage.foldername(name)[1] = tenant_id (text)
--   storage.foldername(name)[2] = suggest_item_id (text uuid)
--
-- Changes:
--   1. Recreate public.suggest_attachments_select — non-staff additionally
--      require EXISTS join to parent suggest_items where is_client_visible=true,
--      NOT is_deleted, AND has_tenant_access_safe(tenant_id, auth.uid()).
--      Staff bypass via is_super_admin_safe / is_vivacity_team_safe unchanged.
--   2. Recreate storage.objects SELECT policy on bucket_id='suggest-attachments'
--      with the same logic, joining via foldername[2]::uuid = suggest_items.id.
--
-- Out of scope (deliberately untouched): INSERT/DELETE on suggest_attachments,
-- and INSERT/DELETE storage policies on the bucket. A pre-existing bug in those
-- storage policies (comparing auth.uid() to foldername[2] == suggest_item_id)
-- is documented for a follow-up migration.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK (run as a single transaction):
--
-- BEGIN;
-- DROP POLICY IF EXISTS suggest_attachments_select ON public.suggest_attachments;
-- CREATE POLICY suggest_attachments_select ON public.suggest_attachments
--   FOR SELECT
--   USING (
--     is_super_admin_safe(auth.uid())
--     OR is_vivacity_team_safe(auth.uid())
--     OR has_tenant_access_safe((tenant_id)::bigint, auth.uid())
--   );
--
-- DROP POLICY IF EXISTS suggest_attach_select ON storage.objects;
-- CREATE POLICY suggest_attach_select ON storage.objects
--   FOR SELECT
--   USING (
--     bucket_id = 'suggest-attachments'
--     AND auth.uid()::text = (storage.foldername(name))[2]
--   );
-- COMMIT;
--
-- ----------------------------------------------------------------------------
-- VERIFICATION (manual, post-apply):
--   a. Staff JWT, hidden item attachment row → SELECT returns the row.
--   b. Client JWT (same tenant), hidden item attachment row → SELECT returns 0 rows.
--   c. Client JWT (same tenant), visible item attachment row → SELECT returns the row.
--   d. Storage object equivalents of (a)–(c) via supabase.storage list/download.
-- ============================================================================

-- 1. public.suggest_attachments SELECT policy --------------------------------
DROP POLICY IF EXISTS suggest_attachments_select ON public.suggest_attachments;

CREATE POLICY suggest_attachments_select ON public.suggest_attachments
  FOR SELECT
  USING (
    is_super_admin_safe(auth.uid())
    OR is_vivacity_team_safe(auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.suggest_items si
       WHERE si.id = suggest_attachments.suggest_item_id
         AND si.is_deleted = false
         AND si.is_client_visible = true
         AND has_tenant_access_safe((si.tenant_id)::bigint, auth.uid())
    )
  );

-- 2. storage.objects SELECT policy on the suggest-attachments bucket ---------
DROP POLICY IF EXISTS suggest_attach_select ON storage.objects;

CREATE POLICY suggest_attach_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'suggest-attachments'
    AND (
      is_super_admin_safe(auth.uid())
      OR is_vivacity_team_safe(auth.uid())
      OR EXISTS (
        SELECT 1
          FROM public.suggest_items si
         WHERE si.id = ((storage.foldername(name))[2])::uuid
           AND si.is_deleted = false
           AND si.is_client_visible = true
           AND has_tenant_access_safe((si.tenant_id)::bigint, auth.uid())
      )
    )
  );