
-- 1. Update comms view to include actual emails from email_messages (last 5)
CREATE OR REPLACE VIEW public.v_dashboard_tenant_recent_comms AS
WITH ranked_notes AS (
  SELECT n.tenant_id, n.id, n.created_at, n.created_by, n.note_type,
         n.title, LEFT(n.note_details, 120) AS preview,
         ROW_NUMBER() OVER (PARTITION BY n.tenant_id ORDER BY n.created_at DESC) AS rn
  FROM notes n
),
ranked_emails AS (
  SELECT em.tenant_id, em.id, em.received_at AS created_at,
         em.subject, LEFT(em.body_preview, 120) AS preview,
         em.sender_name, em.sender_email,
         ROW_NUMBER() OVER (PARTITION BY em.tenant_id ORDER BY em.received_at DESC) AS rn
  FROM email_messages em
  WHERE em.tenant_id IS NOT NULL
)
SELECT
  t.id AS tenant_id,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
      'id', rn2.id, 'created_at', rn2.created_at, 'author_id', rn2.created_by,
      'type', rn2.note_type, 'title', rn2.title, 'preview', rn2.preview
    ) ORDER BY rn2.created_at DESC)
    FROM ranked_notes rn2 WHERE rn2.tenant_id = t.id AND rn2.rn <= 5),
    '[]'::jsonb
  ) AS recent_notes_json,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
      'id', re2.id, 'created_at', re2.created_at, 'subject', re2.subject,
      'preview', re2.preview, 'sender_name', re2.sender_name, 'sender_email', re2.sender_email
    ) ORDER BY re2.created_at DESC)
    FROM ranked_emails re2 WHERE re2.tenant_id = t.id AND re2.rn <= 5),
    '[]'::jsonb
  ) AS recent_emails_json
FROM tenants t
WHERE t.status = 'active';

-- 2. Create backend-backed behavioural prompts view for inbox fallbacks
CREATE OR REPLACE VIEW public.v_dashboard_behavioural_prompts AS
SELECT
  'no-consult-30d-' || p.tenant_id AS item_id,
  'behavioural_prompt' AS item_type,
  'moderate' AS severity,
  p.tenant_id,
  NULL::text AS stage_instance_id,
  NULL::text AS standard_clause,
  'No consult logged in 30 days – ' || p.tenant_name AS summary,
  p.assigned_csc_user_id AS owner_user_id,
  now() AS created_at,
  'No consulting activity recorded in the past 30 days. Consider scheduling a check-in.' AS why_text
FROM v_dashboard_tenant_portfolio p
WHERE p.consult_hours_30d = 0

UNION ALL

SELECT
  'inactive-21d-' || p.tenant_id,
  'behavioural_prompt',
  'moderate',
  p.tenant_id,
  NULL,
  NULL,
  'Low engagement – ' || p.tenant_name || ' (' ||
    COALESCE(EXTRACT(epoch FROM now() - p.last_activity_at) / 86400, 999)::int || 'd inactive)',
  p.assigned_csc_user_id,
  now(),
  'No task updates, uploads, or notes for over 21 days. May indicate a hidden blocker.'
FROM v_dashboard_tenant_portfolio p
WHERE COALESCE(EXTRACT(epoch FROM now() - p.last_activity_at) / 86400, 999) > 21

UNION ALL

SELECT
  'gap-check-60d-' || p.tenant_id,
  'behavioural_prompt',
  'moderate',
  p.tenant_id,
  NULL,
  NULL,
  'Evidence gap check overdue – ' || p.tenant_name,
  p.assigned_csc_user_id,
  now(),
  'No evidence gap analysis run recently. Mandatory categories may have drifted.'
FROM v_dashboard_tenant_portfolio p
WHERE p.mandatory_gaps_count > 0
  AND COALESCE(EXTRACT(epoch FROM now() - p.last_activity_at) / 86400, 999) > 14;
