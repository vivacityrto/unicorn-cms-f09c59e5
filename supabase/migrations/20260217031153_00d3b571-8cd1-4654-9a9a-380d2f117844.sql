
-- Phase A: Idempotent seeding function
create or replace function public.seed_compliance_task_instances()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.compliance_task_instances (
    tenant_id,
    requirement_id,
    due_at
  )
  select
    e.tenant_id,
    e.requirement_id,
    e.calculated_due_at
  from public.v_compliance_task_requirements_expanded e
  left join public.compliance_task_instances i
    on i.tenant_id = e.tenant_id
   and i.requirement_id = e.requirement_id
  where i.id is null;

  get diagnostics inserted_count = row_count;

  return inserted_count;
end;
$$;

-- Phase B: Audit-logged wrapper using system_job_runs
create or replace function public.run_seed_compliance_tasks_job()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
  v_run_id uuid;
begin
  insert into public.system_job_runs (job_name, run_type, status, started_at)
  values ('seed_compliance_tasks', 'scheduled', 'running', now())
  returning id into v_run_id;

  v_inserted := public.seed_compliance_task_instances();

  update public.system_job_runs
  set status = 'success',
      finished_at = now(),
      summary = v_inserted || ' rows inserted',
      details_json = jsonb_build_object('inserted_rows', v_inserted)
  where id = v_run_id;

exception when others then
  update public.system_job_runs
  set status = 'failed',
      finished_at = now(),
      summary = 'Error: ' || sqlerrm,
      details_json = jsonb_build_object('error', sqlerrm, 'sqlstate', sqlstate)
  where id = v_run_id;

  raise;
end;
$$;

-- Phase C: Nightly cron at 2am UTC
select cron.schedule(
  'seed-compliance-tasks-nightly',
  '0 2 * * *',
  $$ select public.run_seed_compliance_tasks_job(); $$
);

-- Phase E: Restrict public access
revoke all on function public.seed_compliance_task_instances() from public;
grant execute on function public.seed_compliance_task_instances() to authenticated;

revoke all on function public.run_seed_compliance_tasks_job() from public;
grant execute on function public.run_seed_compliance_tasks_job() to authenticated;
