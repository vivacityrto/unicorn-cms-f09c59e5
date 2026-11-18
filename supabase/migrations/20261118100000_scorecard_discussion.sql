-- L10 Scorecard discussion deck and Client engagement report.
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- Adds (nothing existing is dropped; get_cst_report is replaced in place with the same signature):
--   public.eos_scorecard_discussion_notes       notes taken per scorecard area in a meeting (RLS, staff only)
--   public.eos_issues.linked_scorecard_metric_id an issue raised from the scorecard points at its metric
--   public.cst_last_activity()                  when each Live Client RTO last had client activity
--   public.get_cst_report(text, date)           same result plus last_active_at on each RTO
--
-- Definitions of "Live Client", "client user" and "client activity" are unchanged from
-- 20261117100000_cst_scorecard_activity_report.sql and docs/kb/reference/cst-scorecard-metric-dictionary-2026-11-17.md.

-- ---------------------------------------------------------------------------
-- 1. Notes taken in the L10 Scorecard discussion deck
--    One note per person, per scorecard area (the metric category), per meeting.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eos_scorecard_discussion_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  meeting_id uuid NOT NULL REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  category text NOT NULL,
  body text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eos_scorecard_discussion_notes_body_check CHECK (length(btrim(body)) > 0 AND length(body) <= 5000),
  CONSTRAINT eos_scorecard_discussion_notes_category_check CHECK (length(btrim(category)) > 0 AND length(category) <= 60),
  CONSTRAINT eos_scorecard_discussion_notes_one_per_person UNIQUE (meeting_id, category, created_by)
);

COMMENT ON TABLE public.eos_scorecard_discussion_notes IS
  'Notes taken per scorecard area during an L10 Scorecard discussion. One row per person, area and meeting. Vivacity staff only.';

CREATE INDEX IF NOT EXISTS eos_scorecard_discussion_notes_meeting_idx
  ON public.eos_scorecard_discussion_notes (meeting_id);

DROP TRIGGER IF EXISTS update_eos_scorecard_discussion_notes_updated_at ON public.eos_scorecard_discussion_notes;
CREATE TRIGGER update_eos_scorecard_discussion_notes_updated_at
  BEFORE UPDATE ON public.eos_scorecard_discussion_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.eos_scorecard_discussion_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eos_scorecard_discussion_notes_select ON public.eos_scorecard_discussion_notes;
CREATE POLICY eos_scorecard_discussion_notes_select ON public.eos_scorecard_discussion_notes
  FOR SELECT TO authenticated
  USING (public.is_vivacity_team_safe((SELECT auth.uid())));

-- A note belongs to the person writing it and to the tenant that owns the meeting.
DROP POLICY IF EXISTS eos_scorecard_discussion_notes_insert ON public.eos_scorecard_discussion_notes;
CREATE POLICY eos_scorecard_discussion_notes_insert ON public.eos_scorecard_discussion_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    AND created_by = (SELECT auth.uid())
    AND tenant_id = (SELECT m.tenant_id FROM public.eos_meetings m WHERE m.id = meeting_id)
  );

DROP POLICY IF EXISTS eos_scorecard_discussion_notes_update ON public.eos_scorecard_discussion_notes;
CREATE POLICY eos_scorecard_discussion_notes_update ON public.eos_scorecard_discussion_notes
  FOR UPDATE TO authenticated
  USING (public.is_vivacity_team_safe((SELECT auth.uid())) AND created_by = (SELECT auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe((SELECT auth.uid())) AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS eos_scorecard_discussion_notes_delete ON public.eos_scorecard_discussion_notes;
CREATE POLICY eos_scorecard_discussion_notes_delete ON public.eos_scorecard_discussion_notes
  FOR DELETE TO authenticated
  USING (public.is_vivacity_team_safe((SELECT auth.uid())) AND (created_by = (SELECT auth.uid()) OR public.is_super_admin()));

-- New public tables carry default grants to client roles; strip them and grant only what the policies use.
REVOKE ALL ON public.eos_scorecard_discussion_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eos_scorecard_discussion_notes TO authenticated;
GRANT ALL ON public.eos_scorecard_discussion_notes TO service_role;

-- ---------------------------------------------------------------------------
-- 2. An issue raised from the scorecard points at the metric it came from
--    (the same idea as linked_rock_id). eos_issues has table-level grants, so
--    the new column needs no separate grant.
-- ---------------------------------------------------------------------------
ALTER TABLE public.eos_issues
  ADD COLUMN IF NOT EXISTS linked_scorecard_metric_id uuid
  REFERENCES public.eos_scorecard_metrics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS eos_issues_linked_scorecard_metric_idx
  ON public.eos_issues (linked_scorecard_metric_id)
  WHERE linked_scorecard_metric_id IS NOT NULL;

COMMENT ON COLUMN public.eos_issues.linked_scorecard_metric_id IS
  'The scorecard metric this issue was raised about (from the L10 Scorecard discussion). Null for other issues.';

-- ---------------------------------------------------------------------------
-- 3. When each Live Client RTO last had client activity (all time)
--    Same people and same events as cst_activity_stats; internal, service_role only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cst_last_activity()
RETURNS TABLE (tenant_id bigint, last_active_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH live AS (
    SELECT t.id
    FROM public.tenants t
    WHERE t.status IN ('active', 'on_hold', 'In Arears', 'warning')
      AND t.archived_at IS NULL
      AND NOT (COALESCE(t.metadata, '{}'::jsonb) ? 'academy_solo')
  ),
  cu AS (
    SELECT tu.tenant_id, tu.user_id
    FROM public.tenant_users tu
    JOIN live ON live.id = tu.tenant_id
    JOIN public.users u ON u.user_uuid = tu.user_id
    WHERE COALESCE(u.is_vivacity_internal, false) = false
      AND COALESCE(u.archived, false) = false
  ),
  ev AS (
    SELECT v.tenant_id, v.user_id, v.created_at AS at
    FROM public.client_portal_page_views v
    UNION ALL
    SELECT e.tenant_id::bigint, e.created_by, e.occurred_at
    FROM public.client_timeline_events e
    WHERE e.created_by IS NOT NULL
      AND (
        e.event_type IN ('client_login', 'message_sent', 'message_read', 'academy_lesson_completed')
        OR (e.event_type = 'academy_enrolled' AND e.metadata ->> 'source' = 'self_enrol')
      )
  )
  SELECT ev.tenant_id, max(ev.at)
  FROM ev
  JOIN cu ON cu.tenant_id = ev.tenant_id AND cu.user_id = ev.user_id
  GROUP BY ev.tenant_id;
$function$;

REVOKE ALL ON FUNCTION public.cst_last_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cst_last_activity() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Report: same as before, with last_active_at on each RTO
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cst_report(p_period text, p_anchor date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tz constant text := 'Australia/Sydney';
  v_anchor date := COALESCE(p_anchor, (now() AT TIME ZONE v_tz)::date);
  v_start timestamptz;
  v_end timestamptz;
  v_pstart timestamptz;
  v_pend timestamptz;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_period = 'week' THEN
    v_start := (date_trunc('week', v_anchor::timestamp)) AT TIME ZONE v_tz;
    v_end := (date_trunc('week', v_anchor::timestamp) + interval '1 week') AT TIME ZONE v_tz;
    v_pstart := (date_trunc('week', v_anchor::timestamp) - interval '1 week') AT TIME ZONE v_tz;
    v_pend := v_start;
  ELSIF p_period = 'month' THEN
    v_start := (date_trunc('month', v_anchor::timestamp)) AT TIME ZONE v_tz;
    v_end := (date_trunc('month', v_anchor::timestamp) + interval '1 month') AT TIME ZONE v_tz;
    v_pstart := (date_trunc('month', v_anchor::timestamp) - interval '1 month') AT TIME ZONE v_tz;
    v_pend := v_start;
  ELSIF p_period = 'year' THEN
    v_start := (date_trunc('year', v_anchor::timestamp)) AT TIME ZONE v_tz;
    v_end := (date_trunc('year', v_anchor::timestamp) + interval '1 year') AT TIME ZONE v_tz;
    v_pstart := (date_trunc('year', v_anchor::timestamp) - interval '1 year') AT TIME ZONE v_tz;
    v_pend := v_start;
  ELSIF p_period = 'days28' THEN
    v_end := ((v_anchor + 1)::timestamp) AT TIME ZONE v_tz;
    v_start := v_end - interval '28 days';
    v_pend := v_start;
    v_pstart := v_start - interval '28 days';
  ELSE
    RAISE EXCEPTION 'Unknown period %, expected week, month, year or days28', p_period USING ERRCODE = '22023';
  END IF;

  WITH cur AS (
    SELECT * FROM public.cst_activity_stats(v_start, v_end)
  ),
  prior AS (
    SELECT s.tenant_id, s.certificates_issued FROM public.cst_activity_stats(v_pstart, v_pend) s
  ),
  last_seen AS (
    SELECT * FROM public.cst_last_activity()
  ),
  rr AS (
    SELECT cur.*, COALESCE(prior.certificates_issued, 0) AS prior_certificates,
           ls.last_active_at,
           NULLIF(btrim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS csc_name
    FROM cur
    LEFT JOIN prior ON prior.tenant_id = cur.tenant_id
    LEFT JOIN last_seen ls ON ls.tenant_id = cur.tenant_id
    LEFT JOIN public.users u ON u.user_uuid = cur.csc_user_id
  ),
  grouped AS (
    SELECT r.csc_user_id,
           COALESCE(max(r.csc_name), 'Unassigned') AS csc_name,
           count(*)::integer AS live_rtos,
           sum(r.client_users)::integer AS client_users,
           sum(r.active_users)::integer AS active_users,
           count(*) FILTER (WHERE r.active_users > 0)::integer AS rtos_active,
           count(*) FILTER (WHERE r.client_users > 0)::integer AS rtos_with_users,
           sum(r.never_signed_in)::integer AS never_signed_in,
           sum(r.certificates_issued)::integer AS certificates,
           sum(r.prior_certificates)::integer AS prior_certificates,
           jsonb_agg(jsonb_build_object(
             'tenant_id', r.tenant_id,
             'tenant_name', r.tenant_name,
             'client_users', r.client_users,
             'active_users', r.active_users,
             'never_signed_in', r.never_signed_in,
             'certificates', r.certificates_issued,
             'prior_certificates', r.prior_certificates,
             'last_active_at', r.last_active_at
           ) ORDER BY (r.active_users = 0) DESC, r.tenant_name) AS rtos
    FROM rr r
    GROUP BY r.csc_user_id
  )
  SELECT jsonb_build_object(
    'period', p_period,
    'start', v_start,
    'end', v_end,
    'prior_start', v_pstart,
    'prior_end', v_pend,
    'generated_at', now(),
    'totals', (SELECT jsonb_build_object(
        'live_rtos', COALESCE(sum(live_rtos), 0),
        'client_users', COALESCE(sum(client_users), 0),
        'active_users', COALESCE(sum(active_users), 0),
        'rtos_active', COALESCE(sum(rtos_active), 0),
        'rtos_with_users', COALESCE(sum(rtos_with_users), 0),
        'never_signed_in', COALESCE(sum(never_signed_in), 0),
        'certificates', COALESCE(sum(certificates), 0),
        'prior_certificates', COALESCE(sum(prior_certificates), 0)) FROM grouped),
    'csc', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY (g.csc_user_id IS NULL), g.live_rtos DESC, g.csc_name) FROM grouped g), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_cst_report(text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cst_report(text, date) TO authenticated, service_role;
