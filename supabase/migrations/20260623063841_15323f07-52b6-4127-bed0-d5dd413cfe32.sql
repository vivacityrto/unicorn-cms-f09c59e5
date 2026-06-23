
-- =========================================================
-- Phase 5: KPI review automation (compute + upsert RPCs)
-- =========================================================

-- ---------- compute_kpi_overall_status ----------
CREATE OR REPLACE FUNCTION public.compute_kpi_overall_status(
  p_kpi_role     text,
  p_subject_uuid uuid,
  p_period_start date,
  p_period_end   date
)
RETURNS TABLE (overall_status text, metrics jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_min_pct numeric;
  v_metrics jsonb := '{}'::jsonb;
  v_status  text;
BEGIN
  IF p_kpi_role NOT IN ('csc','cst','dev') THEN
    RAISE EXCEPTION 'Invalid kpi_role: %', p_kpi_role;
  END IF;

  IF p_kpi_role = 'csc' THEN
    SELECT
      jsonb_build_object(
        'entry_count',     COALESCE(SUM(entry_count), 0),
        'total_minutes',   COALESCE(SUM(total_minutes), 0),
        'billable_minutes',COALESCE(SUM(billable_minutes), 0),
        'billable_pct',
          CASE WHEN COALESCE(SUM(total_minutes),0) > 0
               THEN ROUND((SUM(billable_minutes)::numeric / SUM(total_minutes)) * 100, 2)
               ELSE NULL END
      ),
      CASE WHEN COALESCE(SUM(total_minutes),0) > 0
           THEN (SUM(billable_minutes)::numeric / SUM(total_minutes)) * 100
           ELSE NULL END
    INTO v_metrics, v_min_pct
    FROM public.v_kpi_csc_summary
    WHERE subject_uuid = p_subject_uuid
      AND period_start >= p_period_start
      AND period_start <= p_period_end;

  ELSIF p_kpi_role = 'cst' THEN
    WITH agg AS (
      SELECT
        COALESCE(SUM(sla1_total),0)     AS sla1_total,
        COALESCE(SUM(sla1_met),0)       AS sla1_met,
        COALESCE(SUM(sla2_total),0)     AS sla2_total,
        COALESCE(SUM(sla2_met),0)       AS sla2_met,
        COALESCE(SUM(tasks_total),0)    AS tasks_total,
        COALESCE(SUM(tasks_completed),0)AS tasks_completed,
        COALESCE(SUM(tasks_on_time),0)  AS tasks_on_time
      FROM public.v_kpi_cst_summary
      WHERE subject_uuid = p_subject_uuid
        AND period_start >= p_period_start
        AND period_start <= p_period_end
    ),
    pcts AS (
      SELECT
        CASE WHEN sla1_total > 0 THEN (sla1_met::numeric / sla1_total) * 100 END AS sla1_pct,
        CASE WHEN sla2_total > 0 THEN (sla2_met::numeric / sla2_total) * 100 END AS sla2_pct,
        CASE WHEN tasks_total > 0 THEN (tasks_completed::numeric / tasks_total) * 100 END AS tasks_complete_pct,
        CASE WHEN tasks_completed > 0 THEN (tasks_on_time::numeric / tasks_completed) * 100 END AS tasks_on_time_pct,
        sla1_total, sla1_met, sla2_total, sla2_met, tasks_total, tasks_completed, tasks_on_time
      FROM agg
    )
    SELECT
      jsonb_build_object(
        'sla1_total', sla1_total, 'sla1_met', sla1_met,
        'sla1_pct',   ROUND(sla1_pct, 2),
        'sla2_total', sla2_total, 'sla2_met', sla2_met,
        'sla2_pct',   ROUND(sla2_pct, 2),
        'tasks_total', tasks_total,
        'tasks_completed', tasks_completed,
        'tasks_on_time',   tasks_on_time,
        'tasks_complete_pct', ROUND(tasks_complete_pct, 2),
        'tasks_on_time_pct', ROUND(tasks_on_time_pct, 2)
      ),
      LEAST(
        COALESCE(sla1_pct,   999),
        COALESCE(sla2_pct,   999),
        COALESCE(tasks_complete_pct, 999),
        COALESCE(tasks_on_time_pct,  999)
      )
    INTO v_metrics, v_min_pct
    FROM pcts;
    IF v_min_pct = 999 THEN v_min_pct := NULL; END IF;

  ELSE -- dev
    WITH agg AS (
      SELECT
        COALESCE(SUM(tickets_opened),0)       AS tickets_opened,
        COALESCE(SUM(tickets_resolved),0)     AS tickets_resolved,
        COALESCE(SUM(reopen_count),0)         AS reopen_count,
        COALESCE(SUM(milestones_total),0)     AS milestones_total,
        COALESCE(SUM(milestones_delivered),0) AS milestones_delivered,
        COALESCE(SUM(milestones_on_time),0)   AS milestones_on_time
      FROM public.v_kpi_dev_summary
      WHERE subject_uuid = p_subject_uuid
        AND period_start >= p_period_start
        AND period_start <= p_period_end
    ),
    pcts AS (
      SELECT
        CASE WHEN tickets_opened > 0
             THEN (tickets_resolved::numeric / tickets_opened) * 100 END AS resolution_pct,
        CASE WHEN milestones_total > 0
             THEN (milestones_on_time::numeric / milestones_total) * 100 END AS milestone_on_time_pct,
        -- Reopen penalty: every reopen over 10% of opened drops 25 pts.
        CASE WHEN tickets_opened > 0
             THEN GREATEST(0, 100 - ((reopen_count::numeric / tickets_opened) * 250))
             END AS quality_pct,
        tickets_opened, tickets_resolved, reopen_count,
        milestones_total, milestones_delivered, milestones_on_time
      FROM agg
    )
    SELECT
      jsonb_build_object(
        'tickets_opened', tickets_opened,
        'tickets_resolved', tickets_resolved,
        'reopen_count', reopen_count,
        'resolution_pct', ROUND(resolution_pct, 2),
        'quality_pct',    ROUND(quality_pct, 2),
        'milestones_total', milestones_total,
        'milestones_delivered', milestones_delivered,
        'milestones_on_time',   milestones_on_time,
        'milestone_on_time_pct', ROUND(milestone_on_time_pct, 2)
      ),
      LEAST(
        COALESCE(resolution_pct,        999),
        COALESCE(milestone_on_time_pct, 999),
        COALESCE(quality_pct,           999)
      )
    INTO v_metrics, v_min_pct
    FROM pcts;
    IF v_min_pct = 999 THEN v_min_pct := NULL; END IF;
  END IF;

  IF v_min_pct IS NULL THEN
    v_status := NULL;
  ELSIF v_min_pct >= 95 THEN
    v_status := 'exceeds';
  ELSIF v_min_pct >= 85 THEN
    v_status := 'on_track';
  ELSIF v_min_pct >= 70 THEN
    v_status := 'at_risk';
  ELSE
    v_status := 'off_track';
  END IF;

  overall_status := v_status;
  metrics        := COALESCE(v_metrics, '{}'::jsonb);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_kpi_overall_status(text, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_kpi_overall_status(text, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_kpi_overall_status(text, uuid, date, date) TO service_role;

-- ---------- upsert_kpi_review ----------
CREATE OR REPLACE FUNCTION public.upsert_kpi_review(
  p_subject_uuid uuid,
  p_kpi_role     text,
  p_period_type  text,
  p_period_start date,
  p_period_end   date,
  p_notes        text DEFAULT NULL
)
RETURNS public.kpi_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_status       text;
  v_metrics      jsonb;
  v_existing     public.kpi_reviews;
  v_result       public.kpi_reviews;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.is_kpi_reviewer_safe(v_caller) OR public.is_super_admin_safe(v_caller)) THEN
    RAISE EXCEPTION 'Only KPI reviewers or SuperAdmins may upsert reviews';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'period_end must be on or after period_start';
  END IF;

  SELECT overall_status, metrics
    INTO v_status, v_metrics
    FROM public.compute_kpi_overall_status(p_kpi_role, p_subject_uuid, p_period_start, p_period_end);

  SELECT * INTO v_existing
  FROM public.kpi_reviews
  WHERE subject_uuid = p_subject_uuid
    AND kpi_role     = p_kpi_role
    AND period_type  = p_period_type
    AND period_start = p_period_start;

  IF v_existing.id IS NOT NULL AND v_existing.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Review is locked and cannot be modified';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.kpi_reviews (
      subject_uuid, kpi_role, period_type, period_start, period_end,
      overall_status, metrics, notes, created_by
    ) VALUES (
      p_subject_uuid, p_kpi_role, p_period_type, p_period_start, p_period_end,
      v_status, COALESCE(v_metrics,'{}'::jsonb), p_notes, v_caller
    )
    RETURNING * INTO v_result;
  ELSE
    UPDATE public.kpi_reviews
       SET period_end     = p_period_end,
           overall_status = v_status,
           metrics        = COALESCE(v_metrics,'{}'::jsonb),
           notes          = COALESCE(p_notes, notes)
     WHERE id = v_existing.id
     RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_kpi_review(uuid, text, text, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_kpi_review(uuid, text, text, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_kpi_review(uuid, text, text, date, date, text) TO service_role;
