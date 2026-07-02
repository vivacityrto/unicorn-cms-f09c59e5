
CREATE OR REPLACE FUNCTION public.kpi_csc_retention_rows(
  p_csc_user_id uuid,
  p_start       timestamptz,
  p_end         timestamptz
)
RETURNS TABLE(
  tenant_id      bigint,
  tenant_name    text,
  assigned_since timestamptz,
  superseded_at  timestamptz,
  churned_at     timestamptz,
  churned_in_period boolean
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $function$
  WITH stints AS (
    SELECT DISTINCT ON (a.tenant_id)
      a.tenant_id,
      a.assigned_since,
      a.superseded_at
    FROM public.tenant_csc_assignments a
    WHERE a.csc_user_id = p_csc_user_id
      AND (a.is_primary = true OR a.superseded_at IS NOT NULL)
      AND a.assigned_since < p_end
      AND (a.superseded_at IS NULL OR a.superseded_at > p_start)
      AND (a.ended_at IS NULL OR a.ended_at > p_start)
    ORDER BY a.tenant_id, a.assigned_since DESC
  )
  SELECT
    s.tenant_id,
    t.name AS tenant_name,
    s.assigned_since,
    s.superseded_at,
    t.churned_at,
    (t.churned_at IS NOT NULL
      AND t.churned_at >= p_start
      AND t.churned_at <  p_end
      AND t.churned_at >= s.assigned_since
      AND (s.superseded_at IS NULL OR t.churned_at <= s.superseded_at)
    ) AS churned_in_period
  FROM stints s
  LEFT JOIN public.tenants t ON t.id = s.tenant_id;
$function$;

REVOKE ALL ON FUNCTION public.kpi_csc_retention_rows(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_csc_retention_rows(uuid, timestamptz, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kpi_csc_communication_rows(
  p_csc_user_id uuid,
  p_start       timestamptz,
  p_end         timestamptz
)
RETURNS TABLE(
  message_id      uuid,
  conversation_id uuid,
  tenant_id       bigint,
  tenant_name     text,
  subject         text,
  received_at     timestamptz,
  responded_at    timestamptz,
  response_seconds double precision,
  sla_status      text
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $function$
  WITH client_msgs_in_window AS (
    SELECT m.id, m.conversation_id, m.tenant_id, m.created_at, m.body
    FROM public.tenant_messages m
    WHERE m.sender_type = 'client'
      AND m.created_at >= p_start
      AND m.created_at <  p_end
  ),
  attributed AS (
    SELECT cm.*
    FROM client_msgs_in_window cm
    WHERE EXISTS (
      SELECT 1
      FROM public.tenant_csc_assignments a
      WHERE a.tenant_id   = cm.tenant_id
        AND a.csc_user_id = p_csc_user_id
        AND (a.is_primary = true OR a.superseded_at IS NOT NULL)
        AND a.assigned_since <= cm.created_at
        AND (a.superseded_at IS NULL OR a.superseded_at > cm.created_at)
        AND (a.ended_at      IS NULL OR a.ended_at      > cm.created_at)
    )
  ),
  first_by_conv AS (
    SELECT DISTINCT ON (tm.conversation_id)
      tm.conversation_id, tm.sender_type
    FROM public.tenant_messages tm
    WHERE tm.conversation_id IN (SELECT DISTINCT conversation_id FROM attributed WHERE conversation_id IS NOT NULL)
    ORDER BY tm.conversation_id, tm.created_at ASC
  ),
  client_initiated AS (
    SELECT a.*
    FROM attributed a
    JOIN first_by_conv f
      ON f.conversation_id = a.conversation_id
     AND f.sender_type = 'client'
  ),
  next_staff AS (
    SELECT
      ci.id AS client_msg_id,
      (
        SELECT MIN(sm.created_at)
        FROM public.tenant_messages sm
        WHERE sm.conversation_id = ci.conversation_id
          AND sm.sender_type = 'staff'
          AND sm.created_at > ci.created_at
      ) AS staff_ts
    FROM client_initiated ci
  )
  SELECT
    ci.id                AS message_id,
    ci.conversation_id,
    ci.tenant_id,
    t.name               AS tenant_name,
    COALESCE(NULLIF(conv.subject,''), NULLIF(conv.topic,''), NULLIF(LEFT(ci.body, 60),''), '(no subject)') AS subject,
    ci.created_at        AS received_at,
    ns.staff_ts          AS responded_at,
    CASE WHEN ns.staff_ts IS NOT NULL
         THEN EXTRACT(EPOCH FROM (ns.staff_ts - ci.created_at))
         ELSE NULL END   AS response_seconds,
    CASE
      WHEN ns.staff_ts IS NOT NULL AND (ns.staff_ts - ci.created_at) <= interval '12 hours' THEN 'met'
      WHEN ns.staff_ts IS NOT NULL THEN 'missed'
      WHEN (now() - ci.created_at) > interval '12 hours' THEN 'missed'
      ELSE 'pending'
    END                  AS sla_status
  FROM client_initiated ci
  LEFT JOIN next_staff ns ON ns.client_msg_id = ci.id
  LEFT JOIN public.tenants t ON t.id = ci.tenant_id
  LEFT JOIN public.tenant_conversations conv ON conv.id = ci.conversation_id
  ORDER BY ci.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.kpi_csc_communication_rows(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_csc_communication_rows(uuid, timestamptz, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kpi_csc_tasks_rows(
  p_csc_user_id uuid,
  p_start       timestamptz,
  p_end         timestamptz
)
RETURNS TABLE(
  task_id      uuid,
  task_name    text,
  status       text,
  created_at   timestamptz,
  completed_at timestamptz,
  tenant_id    bigint,
  tenant_name  text,
  package_name text
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $function$
  SELECT
    ctt.id           AS task_id,
    ctt.name         AS task_name,
    ctt.status,
    ctt.created_at,
    ctt.completed_at,
    cp.tenant_id,
    t.name           AS tenant_name,
    p.name           AS package_name
  FROM public.client_team_tasks ctt
  JOIN public.client_package_stages cps ON cps.id = ctt.client_package_stage_id
  JOIN public.client_packages       cp  ON cp.id  = cps.client_package_id
  LEFT JOIN public.tenants  t ON t.id = cp.tenant_id
  LEFT JOIN public.packages p ON p.id = cp.package_id
  WHERE ctt.created_at >= p_start
    AND ctt.created_at <  p_end
    AND EXISTS (
      SELECT 1
      FROM public.tenant_csc_assignments a
      WHERE a.tenant_id   = cp.tenant_id
        AND a.csc_user_id = p_csc_user_id
        AND (a.is_primary = true OR a.superseded_at IS NOT NULL)
        AND a.assigned_since <= ctt.created_at
        AND (a.superseded_at IS NULL OR a.superseded_at > ctt.created_at)
        AND (a.ended_at      IS NULL OR a.ended_at      > ctt.created_at)
    )
  ORDER BY ctt.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.kpi_csc_tasks_rows(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_csc_tasks_rows(uuid, timestamptz, timestamptz) TO authenticated, service_role;
