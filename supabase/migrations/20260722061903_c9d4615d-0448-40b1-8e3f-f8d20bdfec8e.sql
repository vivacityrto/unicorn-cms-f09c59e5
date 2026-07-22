-- Reconcile L1/L3: drop stale backfill table, lock down cron.job_run_details
DROP TABLE IF EXISTS public._tenant_users_contact_backfill_20260512;
REVOKE SELECT ON TABLE cron.job_run_details FROM PUBLIC, anon, authenticated;