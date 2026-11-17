import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../../migrations/20261117130000_scorecard_refresh_weekly_cron.sql', import.meta.url),
  'utf8',
);
const snapshotSql = readFileSync(
  new URL('../../migrations/20261117100000_cst_scorecard_activity_report.sql', import.meta.url),
  'utf8',
);

// One weekly job, replaced in place so re-applying never creates a second.
assert.match(sql, /cron\.unschedule\(jobid\) FROM cron\.job WHERE jobname = 'scorecard-refresh-weekly'/);
assert.match(sql, /'scorecard-refresh-weekly',\s*'0 17 \* \* 0'/);

// It must run after the CST snapshot job that feeds the CST metrics.
const snapshotCron = snapshotSql.match(/'cst-scorecard-weekly-snapshot',\s*'(\d+) (\d+) \* \* 0'/);
const refreshCron = sql.match(/'scorecard-refresh-weekly',\s*'(\d+) (\d+) \* \* 0'/);
assert.ok(snapshotCron && refreshCron, 'both schedules found');
const minutes = (m) => Number(m[2]) * 60 + Number(m[1]);
assert.ok(minutes(refreshCron) > minutes(snapshotCron), 'refresh must be scheduled after the snapshot');

// Same auth as the other cron-only functions, with secrets read from vault helpers, never inlined.
assert.match(sql, /'Authorization', 'Bearer ' \|\| private\.cron_function_jwt\(\)/);
assert.match(sql, /'x-cron-invoke-secret', private\.cron_invoke_secret\(\)/);
assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{10,}/, 'no inlined JWT');

// Production function, the Vivacity tenant, and a real user to record entries against.
assert.match(sql, /yxkgdalkbrriasiyyrwk\.supabase\.co\/functions\/v1\/scorecard-refresh/);
assert.match(sql, /jsonb_build_object\('tenant_id', 6372, 'actor_user_id', %L\)/);
assert.match(sql, /RAISE EXCEPTION 'No active user to record scorecard system entries against'/);

console.log('scorecard-refresh weekly cron migration checks passed');
