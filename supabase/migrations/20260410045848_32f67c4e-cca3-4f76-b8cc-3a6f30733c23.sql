
-- 1. Fix client_tga_snapshot: replace USING(true) with tenant-scoped policy
DROP POLICY IF EXISTS "client_tga_snapshot_select_authenticated" ON public.client_tga_snapshot;

CREATE POLICY "client_tga_snapshot_select_scoped" ON public.client_tga_snapshot
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_safe(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tga_links tl
      WHERE tl.client_id = client_tga_snapshot.client_id
        AND public.has_tenant_access_safe(tl.tenant_id, auth.uid())
    )
  );

-- 2. Fix eos_meeting_ratings: add tenant/participant check
DROP POLICY IF EXISTS "eos_meeting_ratings_users_select" ON public.eos_meeting_ratings;

CREATE POLICY "eos_meeting_ratings_select_scoped" ON public.eos_meeting_ratings
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_safe(auth.uid())
    OR public.has_tenant_access_safe(tenant_id, auth.uid())
  );

-- 3. Fix tga_links: replace public USING(true) with tenant-scoped
DROP POLICY IF EXISTS "tga_links_select" ON public.tga_links;

CREATE POLICY "tga_links_select_scoped" ON public.tga_links
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_safe(auth.uid())
    OR public.has_tenant_access_safe(tenant_id, auth.uid())
  );
