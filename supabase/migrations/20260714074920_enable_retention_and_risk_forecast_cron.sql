-- run-retention-forecast and run-tenant-risk-forecast are fully built,
-- self-contained (no external API keys needed — internal tables only)
-- edge functions that have never been scheduled. Both target tables
-- (tenant_retention_forecasts, tenant_risk_forecasts) are empty, 0 rows,
-- ever. Neither function upserts on (tenant_id, forecast_date) — they
-- plain .insert() — so a unique constraint is added first as a safety
-- guard against silent duplicate-day rows if a job is ever triggered
-- twice in the same day (manual test + cron, redeploy re-trigger, etc).

alter table public.tenant_retention_forecasts
  add constraint tenant_retention_forecasts_tenant_date_unique
  unique (tenant_id, forecast_date);

alter table public.tenant_risk_forecasts
  add constraint tenant_risk_forecasts_tenant_date_unique
  unique (tenant_id, forecast_date);

-- Schedule both nightly, staggered from the existing forecast/monitor jobs
-- (run-workload-forecast at 16:00, run-stage-health-monitor at 15:00) to
-- avoid overlapping load on the same active-tenants scan pattern.
select cron.schedule(
  'run-tenant-risk-forecast-nightly',
  '0 13 * * *',
  $cron$
    select net.http_post(
      url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/run-tenant-risk-forecast',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt()
      ),
      body := '{}'::jsonb
    ) as request_id;
  $cron$
);

select cron.schedule(
  'run-retention-forecast-nightly',
  '0 14 * * *',
  $cron$
    select net.http_post(
      url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/run-retention-forecast',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt()
      ),
      body := '{}'::jsonb
    ) as request_id;
  $cron$
);

comment on constraint tenant_retention_forecasts_tenant_date_unique on public.tenant_retention_forecasts is
  'Guards against duplicate same-day forecast rows now that run-retention-forecast is scheduled via cron (see enable_retention_and_risk_forecast_cron migration).';
comment on constraint tenant_risk_forecasts_tenant_date_unique on public.tenant_risk_forecasts is
  'Guards against duplicate same-day forecast rows now that run-tenant-risk-forecast is scheduled via cron (see enable_retention_and_risk_forecast_cron migration).';
