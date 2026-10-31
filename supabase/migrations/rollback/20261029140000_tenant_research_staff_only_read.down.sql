-- Rollback for 20261029140000_tenant_research_staff_only_read.sql.
-- Restores the previous SELECT policies (tenant members could read their tenant's research).

DROP POLICY IF EXISTS research_jobs_select ON public.research_jobs;
CREATE POLICY research_jobs_select
  ON public.research_jobs FOR SELECT
  TO authenticated
  USING (
    (tenant_id IS NOT NULL AND public.has_tenant_access_safe(tenant_id, (SELECT auth.uid())))
    OR public.is_vivacity_team_safe((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS research_findings_select ON public.research_findings;
CREATE POLICY research_findings_select
  ON public.research_findings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.research_jobs j
      WHERE j.id = research_findings.job_id
        AND (
          public.is_vivacity_team_safe((SELECT auth.uid()))
          OR public.has_tenant_access_safe(j.tenant_id, (SELECT auth.uid()))
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.regulator_change_events rce
      JOIN public.tenant_users tu ON tu.user_id = (SELECT auth.uid())
      WHERE rce.research_job_id = research_findings.job_id
    )
  );

DROP POLICY IF EXISTS read_research_sources_via_job ON public.research_sources;
CREATE POLICY read_research_sources_via_job
  ON public.research_sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.research_jobs j
      WHERE j.id = research_sources.job_id
        AND (
          public.is_vivacity_team_safe((SELECT auth.uid()))
          OR public.has_tenant_access_safe(j.tenant_id, (SELECT auth.uid()))
        )
    )
  );

NOTIFY pgrst, 'reload schema';
