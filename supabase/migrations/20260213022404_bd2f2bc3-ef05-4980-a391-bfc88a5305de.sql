
-- ============================================================
-- KPI Score Rolling RPC – Adapted for Unicorn 2.0 schema
-- Uses: eos_todos, eos_rocks, financial_controls
-- Tenant ID is bigint. Uses existing RLS helpers.
-- ============================================================

create or replace function public.kpi_score_rolling(
  p_tenant_id bigint,
  p_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => p_days);

  -- EOS Execution
  v_todo_due int := 0;
  v_todo_done int := 0;
  v_todo_rate numeric := null;
  v_rock_total int := 0;
  v_rock_on_track int := 0;
  v_rock_rate numeric := null;

  -- Integrity
  v_overdue_total int := 0;
  v_overdue_unowned int := 0;

  -- Financial
  v_xero_ok boolean := null;
  v_payroll_ok boolean := null;

  -- Category scores (0..100)
  s_eos numeric := null;
  s_integrity numeric := null;
  s_ceo numeric := null;
  s_fin numeric := null;

  -- Weights
  w_eos numeric := 30;
  w_integrity numeric := 20;
  w_ceo numeric := 20;
  w_fin numeric := 30;

  w_sum numeric := 0;
  overall numeric := null;

begin
  -- Guard: Vivacity staff or tenant member
  if not is_vivacity_team_safe(auth.uid())
     and not has_tenant_access_safe(p_tenant_id, auth.uid()) then
    raise exception 'not authorized for tenant';
  end if;

  -- ═══════════════════════════════════════════
  -- A) EOS Execution (To-Do completion + Rock health)
  -- ═══════════════════════════════════════════

  -- To-Do completion rate (items due in window)
  select
    count(*) filter (where t.due_date is not null and t.due_date >= v_since::date),
    count(*) filter (
      where t.due_date is not null
        and t.due_date >= v_since::date
        and (t.status = 'Complete' or t.completed_at is not null)
    )
  into v_todo_due, v_todo_done
  from eos_todos t
  where t.tenant_id = p_tenant_id;

  if v_todo_due > 0 then
    v_todo_rate := v_todo_done::numeric / v_todo_due::numeric;
  end if;

  -- Rock health (active quarter, non-archived)
  select
    count(*),
    count(*) filter (where r.status in ('On_Track', 'Complete'))
  into v_rock_total, v_rock_on_track
  from eos_rocks r
  where r.tenant_id = p_tenant_id
    and r.archived_at is null
    and r.created_at >= v_since;

  -- Blend: 60% todo rate + 40% rock rate
  declare
    v_todo_score numeric := null;
    v_rock_score numeric := null;
  begin
    -- Todo score mapping
    if v_todo_rate is not null then
      if v_todo_rate >= 0.90 then v_todo_score := 100;
      elsif v_todo_rate >= 0.80 then v_todo_score := 80 + (v_todo_rate - 0.80) * (19.0 / 0.10);
      else v_todo_score := greatest(0, v_todo_rate * 99);
      end if;
    end if;

    -- Rock score
    if v_rock_total > 0 then
      v_rock_score := (v_rock_on_track::numeric / v_rock_total::numeric) * 100;
    end if;

    -- Blend available scores
    if v_todo_score is not null and v_rock_score is not null then
      s_eos := round(v_todo_score * 0.6 + v_rock_score * 0.4, 1);
    elsif v_todo_score is not null then
      s_eos := round(v_todo_score, 1);
    elsif v_rock_score is not null then
      s_eos := round(v_rock_score, 1);
    end if;
  end;

  -- ═══════════════════════════════════════════
  -- B) Unicorn Integrity
  -- Overdue open todos; unowned = no assigned_to
  -- ═══════════════════════════════════════════

  select
    count(*) filter (
      where t.due_date is not null
        and t.due_date < current_date
        and t.status = 'Open'
    ),
    count(*) filter (
      where t.due_date is not null
        and t.due_date < current_date
        and t.status = 'Open'
        and t.assigned_to is null
    )
  into v_overdue_total, v_overdue_unowned
  from eos_todos t
  where t.tenant_id = p_tenant_id
    and t.created_at >= v_since;

  if v_overdue_total is not null then
    s_integrity := greatest(0, 100 - least(100, (v_overdue_unowned * 10 + v_overdue_total * 2)));
  end if;

  -- ═══════════════════════════════════════════
  -- C) CEO Relief – derived from delegation ratio
  -- Open todos: % not owned by CEO (owner_id != CEO user)
  -- Set null for now; dashboard computes client-side as fallback
  -- ═══════════════════════════════════════════
  s_ceo := null;

  -- ═══════════════════════════════════════════
  -- D) Financial Accuracy
  -- ═══════════════════════════════════════════

  select
    bool_or(fc.control_type = 'xero_reconciliation' and fc.status in ('ok') and fc.updated_at >= v_since),
    bool_or(fc.control_type = 'payroll' and fc.status in ('ok') and fc.updated_at >= v_since)
  into v_xero_ok, v_payroll_ok
  from financial_controls fc
  where fc.tenant_id = p_tenant_id;

  if v_payroll_ok is true and v_xero_ok is true then
    s_fin := 100;
  elsif v_payroll_ok is false then
    s_fin := 0;
  elsif v_xero_ok is false then
    s_fin := 50;
  else
    s_fin := null;  -- no data yet
  end if;

  -- ═══════════════════════════════════════════
  -- Weighted overall (null-safe denominator)
  -- ═══════════════════════════════════════════

  w_sum := 0;
  overall := 0;

  if s_eos is not null then overall := overall + s_eos * w_eos; w_sum := w_sum + w_eos; end if;
  if s_integrity is not null then overall := overall + s_integrity * w_integrity; w_sum := w_sum + w_integrity; end if;
  if s_ceo is not null then overall := overall + s_ceo * w_ceo; w_sum := w_sum + w_ceo; end if;
  if s_fin is not null then overall := overall + s_fin * w_fin; w_sum := w_sum + w_fin; end if;

  if w_sum = 0 then
    overall := null;
  else
    overall := round(overall / w_sum, 2);
  end if;

  return jsonb_build_object(
    'tenant_id', p_tenant_id,
    'window_days', p_days,
    'since', v_since,
    'scores', jsonb_build_object(
      'eos_execution', s_eos,
      'unicorn_integrity', s_integrity,
      'ceo_relief', s_ceo,
      'financial_accuracy', s_fin
    ),
    'metrics', jsonb_build_object(
      'todo_due', v_todo_due,
      'todo_done', v_todo_done,
      'todo_completion_rate', v_todo_rate,
      'rock_total', v_rock_total,
      'rock_on_track', v_rock_on_track,
      'overdue_total', v_overdue_total,
      'overdue_unowned', v_overdue_unowned,
      'xero_ok', v_xero_ok,
      'payroll_ok', v_payroll_ok
    ),
    'weights', jsonb_build_object(
      'eos_execution', w_eos,
      'unicorn_integrity', w_integrity,
      'ceo_relief', w_ceo,
      'financial_accuracy', w_fin
    ),
    'overall_score', overall,
    'status', case
      when overall is null then null
      when overall >= 85 then 'green'
      when overall >= 70 then 'amber'
      else 'red'
    end
  );
end;
$$;
