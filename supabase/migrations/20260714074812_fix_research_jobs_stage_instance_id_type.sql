-- research-tas-context (TAS Context Assistant) was failing with a DB_ERROR
-- when creating a research_jobs row, because research_jobs.stage_instance_id
-- was typed uuid while every real stage identifier in this schema
-- (stage_instances.id, tas_context_briefs.stage_instance_id,
-- evidence_gap_checks, client_ai_sessions, stage_health_snapshots,
-- workflow_optimisation_signals, v_client_package_stages) is bigint.
-- research_jobs was the sole outlier — no FK depends on the old type, and
-- both existing rows have this column null, so this is a safe correction
-- rather than a breaking change.
alter table public.research_jobs
  alter column stage_instance_id type bigint using stage_instance_id::text::bigint;

comment on column public.research_jobs.stage_instance_id is
  'References stage_instances.id (bigint). Corrected from a prior uuid typo that broke research-tas-context job creation — see migration fix_research_jobs_stage_instance_id_type.';
