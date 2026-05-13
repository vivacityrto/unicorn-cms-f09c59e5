BEGIN;

-- eos_qc: 3 SELECT → 1
DROP POLICY IF EXISTS "eos_qc_select"         ON public.eos_qc;
DROP POLICY IF EXISTS "qc_select_tenant"      ON public.eos_qc;
DROP POLICY IF EXISTS "qc_select_vivacity"    ON public.eos_qc;
CREATE POLICY "eos_qc_select"
  ON public.eos_qc FOR SELECT
  USING (
    is_qc_admin_safe((SELECT auth.uid()))
    OR (reviewee_id = (SELECT auth.uid()))
    OR ((SELECT auth.uid()) = ANY(manager_ids))
    OR (
      scope = 'tenant'
      AND tenant_id IS NOT NULL
      AND (
        is_eos_admin((SELECT auth.uid()), tenant_id)
        OR is_super_admin()
      )
    )
  );

-- eos_vto: 4 SELECT → 1
DROP POLICY IF EXISTS "eos_vto_authenticated_select" ON public.eos_vto;
DROP POLICY IF EXISTS "eos_vto_select"               ON public.eos_vto;
DROP POLICY IF EXISTS "eos_vto_users_select"         ON public.eos_vto;
DROP POLICY IF EXISTS "eos_vto_vivacity_select"      ON public.eos_vto;
CREATE POLICY "eos_vto_select"
  ON public.eos_vto FOR SELECT
  USING (
    is_vivacity_team_user((SELECT auth.uid()))
    OR has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR (tenant_id IN (
      SELECT users.tenant_id FROM public.users
      WHERE users.user_uuid = (SELECT auth.uid())
    ))
  );

-- eos_meeting_segments: 2 SELECT → 1
DROP POLICY IF EXISTS "eos_meeting_segments_users_select" ON public.eos_meeting_segments;
DROP POLICY IF EXISTS "meeting_segments_select"           ON public.eos_meeting_segments;
CREATE POLICY "eos_meeting_segments_select"
  ON public.eos_meeting_segments FOR SELECT
  USING (
    is_super_admin()
    OR is_meeting_participant((SELECT auth.uid()), meeting_id)
    OR EXISTS (
      SELECT 1 FROM public.eos_meetings m
      WHERE m.id = eos_meeting_segments.meeting_id
        AND has_any_eos_role((SELECT auth.uid()), m.tenant_id)
    )
  );

-- eos_meeting_summaries: 2 SELECT → 1
DROP POLICY IF EXISTS "client_viewers_select_summaries"         ON public.eos_meeting_summaries;
DROP POLICY IF EXISTS "eos_meeting_summaries_participant_select" ON public.eos_meeting_summaries;
CREATE POLICY "eos_meeting_summaries_select"
  ON public.eos_meeting_summaries FOR SELECT
  USING (
    is_super_admin()
    OR is_meeting_participant((SELECT auth.uid()), meeting_id)
    OR EXISTS (
      SELECT 1
      FROM public.users u
      JOIN public.eos_meetings m ON m.client_id = u.client_id
      WHERE u.user_uuid = (SELECT auth.uid())
        AND m.id = eos_meeting_summaries.meeting_id
        AND has_eos_role(
          (SELECT auth.uid()),
          eos_meeting_summaries.tenant_id,
          'client_viewer'::eos_role
        )
    )
  );

-- eos_issues: 4 SELECT → 2
DROP POLICY IF EXISTS "client_viewers_select_issues" ON public.eos_issues;
DROP POLICY IF EXISTS "eos_issues_select"            ON public.eos_issues;
DROP POLICY IF EXISTS "eos_issues_users_select"      ON public.eos_issues;
DROP POLICY IF EXISTS "eos_issues_vivacity_select"   ON public.eos_issues;
CREATE POLICY "eos_issues_select"
  ON public.eos_issues FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND (
      is_vivacity_team_user((SELECT auth.uid()))
      OR is_super_admin()
      OR has_any_eos_role((SELECT auth.uid()), tenant_id)
      OR (tenant_id = get_current_user_tenant())
    )
  );
CREATE POLICY "eos_issues_client_viewer_select"
  ON public.eos_issues FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = (SELECT auth.uid())
        AND u.client_id = eos_issues.client_id
        AND has_eos_role(
          (SELECT auth.uid()),
          eos_issues.tenant_id,
          'client_viewer'::eos_role
        )
    )
  );

-- eos_rocks: 4 SELECT → 2
DROP POLICY IF EXISTS "client_viewers_select_rocks" ON public.eos_rocks;
DROP POLICY IF EXISTS "eos_rocks_select"            ON public.eos_rocks;
DROP POLICY IF EXISTS "eos_rocks_users_select"      ON public.eos_rocks;
DROP POLICY IF EXISTS "eos_rocks_vivacity_select"   ON public.eos_rocks;
CREATE POLICY "eos_rocks_select"
  ON public.eos_rocks FOR SELECT
  USING (
    is_vivacity_team_user((SELECT auth.uid()))
    OR is_super_admin()
    OR has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR (tenant_id = get_current_user_tenant())
  );
CREATE POLICY "eos_rocks_client_viewer_select"
  ON public.eos_rocks FOR SELECT
  USING (
    has_tenant_access_safe((client_id)::bigint, (SELECT auth.uid()))
  );

-- eos_headlines: 3 SELECT → 2
DROP POLICY IF EXISTS "client_viewers_select_headlines" ON public.eos_headlines;
DROP POLICY IF EXISTS "eos_headlines_select"            ON public.eos_headlines;
DROP POLICY IF EXISTS "eos_headlines_vivacity_select"   ON public.eos_headlines;
CREATE POLICY "eos_headlines_select"
  ON public.eos_headlines FOR SELECT
  USING (
    is_vivacity_team_user((SELECT auth.uid()))
    OR is_super_admin()
    OR is_meeting_participant((SELECT auth.uid()), meeting_id)
  );
CREATE POLICY "eos_headlines_client_viewer_select"
  ON public.eos_headlines FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      JOIN public.eos_meetings m ON m.client_id = u.client_id
      WHERE u.user_uuid = (SELECT auth.uid())
        AND m.id = eos_headlines.meeting_id
        AND has_eos_role(
          (SELECT auth.uid()),
          m.tenant_id,
          'client_viewer'::eos_role
        )
    )
  );

COMMIT;