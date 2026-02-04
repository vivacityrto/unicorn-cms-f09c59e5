-- =====================================================
-- Enable RLS on all public tables without it
-- =====================================================

-- 1. BACKUP TABLES - These should be admin-only access
-- They contain historical/backup data and shouldn't be accessed by regular users

ALTER TABLE public.backup_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SuperAdmins only" ON public.backup_notes FOR ALL USING (is_super_admin());

ALTER TABLE public.backup_package_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SuperAdmins only" ON public.backup_package_instances FOR ALL USING (is_super_admin());

ALTER TABLE public.backup_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SuperAdmins only" ON public.backup_packages FOR ALL USING (is_super_admin());

ALTER TABLE public.backup_packages_phase3 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SuperAdmins only" ON public.backup_packages_phase3 FOR ALL USING (is_super_admin());

ALTER TABLE public.backup_tenant_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SuperAdmins only" ON public.backup_tenant_addresses FOR ALL USING (is_super_admin());

ALTER TABLE public.backup_tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SuperAdmins only" ON public.backup_tenants FOR ALL USING (is_super_admin());

ALTER TABLE public.backup_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SuperAdmins only" ON public.backup_users FOR ALL USING (is_super_admin());

-- 2. CLICKUP INTEGRATION TABLES - Staff/SuperAdmin access for integration management

ALTER TABLE public.clickup_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view clickup tasks" ON public.clickup_tasks FOR SELECT USING (is_staff() OR is_super_admin());
CREATE POLICY "Staff can manage clickup tasks" ON public.clickup_tasks FOR ALL USING (is_staff() OR is_super_admin());

ALTER TABLE public.clickup_tasks_260129 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view" ON public.clickup_tasks_260129 FOR SELECT USING (is_staff() OR is_super_admin());
CREATE POLICY "Staff can manage" ON public.clickup_tasks_260129 FOR ALL USING (is_staff() OR is_super_admin());

-- 3. STAGES TABLE - Reference data that can be read by authenticated users
-- This appears to be a reference table for document/workflow stages

ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view stages" ON public.stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can manage stages" ON public.stages FOR ALL USING (is_staff() OR is_super_admin());

-- 4. TASKS TABLE - ClickUp task data, staff access

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view tasks" ON public.tasks FOR SELECT USING (is_staff() OR is_super_admin());
CREATE POLICY "Staff can manage tasks" ON public.tasks FOR ALL USING (is_staff() OR is_super_admin());

-- 5. TEAM LEADER ASSIGNMENTS - Staff management table

ALTER TABLE public.team_leader_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view team assignments" ON public.team_leader_assignments FOR SELECT USING (is_staff() OR is_super_admin());
CREATE POLICY "SuperAdmins can manage team assignments" ON public.team_leader_assignments FOR ALL USING (is_super_admin());

-- 6. TGA DEBUG PAYLOADS - Debug/admin table

ALTER TABLE public.tga_debug_payloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SuperAdmins only" ON public.tga_debug_payloads FOR ALL USING (is_super_admin());

-- 7. TGA STATE CODES - Reference data (Australian state codes)

ALTER TABLE public.tga_state_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view state codes" ON public.tga_state_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "SuperAdmins can manage state codes" ON public.tga_state_codes FOR ALL USING (is_super_admin());