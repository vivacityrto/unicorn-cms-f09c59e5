
-- ============================================================
-- Execution Momentum View for Executive Dashboard
-- ============================================================

-- Aggregates v_dashboard_weekly_wins for current vs previous 7-day window
CREATE OR REPLACE VIEW public.v_executive_momentum_7d
WITH (security_invoker = true) AS
WITH current_week AS (
  SELECT
    COALESCE(SUM(phases_completed), 0) AS phases_completed,
    COALESCE(SUM(documents_generated), 0) AS documents_generated,
    COALESCE(SUM(clients_moved_forward), 0) AS clients_moved_forward,
    COALESCE(SUM(rocks_closed), 0) AS rocks_closed,
    COALESCE(SUM(hours_logged), 0) AS hours_logged
  FROM v_dashboard_weekly_wins
  WHERE week_start_date >= (CURRENT_DATE - interval '7 days')::date
),
previous_week AS (
  SELECT
    COALESCE(SUM(phases_completed), 0) AS phases_completed,
    COALESCE(SUM(documents_generated), 0) AS documents_generated,
    COALESCE(SUM(clients_moved_forward), 0) AS clients_moved_forward,
    COALESCE(SUM(rocks_closed), 0) AS rocks_closed,
    COALESCE(SUM(hours_logged), 0) AS hours_logged
  FROM v_dashboard_weekly_wins
  WHERE week_start_date >= (CURRENT_DATE - interval '14 days')::date
    AND week_start_date < (CURRENT_DATE - interval '7 days')::date
)
SELECT
  c.phases_completed AS phases_completed_7d,
  p.phases_completed AS phases_completed_prev_7d,
  c.documents_generated AS documents_generated_7d,
  p.documents_generated AS documents_generated_prev_7d,
  c.clients_moved_forward AS clients_moved_forward_7d,
  p.clients_moved_forward AS clients_moved_forward_prev_7d,
  c.rocks_closed AS rocks_closed_7d,
  p.rocks_closed AS rocks_closed_prev_7d,
  c.hours_logged AS hours_logged_7d,
  p.hours_logged AS hours_logged_prev_7d
FROM current_week c, previous_week p;

-- Consultant distribution view for executive dashboard
CREATE OR REPLACE VIEW public.v_executive_consultant_distribution
WITH (security_invoker = true) AS
SELECT
  u.user_uuid AS consultant_uuid,
  u.first_name || ' ' || u.last_name AS consultant_name,
  COUNT(DISTINCT h.package_instance_id) AS client_count,
  COUNT(DISTINCT h.package_instance_id) FILTER (WHERE h.risk_band = 'immediate_attention') AS immediate_count,
  COUNT(DISTINCT h.package_instance_id) FILTER (WHERE h.risk_band = 'at_risk') AS at_risk_count,
  COUNT(DISTINCT h.package_instance_id) FILTER (WHERE h.days_stale > 14) AS stalled_count,
  ROUND(AVG(h.overall_score)) AS avg_score,
  ROUND(AVG(h.delta_overall_score_7d)) AS avg_score_delta_7d
FROM v_executive_client_health h
JOIN users u ON u.user_uuid = h.owner_user_uuid
WHERE h.owner_user_uuid IS NOT NULL
GROUP BY u.user_uuid, u.first_name, u.last_name;
