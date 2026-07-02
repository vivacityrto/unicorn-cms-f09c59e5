DROP FUNCTION IF EXISTS public.kpi_csc_communication_rows(uuid, timestamptz, timestamptz);

CREATE FUNCTION public.kpi_csc_communication_rows(
  p_csc_user_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  message_id uuid,
  conversation_id uuid,
  tenant_id bigint,
  tenant_name text,
  subject text,
  client_body text,
  received_at timestamptz,
  responded_at timestamptz,
  reply_body text,
  response_seconds numeric,
  sla_status text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH client_msgs_in_window AS (
    SELECT m.id, m.conversation_id, m.tenant_id, m.created_at, m.body, m.sender_type
    FROM public.tenant_messages m
    WHERE m.created_at >= p_start
      AND m.created_at <  p_end
      AND m.sender_type = 'client'
  ),
  attributed AS (
    SELECT cm.*
    FROM client_msgs_in_window cm
    JOIN public.tenant_csc_assignments a
      ON a.tenant_id = cm.tenant_id
     AND a.csc_user_id = p_csc_user_id
     AND (a.is_primary = true OR a.superseded_at IS NOT NULL)
     AND a.assigned_since <= cm.created_at
     AND (a.superseded_at IS NULL OR a.superseded_at > cm.created_at)
  ),
  first_by_conv AS (
    SELECT conversation_id,
           (ARRAY_AGG(sender_type ORDER BY created_at ASC))[1] AS first_sender
    FROM public.tenant_messages
    WHERE conversation_id IN (SELECT DISTINCT conversation_id FROM attributed)
    GROUP BY conversation_id
  ),
  client_initiated AS (
    SELECT a.*
    FROM attributed a
    JOIN first_by_conv f ON f.conversation_id = a.conversation_id
    WHERE f.first_sender = 'client'
  ),
  with_next_staff AS (
    SELECT
      ci.*,
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
  ),
  bursts AS (
    SELECT DISTINCT ON (conversation_id, staff_ts)
      id, conversation_id, tenant_id, created_at, body, staff_ts, staff_body
    FROM with_next_staff
    ORDER BY conversation_id, staff_ts, created_at ASC
  )
  SELECT
    b.id                 AS message_id,
    b.conversation_id,
    b.tenant_id,
    t.name               AS tenant_name,
    COALESCE(NULLIF(conv.subject,''), NULLIF(conv.topic,''), NULLIF(LEFT(b.body, 60),''), '(no subject)') AS subject,
    b.body               AS client_body,
    b.created_at         AS received_at,
    b.staff_ts           AS responded_at,
    b.staff_body         AS reply_body,
    CASE WHEN b.staff_ts IS NOT NULL
         THEN EXTRACT(EPOCH FROM (b.staff_ts - b.created_at))
         ELSE NULL END   AS response_seconds,
    CASE
      WHEN b.staff_ts IS NOT NULL AND (b.staff_ts - b.created_at) <= interval '12 hours' THEN 'met'
      WHEN b.staff_ts IS NOT NULL THEN 'missed'
      WHEN (now() - b.created_at) > interval '12 hours' THEN 'missed'
      ELSE 'pending'
    END                  AS sla_status
  FROM bursts b
  LEFT JOIN public.tenants t ON t.id = b.tenant_id
  LEFT JOIN public.tenant_conversations conv ON conv.id = b.conversation_id
  ORDER BY b.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.kpi_csc_communication_rows(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_csc_communication_rows(uuid, timestamptz, timestamptz) TO authenticated;