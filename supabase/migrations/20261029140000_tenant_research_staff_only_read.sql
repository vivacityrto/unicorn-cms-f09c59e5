-- Keep tenant-bound research output staff-only until there is a deliberate "released to the
-- client" step.
--
-- research_jobs, research_findings and research_sources were readable by any active member of
-- the job's tenant, with no review_status filter, so a draft AI/research brief written for a
-- tenant would have been visible to that tenant's own users as soon as it existed. No such rows
-- exist in production today (all research output is regulator-watch or Ask Viv, none
-- tenant-bound) and no client screen reads tenant-bound research, so this changes nothing
-- anyone can see now; it must be in place before research runs against a real tenant.
--
-- Provisional choice: staff-only. Revert path: the rollback restores the previous policies;
-- a later "release to client" mechanism can widen it deliberately.
--
-- Unchanged on purpose: the second branch of research_findings_select, which lets signed-in
-- tenant users read findings for a job linked to a regulator_change_event. That is how the
-- client Regulatory Updates page works today (those findings are currently all draft; whether
-- clients should see draft regulator findings is a separate product decision).
--
-- Staff means is_vivacity_team_safe() or is_super_admin_safe(), the same people
-- has_tenant_access_safe() already admitted ahead of tenant membership.
-- Rollback: rollback/20261029140000_tenant_research_staff_only_read.down.sql

-- research_jobs ----------------------------------------------------------------------------

DROP POLICY IF EXISTS research_jobs_select ON public.research_jobs;
CREATE POLICY research_jobs_select
  ON public.research_jobs FOR SELECT
  TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR public.is_super_admin_safe((SELECT auth.uid()))
  );

-- research_findings ------------------------------------------------------------------------

DROP POLICY IF EXISTS research_findings_select ON public.research_findings;
CREATE POLICY research_findings_select
  ON public.research_findings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.research_jobs j
      WHERE j.id = research_findings.job_id
        AND (
          public.is_vivacity_team_safe((SELECT auth.uid()))
          OR public.is_super_admin_safe((SELECT auth.uid()))
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.regulator_change_events rce
      JOIN public.tenant_users tu ON tu.user_id = (SELECT auth.uid())
      WHERE rce.research_job_id = research_findings.job_id
    )
  );

-- research_sources -------------------------------------------------------------------------

DROP POLICY IF EXISTS read_research_sources_via_job ON public.research_sources;
CREATE POLICY read_research_sources_via_job
  ON public.research_sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.research_jobs j
      WHERE j.id = research_sources.job_id
        AND (
          public.is_vivacity_team_safe((SELECT auth.uid()))
          OR public.is_super_admin_safe((SELECT auth.uid()))
        )
    )
  );

NOTIFY pgrst, 'reload schema';
