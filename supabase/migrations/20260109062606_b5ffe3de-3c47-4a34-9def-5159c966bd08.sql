-- Phase 1: Fix RLS policies - corrected for tga_links.rto_number

-- Fix tga_rto_snapshots policy using correct column name
DROP POLICY IF EXISTS "tga_rto_snapshots_select" ON public.tga_rto_snapshots;

CREATE POLICY "tga_rto_snapshots_select" ON public.tga_rto_snapshots
FOR SELECT USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.tga_links tl
    JOIN public.tenant_members tm ON tm.tenant_id = tl.tenant_id
    WHERE tl.rto_number = tga_rto_snapshots.rto_id
    AND tm.user_id = auth.uid()
  )
);

CREATE POLICY "tga_rto_snapshots_insert" ON public.tga_rto_snapshots
FOR INSERT WITH CHECK (public.is_super_admin());