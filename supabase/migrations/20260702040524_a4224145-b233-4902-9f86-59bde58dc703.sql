DROP FUNCTION IF EXISTS public.kpi_csc_communication_rows(uuid, timestamptz, timestamptz);

CREATE FUNCTION public.kpi_csc_communication_rows(p_csc_user_id uuid, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(message_id uuid, conversation_id uuid, tenant_id bigint, tenant_name text, subject text, client_body text, received_at timestamp with time zone, responded_at timestamp with time zone, reply_body text, response_seconds double precision, sla_status text)
 LANGUAGE sql
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
      ns.created_at AS staff_ts,
      ns.body       AS staff_body
    FROM client_initiated ci
    LEFT JOIN LATERAL (
      SELECT sm.created_at, sm.body
      FROM public.tenant_messages sm
      WHERE sm.conversation_id = ci.conversation_id
        AND sm.sender_type = 'staff'
        AND sm.created_at > ci.created_at
      ORDER BY sm.created_at ASC
      LIMIT 1
    ) ns ON true
  )
  SELECT
    ci.id                AS message_id,
    ci.conversation_id,
    ci.tenant_id,
    t.name               AS tenant_name,
    COALESCE(NULLIF(conv.subject,''), NULLIF(conv.topic,''), NULLIF(LEFT(ci.body, 60),''), '(no subject)') AS subject,
    ci.body              AS client_body,
    ci.created_at        AS received_at,
    ns.staff_ts          AS responded_at,
    ns.staff_body        AS reply_body,
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

REVOKE ALL ON FUNCTION public.kpi_csc_communication_rows(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_csc_communication_rows(uuid, timestamptz, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';