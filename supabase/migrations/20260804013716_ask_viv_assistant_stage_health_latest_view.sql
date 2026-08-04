-- Latest stage_health_snapshots row per stage_instance_id.
--
-- stage_health_snapshots accumulates one row per stage instance per
-- generation run (220k+ rows, ~4,100 distinct stage_instance_id values) —
-- callers that want *current* health, not history, need the latest row per
-- instance, and Supabase's PostgREST client has no DISTINCT ON support.
-- Built for Ask Viv Assistant's get_stage_health_hotspots tool, but generally
-- useful anywhere "current" stage health is needed without pulling the full
-- history table.
create or replace view public.v_stage_health_latest as
select distinct on (stage_instance_id)
  stage_instance_id,
  tenant_id,
  health_status,
  progress_percentage,
  tasks_open_count,
  tasks_overdue_count,
  high_risk_count,
  evidence_gap_mandatory_count,
  days_since_last_activity,
  generated_at
from public.stage_health_snapshots
order by stage_instance_id, generated_at desc;

comment on view public.v_stage_health_latest is
  'Latest stage_health_snapshots row per stage_instance_id — current health only, not the full history. Read via service-role callers (e.g. ask-viv-assistant); not RLS-gated separately since it inherits stage_health_snapshots access.';
