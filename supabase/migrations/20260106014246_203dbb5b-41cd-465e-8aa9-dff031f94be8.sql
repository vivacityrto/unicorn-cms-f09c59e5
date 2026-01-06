-- =====================================================
-- RBAC Backend Policies for General User vs SuperAdmin
-- =====================================================

-- Helper function to check if user is SuperAdmin
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_uuid = p_user_id
      AND global_role = 'SuperAdmin'
  )
$$;

-- =====================================================
-- V/TO (eos_vto) RLS Policies
-- All authenticated users can read V/TO
-- Only SuperAdmin can create/update/delete V/TO
-- =====================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "VTO read access for authenticated users" ON public.eos_vto;
DROP POLICY IF EXISTS "VTO write access for SuperAdmin only" ON public.eos_vto;

-- Enable RLS
ALTER TABLE public.eos_vto ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated users can read V/TO for their tenant
CREATE POLICY "VTO read access for authenticated users"
  ON public.eos_vto
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: Only SuperAdmin can modify V/TO
CREATE POLICY "VTO write access for SuperAdmin only"
  ON public.eos_vto
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- =====================================================
-- EOS Meetings (eos_meetings) RLS Policies
-- All authenticated users can read meetings
-- Only SuperAdmin can create/update/delete meetings
-- =====================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Meetings read access for authenticated users" ON public.eos_meetings;
DROP POLICY IF EXISTS "Meetings write access for SuperAdmin only" ON public.eos_meetings;

-- Enable RLS (should already be enabled)
ALTER TABLE public.eos_meetings ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated users can read meetings for their tenant
CREATE POLICY "Meetings read access for authenticated users"
  ON public.eos_meetings
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: Only SuperAdmin can manage meetings
CREATE POLICY "Meetings write access for SuperAdmin only"
  ON public.eos_meetings
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- =====================================================
-- Quarterly Conversations (eos_qc) RLS Policies
-- SuperAdmin can view/manage all QCs
-- General User can only view QCs where they are reviewee or manager
-- Only SuperAdmin can create/update/delete QCs
-- =====================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "QC read access for SuperAdmin" ON public.eos_qc;
DROP POLICY IF EXISTS "QC read access for participants" ON public.eos_qc;
DROP POLICY IF EXISTS "QC write access for SuperAdmin only" ON public.eos_qc;

-- Enable RLS
ALTER TABLE public.eos_qc ENABLE ROW LEVEL SECURITY;

-- SELECT: SuperAdmin can read all QCs in their tenant
CREATE POLICY "QC read access for SuperAdmin"
  ON public.eos_qc
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    AND tenant_id IN (
      SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()
    )
  );

-- SELECT: General users can only read QCs where they are participant
CREATE POLICY "QC read access for participants"
  ON public.eos_qc
  FOR SELECT
  TO authenticated
  USING (
    NOT public.is_super_admin(auth.uid())
    AND tenant_id IN (
      SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()
    )
    AND (
      reviewee_id = auth.uid()
      OR auth.uid() = ANY(manager_ids)
    )
  );

-- INSERT/UPDATE/DELETE: Only SuperAdmin can manage QCs
CREATE POLICY "QC write access for SuperAdmin only"
  ON public.eos_qc
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- =====================================================
-- QC related tables (eos_qc_answers, eos_qc_fit, etc.)
-- Follow same pattern - SuperAdmin or participant access
-- =====================================================

-- eos_qc_answers
DROP POLICY IF EXISTS "QC answers read for participants" ON public.eos_qc_answers;
DROP POLICY IF EXISTS "QC answers write for SuperAdmin" ON public.eos_qc_answers;

ALTER TABLE public.eos_qc_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "QC answers read for participants"
  ON public.eos_qc_answers
  FOR SELECT
  TO authenticated
  USING (
    qc_id IN (
      SELECT id FROM public.eos_qc
      WHERE (public.is_super_admin(auth.uid()) OR reviewee_id = auth.uid() OR auth.uid() = ANY(manager_ids))
    )
  );

CREATE POLICY "QC answers write for SuperAdmin"
  ON public.eos_qc_answers
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- eos_qc_fit
DROP POLICY IF EXISTS "QC fit read for participants" ON public.eos_qc_fit;
DROP POLICY IF EXISTS "QC fit write for SuperAdmin" ON public.eos_qc_fit;

ALTER TABLE public.eos_qc_fit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "QC fit read for participants"
  ON public.eos_qc_fit
  FOR SELECT
  TO authenticated
  USING (
    qc_id IN (
      SELECT id FROM public.eos_qc
      WHERE (public.is_super_admin(auth.uid()) OR reviewee_id = auth.uid() OR auth.uid() = ANY(manager_ids))
    )
  );

CREATE POLICY "QC fit write for SuperAdmin"
  ON public.eos_qc_fit
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- eos_qc_signoffs
DROP POLICY IF EXISTS "QC signoffs read for participants" ON public.eos_qc_signoffs;
DROP POLICY IF EXISTS "QC signoffs write for SuperAdmin" ON public.eos_qc_signoffs;

ALTER TABLE public.eos_qc_signoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "QC signoffs read for participants"
  ON public.eos_qc_signoffs
  FOR SELECT
  TO authenticated
  USING (
    qc_id IN (
      SELECT id FROM public.eos_qc
      WHERE (public.is_super_admin(auth.uid()) OR reviewee_id = auth.uid() OR auth.uid() = ANY(manager_ids))
    )
  );

CREATE POLICY "QC signoffs write for SuperAdmin"
  ON public.eos_qc_signoffs
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- eos_qc_links
DROP POLICY IF EXISTS "QC links read for participants" ON public.eos_qc_links;
DROP POLICY IF EXISTS "QC links write for SuperAdmin" ON public.eos_qc_links;

ALTER TABLE public.eos_qc_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "QC links read for participants"
  ON public.eos_qc_links
  FOR SELECT
  TO authenticated
  USING (
    qc_id IN (
      SELECT id FROM public.eos_qc
      WHERE (public.is_super_admin(auth.uid()) OR reviewee_id = auth.uid() OR auth.uid() = ANY(manager_ids))
    )
  );

CREATE POLICY "QC links write for SuperAdmin"
  ON public.eos_qc_links
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));