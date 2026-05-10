DROP POLICY IF EXISTS read_research_findings_via_job ON public.research_findings;

CREATE POLICY read_research_findings_via_job
ON public.research_findings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.research_jobs j
    WHERE j.id = research_findings.job_id
      AND (
        public.is_vivacity_team_safe(auth.uid())
        OR public.has_tenant_access_safe(j.tenant_id, auth.uid())
      )
  )
);