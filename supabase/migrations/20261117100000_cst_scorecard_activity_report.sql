-- CST scorecard: client activity and certificates issued for Live Client RTOs,
-- grouped by primary CSC. Definitions: docs/kb/reference/cst-scorecard-metric-dictionary-2026-11-17.md
--
-- Adds (no existing object is altered):
--   public.cst_activity_stats(timestamptz, timestamptz)   internal, per-RTO stats for a window
--   public.get_cst_report(text, date)                      Vivacity staff only, report for a period
--   public.cst_scorecard_weekly_snapshot                   one row per Live RTO per week (RLS, staff read)
--   public.snapshot_cst_week(date)                         writes one week of snapshot rows
--   public.backfill_cst_snapshots(integer)                 manual, writes past weeks
--   public.get_cst_team_metric(text, date)                 team metric value for scorecard-refresh
--   pg_cron job 'cst-scorecard-weekly-snapshot' (only where pg_cron is installed)
--
-- "Live Clients" mirrors Manage Tenants LIVE_STATUSES: active, on_hold,
-- 'In Arears' (stored with that exact casing), warning; not archived; RTO
-- accounts only (tenant metadata has no 'academy_solo' key).
--
-- Client activity (by a client user of that RTO): portal page views;
-- client_login, message_sent, message_read and academy_lesson_completed
-- timeline events; and academy_enrolled events whose metadata source is
-- 'self_enrol'. Automatic enrolments (auto_package, auto_all_clients), staff
-- impersonation and manual enrolments are attributed to the learner but are
-- not client actions, so they are excluded.
--
-- Client user: a tenant_users row whose profile is not Vivacity internal and
-- not archived. Past weeks use current membership and current Live status
-- (history of either is not stored).

-- ---------------------------------------------------------------------------
-- 1. Per-RTO stats for a window [p_start, p_end)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cst_activity_stats(p_start timestamptz, p_end timestamptz)
RETURNS TABLE (
  tenant_id bigint,
  tenant_name text,
  csc_user_id uuid,
  client_users integer,
  active_users integer,
  never_signed_in integer,
  certificates_issued integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH live AS (
    SELECT t.id, t.name
    FROM public.tenants t
    WHERE t.status IN ('active', 'on_hold', 'In Arears', 'warning')
      AND t.archived_at IS NULL
      AND NOT (COALESCE(t.metadata, '{}'::jsonb) ? 'academy_solo')
  ),
  csc AS (
    SELECT DISTINCT ON (a.tenant_id) a.tenant_id, a.csc_user_id
    FROM public.tenant_csc_assignments a
    WHERE a.is_primary AND a.ended_at IS NULL
    ORDER BY a.tenant_id, a.assigned_since DESC NULLS LAST, a.id DESC
  ),
  cu AS (
    SELECT tu.tenant_id, tu.user_id, u.last_sign_in_at
    FROM public.tenant_users tu
    JOIN live ON live.id = tu.tenant_id
    JOIN public.users u ON u.user_uuid = tu.user_id
    WHERE COALESCE(u.is_vivacity_internal, false) = false
      AND COALESCE(u.archived, false) = false
  ),
  act AS (
    SELECT v.tenant_id, v.user_id
    FROM public.client_portal_page_views v
    WHERE v.created_at >= p_start AND v.created_at < p_end
    UNION
    SELECT e.tenant_id::bigint, e.created_by
    FROM public.client_timeline_events e
    WHERE e.occurred_at >= p_start AND e.occurred_at < p_end
      AND e.created_by IS NOT NULL
      AND (
        e.event_type IN ('client_login', 'message_sent', 'message_read', 'academy_lesson_completed')
        OR (e.event_type = 'academy_enrolled' AND e.metadata ->> 'source' = 'self_enrol')
      )
  ),
  per_user AS (
    SELECT cu.tenant_id, cu.user_id, cu.last_sign_in_at,
           EXISTS (SELECT 1 FROM act WHERE act.tenant_id = cu.tenant_id AND act.user_id = cu.user_id) AS is_active
    FROM cu
  ),
  users_agg AS (
    SELECT p.tenant_id,
           count(*)::integer AS client_users,
           count(*) FILTER (WHERE p.is_active)::integer AS active_users,
           count(*) FILTER (WHERE p.last_sign_in_at IS NULL)::integer AS never_signed_in
    FROM per_user p
    GROUP BY p.tenant_id
  ),
  cert_agg AS (
    SELECT c.tenant_id, count(*)::integer AS certificates_issued
    FROM public.academy_certificates c
    JOIN live ON live.id = c.tenant_id
    WHERE c.revoked_at IS NULL AND c.issued_at >= p_start AND c.issued_at < p_end
    GROUP BY c.tenant_id
  )
  SELECT live.id,
         live.name,
         csc.csc_user_id,
         COALESCE(ua.client_users, 0),
         COALESCE(ua.active_users, 0),
         COALESCE(ua.never_signed_in, 0),
         COALESCE(ca.certificates_issued, 0)
  FROM live
  LEFT JOIN csc ON csc.tenant_id = live.id
  LEFT JOIN users_agg ua ON ua.tenant_id = live.id
  LEFT JOIN cert_agg ca ON ca.tenant_id = live.id;
$function$;

REVOKE ALL ON FUNCTION public.cst_activity_stats(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cst_activity_stats(timestamptz, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Report for a period, grouped by primary CSC (Vivacity staff only)
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
  rr AS (
    SELECT cur.*, COALESCE(prior.certificates_issued, 0) AS prior_certificates,
           NULLIF(btrim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS csc_name
    FROM cur
    LEFT JOIN prior ON prior.tenant_id = cur.tenant_id
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
             'prior_certificates', r.prior_certificates
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

-- ---------------------------------------------------------------------------
-- 3. Weekly snapshot (trend history and scorecard-refresh source)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cst_scorecard_weekly_snapshot (
  tenant_id bigint NOT NULL,
  week_ending date NOT NULL,                 -- Sunday, Australia/Sydney
  csc_user_id uuid,                          -- primary CSC as at computed_at
  client_users integer NOT NULL,
  active_users_28d integer NOT NULL,         -- active in the 28 days ending week_ending
  never_signed_in integer NOT NULL,
  certificates_week integer NOT NULL,        -- issued in the week ending week_ending
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, week_ending)
);

COMMENT ON TABLE public.cst_scorecard_weekly_snapshot IS
  'One row per Live Client RTO per week for the CST scorecard. Written only by snapshot_cst_week(); staff read-only. See docs/kb/reference/cst-scorecard-metric-dictionary-2026-11-17.md.';

ALTER TABLE public.cst_scorecard_weekly_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cst_snapshot_staff_read ON public.cst_scorecard_weekly_snapshot;
CREATE POLICY cst_snapshot_staff_read ON public.cst_scorecard_weekly_snapshot
  FOR SELECT TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

-- New public tables get default grants to authenticated; strip them so the
-- only client access is the staff SELECT policy above.
REVOKE ALL ON public.cst_scorecard_weekly_snapshot FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cst_scorecard_weekly_snapshot TO authenticated;
GRANT ALL ON public.cst_scorecard_weekly_snapshot TO service_role;

CREATE OR REPLACE FUNCTION public.snapshot_cst_week(p_week_ending date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tz constant text := 'Australia/Sydney';
  v_today date := (now() AT TIME ZONE v_tz)::date;
  v_week_ending date;
  v_end timestamptz;
  v_rows integer;
BEGIN
  -- Default: the most recent Sunday that has fully ended.
  v_week_ending := COALESCE(p_week_ending, v_today - (extract(isodow FROM v_today))::integer);
  IF extract(isodow FROM v_week_ending) <> 7 THEN
    RAISE EXCEPTION 'week_ending % is not a Sunday', v_week_ending USING ERRCODE = '22023';
  END IF;
  IF v_week_ending >= v_today THEN
    RAISE EXCEPTION 'week_ending % has not ended yet', v_week_ending USING ERRCODE = '22023';
  END IF;

  v_end := ((v_week_ending + 1)::timestamp) AT TIME ZONE v_tz;

  INSERT INTO public.cst_scorecard_weekly_snapshot AS s
    (tenant_id, week_ending, csc_user_id, client_users, active_users_28d, never_signed_in, certificates_week, computed_at)
  SELECT a.tenant_id, v_week_ending, a.csc_user_id, a.client_users, a.active_users, a.never_signed_in,
         w.certificates_issued, now()
  FROM public.cst_activity_stats(v_end - interval '28 days', v_end) a
  JOIN public.cst_activity_stats(v_end - interval '7 days', v_end) w ON w.tenant_id = a.tenant_id
  ON CONFLICT (tenant_id, week_ending) DO UPDATE
    SET csc_user_id = EXCLUDED.csc_user_id,
        client_users = EXCLUDED.client_users,
        active_users_28d = EXCLUDED.active_users_28d,
        never_signed_in = EXCLUDED.never_signed_in,
        certificates_week = EXCLUDED.certificates_week,
        computed_at = EXCLUDED.computed_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.snapshot_cst_week(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_cst_week(date) TO service_role;

CREATE OR REPLACE FUNCTION public.backfill_cst_snapshots(p_weeks integer DEFAULT 13)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tz constant text := 'Australia/Sydney';
  v_today date := (now() AT TIME ZONE v_tz)::date;
  v_last_sunday date := v_today - (extract(isodow FROM v_today))::integer;
  v_total integer := 0;
  i integer;
BEGIN
  IF p_weeks < 1 OR p_weeks > 104 THEN
    RAISE EXCEPTION 'p_weeks must be between 1 and 104' USING ERRCODE = '22023';
  END IF;
  FOR i IN 0 .. p_weeks - 1 LOOP
    v_total := v_total + public.snapshot_cst_week(v_last_sunday - (i * 7));
  END LOOP;
  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.backfill_cst_snapshots(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_cst_snapshots(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Team metric values for the scorecard-refresh edge function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cst_team_metric(p_metric_key text, p_week_ending date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE p_metric_key
    WHEN 'cst_client_activity_rate_pct' THEN
      CASE WHEN COALESCE(sum(client_users), 0) = 0 THEN NULL
           ELSE round(sum(active_users_28d)::numeric * 100 / sum(client_users), 1) END
    WHEN 'cst_rtos_with_activity_pct' THEN
      CASE WHEN count(*) FILTER (WHERE client_users > 0) = 0 THEN NULL
           ELSE round(count(*) FILTER (WHERE active_users_28d > 0)::numeric * 100
                      / count(*) FILTER (WHERE client_users > 0), 1) END
    WHEN 'cst_certificates_issued_count' THEN sum(certificates_week)::numeric
    WHEN 'cst_users_never_signed_in_count' THEN sum(never_signed_in)::numeric
    WHEN 'cst_rtos_no_activity_count' THEN
      count(*) FILTER (WHERE client_users > 0 AND active_users_28d = 0)::numeric
    ELSE NULL
  END
  FROM public.cst_scorecard_weekly_snapshot
  WHERE week_ending = p_week_ending
  HAVING count(*) > 0;
$function$;

REVOKE ALL ON FUNCTION public.get_cst_team_metric(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cst_team_metric(text, date) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Weekly job: Monday 03:30 Sydney (Sunday 16:30 UTC), only where pg_cron exists
-- ---------------------------------------------------------------------------
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cst-scorecard-weekly-snapshot';
    PERFORM cron.schedule(
      'cst-scorecard-weekly-snapshot',
      '30 16 * * 0',
      'select public.snapshot_cst_week();'
    );
  END IF;
END
$cron$;
