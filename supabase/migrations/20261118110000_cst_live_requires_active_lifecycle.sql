-- CST: a Live Client must also be lifecycle-active.
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- Replaces two existing functions in place (same signatures, so no second overload):
--   public.cst_activity_stats(timestamptz, timestamptz)
--   public.cst_last_activity()
--
-- The only change in both: the "live" set also requires tenants.lifecycle_status = 'active'.
-- Before this, a client whose account status was still Active, On hold, In Arears or Warning counted as Live
-- even when its lifecycle status was suspended or closed. Everything else (client users, client activity,
-- certificates, grants) is unchanged from 20261117100000_cst_scorecard_activity_report.sql and
-- 20261118100000_scorecard_discussion.sql.
--
-- Past weekly snapshots are not rewritten. New snapshots and the report use the new rule from the next run.

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
      AND t.lifecycle_status = 'active'
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
      AND t.lifecycle_status = 'active'
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
