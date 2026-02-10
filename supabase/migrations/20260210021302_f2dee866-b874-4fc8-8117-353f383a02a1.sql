
-- Fix TGA RLS policies: use correct helper functions

-- 1. tenant_rto_scope
DROP POLICY IF EXISTS "tenant_rto_scope_access" ON public.tenant_rto_scope;
CREATE POLICY "tga_scope_vivacity_all" ON public.tenant_rto_scope FOR ALL TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));
CREATE POLICY "tga_scope_tenant_read" ON public.tenant_rto_scope FOR SELECT TO authenticated
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

-- 2. tga_rest_sync_jobs
DROP POLICY IF EXISTS "tga_rest_sync_jobs_access" ON public.tga_rest_sync_jobs;
CREATE POLICY "tga_sync_vivacity_all" ON public.tga_rest_sync_jobs FOR ALL TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));
CREATE POLICY "tga_sync_tenant_read" ON public.tga_rest_sync_jobs FOR SELECT TO authenticated
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

-- 3. tga_rto_snapshots
DROP POLICY IF EXISTS "tga_rto_snapshots_superadmin" ON public.tga_rto_snapshots;
DROP POLICY IF EXISTS "tga_rto_snapshots_select" ON public.tga_rto_snapshots;
DROP POLICY IF EXISTS "tga_rto_snapshots_insert" ON public.tga_rto_snapshots;
CREATE POLICY "tga_snapshots_vivacity_all" ON public.tga_rto_snapshots FOR ALL TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));
CREATE POLICY "tga_snapshots_tenant_read" ON public.tga_rto_snapshots FOR SELECT TO authenticated
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

-- 4. tga_rto_summary
DROP POLICY IF EXISTS "Users can view own tenant TGA summary" ON public.tga_rto_summary;
CREATE POLICY "tga_summary_vivacity_all" ON public.tga_rto_summary FOR ALL TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));
CREATE POLICY "tga_summary_tenant_read" ON public.tga_rto_summary FOR SELECT TO authenticated
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

-- 5. tga_rto_contacts
DROP POLICY IF EXISTS "Users can view own tenant TGA contacts" ON public.tga_rto_contacts;
CREATE POLICY "tga_contacts_vivacity_all" ON public.tga_rto_contacts FOR ALL TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));
CREATE POLICY "tga_contacts_tenant_read" ON public.tga_rto_contacts FOR SELECT TO authenticated
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

-- 6. tga_rto_addresses
DROP POLICY IF EXISTS "Users can view own tenant TGA addresses" ON public.tga_rto_addresses;
CREATE POLICY "tga_addresses_vivacity_all" ON public.tga_rto_addresses FOR ALL TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));
CREATE POLICY "tga_addresses_tenant_read" ON public.tga_rto_addresses FOR SELECT TO authenticated
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

-- 7. tga_rto_delivery_locations
DROP POLICY IF EXISTS "Users can view own tenant TGA delivery locations" ON public.tga_rto_delivery_locations;
CREATE POLICY "tga_delivery_vivacity_all" ON public.tga_rto_delivery_locations FOR ALL TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));
CREATE POLICY "tga_delivery_tenant_read" ON public.tga_rto_delivery_locations FOR SELECT TO authenticated
  USING (has_tenant_access_safe(tenant_id, auth.uid()));
