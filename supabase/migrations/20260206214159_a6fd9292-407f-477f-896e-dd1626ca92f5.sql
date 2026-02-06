-- ============================================================================
-- Phase 4B: RLS Policy Standardization - Accountability & Reference Tables
-- ============================================================================

-- ============================================================================
-- ACCOUNTABILITY_CHARTS (has tenant_id)
-- ============================================================================
DROP POLICY IF EXISTS "accountability_charts_select" ON public.accountability_charts;
DROP POLICY IF EXISTS "accountability_charts_insert" ON public.accountability_charts;
DROP POLICY IF EXISTS "accountability_charts_update" ON public.accountability_charts;
DROP POLICY IF EXISTS "accountability_charts_delete" ON public.accountability_charts;
DROP POLICY IF EXISTS "accountability_charts_manage" ON public.accountability_charts;

CREATE POLICY "accountability_charts_select" ON public.accountability_charts
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "accountability_charts_manage" ON public.accountability_charts
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- ============================================================================
-- ACCOUNTABILITY_CHART_VERSIONS (has tenant_id)
-- ============================================================================
DROP POLICY IF EXISTS "accountability_chart_versions_select" ON public.accountability_chart_versions;
DROP POLICY IF EXISTS "accountability_chart_versions_insert" ON public.accountability_chart_versions;
DROP POLICY IF EXISTS "accountability_chart_versions_manage" ON public.accountability_chart_versions;

CREATE POLICY "accountability_chart_versions_select" ON public.accountability_chart_versions
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "accountability_chart_versions_manage" ON public.accountability_chart_versions
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- ============================================================================
-- ACCOUNTABILITY_FUNCTIONS (has tenant_id)
-- ============================================================================
DROP POLICY IF EXISTS "accountability_functions_select" ON public.accountability_functions;
DROP POLICY IF EXISTS "accountability_functions_insert" ON public.accountability_functions;
DROP POLICY IF EXISTS "accountability_functions_update" ON public.accountability_functions;
DROP POLICY IF EXISTS "accountability_functions_delete" ON public.accountability_functions;
DROP POLICY IF EXISTS "accountability_functions_manage" ON public.accountability_functions;

CREATE POLICY "accountability_functions_select" ON public.accountability_functions
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "accountability_functions_manage" ON public.accountability_functions
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- ============================================================================
-- ACCOUNTABILITY_SEATS (has tenant_id)
-- ============================================================================
DROP POLICY IF EXISTS "accountability_seats_select" ON public.accountability_seats;
DROP POLICY IF EXISTS "accountability_seats_insert" ON public.accountability_seats;
DROP POLICY IF EXISTS "accountability_seats_update" ON public.accountability_seats;
DROP POLICY IF EXISTS "accountability_seats_delete" ON public.accountability_seats;
DROP POLICY IF EXISTS "accountability_seats_manage" ON public.accountability_seats;

CREATE POLICY "accountability_seats_select" ON public.accountability_seats
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "accountability_seats_manage" ON public.accountability_seats
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- ============================================================================
-- ACCOUNTABILITY_SEAT_ASSIGNMENTS (has tenant_id)
-- ============================================================================
DROP POLICY IF EXISTS "accountability_seat_assignments_select" ON public.accountability_seat_assignments;
DROP POLICY IF EXISTS "accountability_seat_assignments_insert" ON public.accountability_seat_assignments;
DROP POLICY IF EXISTS "accountability_seat_assignments_update" ON public.accountability_seat_assignments;
DROP POLICY IF EXISTS "accountability_seat_assignments_delete" ON public.accountability_seat_assignments;
DROP POLICY IF EXISTS "accountability_seat_assignments_manage" ON public.accountability_seat_assignments;

CREATE POLICY "accountability_seat_assignments_select" ON public.accountability_seat_assignments
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "accountability_seat_assignments_manage" ON public.accountability_seat_assignments
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- ============================================================================
-- ACCOUNTABILITY_SEAT_ROLES (has tenant_id)
-- ============================================================================
DROP POLICY IF EXISTS "accountability_seat_roles_select" ON public.accountability_seat_roles;
DROP POLICY IF EXISTS "accountability_seat_roles_insert" ON public.accountability_seat_roles;
DROP POLICY IF EXISTS "accountability_seat_roles_update" ON public.accountability_seat_roles;
DROP POLICY IF EXISTS "accountability_seat_roles_delete" ON public.accountability_seat_roles;
DROP POLICY IF EXISTS "accountability_seat_roles_manage" ON public.accountability_seat_roles;

CREATE POLICY "accountability_seat_roles_select" ON public.accountability_seat_roles
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "accountability_seat_roles_manage" ON public.accountability_seat_roles
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- ============================================================================
-- SEAT_REBALANCING_RECOMMENDATIONS (has tenant_id)
-- ============================================================================
DROP POLICY IF EXISTS "seat_rebalancing_recommendations_select" ON public.seat_rebalancing_recommendations;
DROP POLICY IF EXISTS "seat_rebalancing_recommendations_insert" ON public.seat_rebalancing_recommendations;
DROP POLICY IF EXISTS "seat_rebalancing_recommendations_update" ON public.seat_rebalancing_recommendations;
DROP POLICY IF EXISTS "seat_rebalancing_recommendations_manage" ON public.seat_rebalancing_recommendations;

CREATE POLICY "seat_rebalancing_recommendations_select" ON public.seat_rebalancing_recommendations
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "seat_rebalancing_recommendations_manage" ON public.seat_rebalancing_recommendations
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

-- ============================================================================
-- PEOPLE_ANALYZER_ENTRIES (has tenant_id)
-- ============================================================================
DROP POLICY IF EXISTS "people_analyzer_entries_select" ON public.people_analyzer_entries;
DROP POLICY IF EXISTS "people_analyzer_entries_insert" ON public.people_analyzer_entries;
DROP POLICY IF EXISTS "people_analyzer_entries_update" ON public.people_analyzer_entries;
DROP POLICY IF EXISTS "people_analyzer_entries_delete" ON public.people_analyzer_entries;
DROP POLICY IF EXISTS "people_analyzer_entries_manage" ON public.people_analyzer_entries;

CREATE POLICY "people_analyzer_entries_select" ON public.people_analyzer_entries
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "people_analyzer_entries_manage" ON public.people_analyzer_entries
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- ============================================================================
-- DOCUMENTS_STAGES (NO tenant_id - reference table)
-- ============================================================================
DROP POLICY IF EXISTS "documents_stages_select" ON public.documents_stages;
DROP POLICY IF EXISTS "documents_stages_insert" ON public.documents_stages;
DROP POLICY IF EXISTS "documents_stages_update" ON public.documents_stages;
DROP POLICY IF EXISTS "documents_stages_delete" ON public.documents_stages;
DROP POLICY IF EXISTS "documents_stages_manage" ON public.documents_stages;

CREATE POLICY "documents_stages_select" ON public.documents_stages
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "documents_stages_manage" ON public.documents_stages
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

-- ============================================================================
-- DOCUMENT_VERSIONS (NO tenant_id - linked via document_id)
-- ============================================================================
DROP POLICY IF EXISTS "document_versions_select" ON public.document_versions;
DROP POLICY IF EXISTS "document_versions_insert" ON public.document_versions;
DROP POLICY IF EXISTS "document_versions_update" ON public.document_versions;
DROP POLICY IF EXISTS "document_versions_manage" ON public.document_versions;

CREATE POLICY "document_versions_select" ON public.document_versions
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_versions.document_id
    AND public.has_tenant_access_safe(d.tenant_id, auth.uid())
  )
);

CREATE POLICY "document_versions_manage" ON public.document_versions
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_versions.document_id
    AND public.has_tenant_access_safe(d.tenant_id, auth.uid())
  )
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_versions.document_id
    AND public.has_tenant_access_safe(d.tenant_id, auth.uid())
  )
);

-- ============================================================================
-- PACKAGES (NO tenant_id - global reference/template table)
-- ============================================================================
DROP POLICY IF EXISTS "packages_select" ON public.packages;
DROP POLICY IF EXISTS "packages_insert" ON public.packages;
DROP POLICY IF EXISTS "packages_update" ON public.packages;
DROP POLICY IF EXISTS "packages_delete" ON public.packages;
DROP POLICY IF EXISTS "packages_manage" ON public.packages;
DROP POLICY IF EXISTS "SuperAdmins can manage packages" ON public.packages;
DROP POLICY IF EXISTS "Users can view tenant packages" ON public.packages;

CREATE POLICY "packages_select" ON public.packages
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "packages_manage" ON public.packages
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

-- ============================================================================
-- TRAINING_PRODUCTS (NO tenant_id - global reference table)
-- ============================================================================
DROP POLICY IF EXISTS "training_products_select" ON public.training_products;
DROP POLICY IF EXISTS "training_products_insert" ON public.training_products;
DROP POLICY IF EXISTS "training_products_update" ON public.training_products;
DROP POLICY IF EXISTS "training_products_delete" ON public.training_products;
DROP POLICY IF EXISTS "training_products_manage" ON public.training_products;

CREATE POLICY "training_products_select" ON public.training_products
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "training_products_manage" ON public.training_products
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);