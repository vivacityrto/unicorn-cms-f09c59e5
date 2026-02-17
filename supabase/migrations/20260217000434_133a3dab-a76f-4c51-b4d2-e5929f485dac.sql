
-- Drop the existing view first (column layout changed)
DROP VIEW IF EXISTS public.v_dashboard_attention_ranked;

-- Create the pure SQL scoring function
CREATE OR REPLACE FUNCTION public.calculate_attention_score(
  p_stage_score numeric,
  p_gaps_score numeric,
  p_risk_score numeric,
  p_staleness_score numeric,
  p_renewal_score numeric,
  p_burn_score numeric
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round(
    (0.30 * p_stage_score) +
    (0.20 * p_gaps_score) +
    (0.20 * p_risk_score) +
    (0.15 * p_staleness_score) +
    (0.10 * p_renewal_score) +
    (0.05 * p_burn_score)
  )::int;
$$;

-- Recreate with full 6-component scoring model
CREATE VIEW public.v_dashboard_attention_ranked AS
WITH base AS (
  SELECT
    p.tenant_id, p.tenant_name, p.tenant_status, p.abn, p.rto_id, p.cricos_id,
    p.assigned_csc_user_id, p.packages_json,
    p.risk_status, p.risk_index, p.risk_index_delta_14d,
    p.worst_stage_health_status, p.critical_stage_count, p.at_risk_stage_count,
    p.open_tasks_count, p.overdue_tasks_count, p.mandatory_gaps_count,
    p.consult_hours_30d, p.burn_risk_status, p.projected_exhaustion_date,
    p.retention_status, p.composite_retention_risk_index, p.last_activity_at,
    tcp.renewal_window_start,
    COALESCE(hsr.high_severity_open_risks, 0) AS high_severity_open_risks,
    COALESCE(EXTRACT(epoch FROM now() - p.last_activity_at) / 86400, 999)::integer AS days_since_activity,
    CASE WHEN tcp.renewal_window_start IS NOT NULL
      THEN (tcp.renewal_window_start::date - CURRENT_DATE)
      ELSE NULL
    END AS days_to_renewal
  FROM v_dashboard_tenant_portfolio p
  LEFT JOIN tenant_commercial_profiles tcp ON tcp.tenant_id = p.tenant_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS high_severity_open_risks
    FROM risk_events re
    WHERE re.tenant_id = p.tenant_id AND re.severity = 'high' AND re.status = 'open'
  ) hsr ON true
),
sub_scores AS (
  SELECT b.*,
    -- A) Stage health pressure (0-100)
    LEAST(100, GREATEST(0,
      CASE b.worst_stage_health_status
        WHEN 'critical' THEN 100 WHEN 'at_risk' THEN 70
        WHEN 'monitoring' THEN 35 ELSE 0
      END + LEAST(b.critical_stage_count * 10, 20) + LEAST(b.at_risk_stage_count * 5, 15)
    )) AS stage_score,
    -- B) Evidence gaps pressure (0-100)
    CASE WHEN b.mandatory_gaps_count = 0 THEN 0
      ELSE LEAST(100, b.mandatory_gaps_count * 20) END AS gaps_score,
    -- C) Risk pressure (0-100)
    LEAST(100, GREATEST(0,
      COALESCE(b.risk_index, 0)
      + LEAST(25, GREATEST(0, COALESCE(b.risk_index_delta_14d, 0) * 1.5))
      + LEAST(25, b.high_severity_open_risks * 10)
    ))::int AS risk_score,
    -- D) Activity staleness (0-100)
    LEAST(100,
      CASE
        WHEN b.days_since_activity <= 7  THEN 0
        WHEN b.days_since_activity <= 14 THEN 25
        WHEN b.days_since_activity <= 21 THEN 50
        WHEN b.days_since_activity <= 30 THEN 75
        ELSE 100
      END + CASE WHEN b.open_tasks_count > 0 AND b.days_since_activity >= 15 THEN 10 ELSE 0 END
    ) AS staleness_score,
    -- E) Renewal proximity (0-100)
    CASE
      WHEN b.days_to_renewal IS NULL THEN 0
      WHEN b.days_to_renewal <= 0   THEN 100
      WHEN b.days_to_renewal <= 14  THEN 100
      WHEN b.days_to_renewal <= 30  THEN 75
      WHEN b.days_to_renewal <= 60  THEN 50
      WHEN b.days_to_renewal <= 90  THEN 25
      ELSE 0
    END AS renewal_score,
    -- F) Burn pressure (0-100)
    LEAST(100,
      CASE b.burn_risk_status
        WHEN 'critical' THEN 100 WHEN 'accelerated' THEN 50 ELSE 0
      END + CASE WHEN b.projected_exhaustion_date IS NOT NULL
                  AND b.projected_exhaustion_date::date - CURRENT_DATE <= 30
                THEN 15 ELSE 0 END
    ) AS burn_score
  FROM base b
),
final AS (
  SELECT s.*,
    public.calculate_attention_score(
      s.stage_score, s.gaps_score, s.risk_score,
      s.staleness_score, s.renewal_score, s.burn_score
    ) AS attention_score,
    (
      SELECT jsonb_agg(d ORDER BY (d->>'impact')::int DESC)
      FROM (
        SELECT d FROM jsonb_array_elements(
          jsonb_build_array(
            jsonb_build_object('driver', 'Critical stage', 'value', s.critical_stage_count || ' critical, ' || s.at_risk_stage_count || ' at risk', 'impact', round(0.30 * s.stage_score)),
            jsonb_build_object('driver', 'Mandatory gaps', 'value', s.mandatory_gaps_count || ' missing categories', 'impact', round(0.20 * s.gaps_score)),
            jsonb_build_object('driver', 'Rising risk', 'value', CASE WHEN COALESCE(s.risk_index_delta_14d,0) > 0 THEN '+' || s.risk_index_delta_14d || ' risk index in 14d' ELSE 'Index ' || COALESCE(s.risk_index,0) END, 'impact', round(0.20 * s.risk_score)),
            jsonb_build_object('driver', 'Inactivity', 'value', s.days_since_activity || ' days since activity', 'impact', round(0.15 * s.staleness_score)),
            jsonb_build_object('driver', 'Renewal pressure', 'value', CASE WHEN s.days_to_renewal IS NOT NULL THEN s.days_to_renewal || ' days to renewal' ELSE 'No renewal date' END, 'impact', round(0.10 * s.renewal_score)),
            jsonb_build_object('driver', 'Burn pressure', 'value', s.burn_risk_status, 'impact', round(0.05 * s.burn_score))
          )
        ) AS d
        WHERE (d->>'impact')::int > 0
        LIMIT 3
      ) sub
    ) AS attention_drivers_json
  FROM sub_scores s
)
SELECT
  f.tenant_id, f.tenant_name, f.tenant_status, f.abn, f.rto_id, f.cricos_id,
  f.assigned_csc_user_id, f.packages_json,
  f.risk_status, f.risk_index, f.risk_index_delta_14d,
  f.worst_stage_health_status, f.critical_stage_count, f.at_risk_stage_count,
  f.open_tasks_count, f.overdue_tasks_count, f.mandatory_gaps_count,
  f.consult_hours_30d, f.burn_risk_status, f.projected_exhaustion_date,
  f.retention_status, f.composite_retention_risk_index, f.last_activity_at,
  f.renewal_window_start, f.high_severity_open_risks,
  f.days_since_activity, f.days_to_renewal,
  f.stage_score, f.gaps_score, f.risk_score,
  f.staleness_score, f.renewal_score, f.burn_score,
  f.attention_score, f.attention_drivers_json
FROM final f
ORDER BY
  f.attention_score DESC,
  f.critical_stage_count DESC,
  f.mandatory_gaps_count DESC,
  f.risk_index_delta_14d DESC,
  f.days_since_activity DESC,
  f.renewal_window_start ASC NULLS LAST;
