-- ============================================================================
-- Phase 4A: RLS Policy Standardization - Core Tables with tenant_id
-- ============================================================================

-- ============================================================================
-- CLIENTS_LEGACY (has tenant_id)
-- ============================================================================
DROP POLICY IF EXISTS "clients_legacy_select" ON public.clients_legacy;
DROP POLICY IF EXISTS "clients_legacy_insert" ON public.clients_legacy;
DROP POLICY IF EXISTS "clients_legacy_update" ON public.clients_legacy;
DROP POLICY IF EXISTS "clients_legacy_delete" ON public.clients_legacy;
DROP POLICY IF EXISTS "clients_legacy_manage" ON public.clients_legacy;
DROP POLICY IF EXISTS "SuperAdmins can manage clients" ON public.clients_legacy;
DROP POLICY IF EXISTS "Users can view their tenant clients" ON public.clients_legacy;

CREATE POLICY "clients_legacy_select" ON public.clients_legacy
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "clients_legacy_manage" ON public.clients_legacy
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
-- DOCUMENTS (has tenant_id)
-- ============================================================================
DROP POLICY IF EXISTS "documents_select" ON public.documents;
DROP POLICY IF EXISTS "documents_insert" ON public.documents;
DROP POLICY IF EXISTS "documents_update" ON public.documents;
DROP POLICY IF EXISTS "documents_delete" ON public.documents;
DROP POLICY IF EXISTS "documents_manage" ON public.documents;
DROP POLICY IF EXISTS "SuperAdmins can manage documents" ON public.documents;
DROP POLICY IF EXISTS "Users can view tenant documents" ON public.documents;

CREATE POLICY "documents_select" ON public.documents
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "documents_manage" ON public.documents
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
-- NOTES (has tenant_id)
-- ============================================================================
DROP POLICY IF EXISTS "notes_select" ON public.notes;
DROP POLICY IF EXISTS "notes_insert" ON public.notes;
DROP POLICY IF EXISTS "notes_update" ON public.notes;
DROP POLICY IF EXISTS "notes_delete" ON public.notes;
DROP POLICY IF EXISTS "notes_manage" ON public.notes;
DROP POLICY IF EXISTS "Users can view tenant notes" ON public.notes;
DROP POLICY IF EXISTS "Users can create notes" ON public.notes;

CREATE POLICY "notes_select" ON public.notes
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "notes_manage" ON public.notes
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
-- TIME_ENTRIES (has tenant_id and user_id)
-- ============================================================================
DROP POLICY IF EXISTS "time_entries_select" ON public.time_entries;
DROP POLICY IF EXISTS "time_entries_insert" ON public.time_entries;
DROP POLICY IF EXISTS "time_entries_update" ON public.time_entries;
DROP POLICY IF EXISTS "time_entries_delete" ON public.time_entries;

CREATE POLICY "time_entries_select" ON public.time_entries
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR user_id = auth.uid()
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "time_entries_insert" ON public.time_entries
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "time_entries_update" ON public.time_entries
FOR UPDATE TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR user_id = auth.uid()
);

CREATE POLICY "time_entries_delete" ON public.time_entries
FOR DELETE TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR user_id = auth.uid()
);

-- ============================================================================
-- ACTIVE_TIMERS (has tenant_id and user_id)
-- ============================================================================
DROP POLICY IF EXISTS "active_timers_select" ON public.active_timers;
DROP POLICY IF EXISTS "active_timers_insert" ON public.active_timers;
DROP POLICY IF EXISTS "active_timers_update" ON public.active_timers;
DROP POLICY IF EXISTS "active_timers_delete" ON public.active_timers;
DROP POLICY IF EXISTS "active_timers_manage" ON public.active_timers;

CREATE POLICY "active_timers_select" ON public.active_timers
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR user_id = auth.uid()
);

CREATE POLICY "active_timers_manage" ON public.active_timers
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- DOCUMENT_LINKS (has tenant_id)
-- ============================================================================
DROP POLICY IF EXISTS "document_links_select" ON public.document_links;
DROP POLICY IF EXISTS "document_links_insert" ON public.document_links;
DROP POLICY IF EXISTS "document_links_update" ON public.document_links;
DROP POLICY IF EXISTS "document_links_delete" ON public.document_links;
DROP POLICY IF EXISTS "document_links_manage" ON public.document_links;

CREATE POLICY "document_links_select" ON public.document_links
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "document_links_manage" ON public.document_links
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
-- AI_SUGGESTIONS (has tenant_id)
-- ============================================================================
DROP POLICY IF EXISTS "ai_suggestions_select" ON public.ai_suggestions;
DROP POLICY IF EXISTS "ai_suggestions_insert" ON public.ai_suggestions;
DROP POLICY IF EXISTS "ai_suggestions_update" ON public.ai_suggestions;
DROP POLICY IF EXISTS "ai_suggestions_delete" ON public.ai_suggestions;
DROP POLICY IF EXISTS "ai_suggestions_manage" ON public.ai_suggestions;

CREATE POLICY "ai_suggestions_select" ON public.ai_suggestions
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id, auth.uid())
);

CREATE POLICY "ai_suggestions_manage" ON public.ai_suggestions
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