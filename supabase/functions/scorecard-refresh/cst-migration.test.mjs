import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static checks on the CST scorecard migration. The behaviour itself was
// verified against unicorn-qa; these keep the security shape from regressing.
const sql = readFileSync(
  new URL('../../migrations/20261117100000_cst_scorecard_activity_report.sql', import.meta.url),
  'utf8',
);

// Every function is SECURITY DEFINER with an empty search_path.
const defs = sql.match(/CREATE OR REPLACE FUNCTION public\.\w+/g) ?? [];
assert.equal(defs.length, 5, 'expected the five CST functions');
assert.equal((sql.match(/SECURITY DEFINER/g) ?? []).length, 5);
assert.equal((sql.match(/SET search_path TO ''/g) ?? []).length, 5);

// The report is the only function reachable by signed-in users, and it checks staff itself.
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_cst_report\(text, date\) TO authenticated, service_role/);
assert.match(sql, /IF auth\.uid\(\) IS NULL OR NOT public\.is_vivacity_team_safe\(auth\.uid\(\)\) THEN/);
for (const fn of ['cst_activity_stats(timestamptz, timestamptz)', 'snapshot_cst_week(date)', 'backfill_cst_snapshots(integer)', 'get_cst_team_metric(text, date)']) {
  assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated`), `${fn} must be revoked from client roles`);
  assert.ok(sql.includes(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role`), `${fn} must be granted to service_role only`);
}

// Snapshot table: RLS on, staff read policy, no client write grants.
assert.match(sql, /ALTER TABLE public\.cst_scorecard_weekly_snapshot ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /FOR SELECT TO authenticated\s+USING \(public\.is_vivacity_team_safe\(auth\.uid\(\)\)\)/);
assert.match(sql, /REVOKE ALL ON public\.cst_scorecard_weekly_snapshot FROM PUBLIC, anon, authenticated/);
assert.doesNotMatch(sql, /GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*cst_scorecard_weekly_snapshot[^;]*TO authenticated/);

// Definitions: Live Clients mirror Manage Tenants, and only self-enrolments count as activity.
assert.match(sql, /t\.status IN \('active', 'on_hold', 'In Arears', 'warning'\)/);
assert.match(sql, /t\.archived_at IS NULL/);
assert.match(sql, /academy_solo/);
assert.match(sql, /e\.metadata ->> 'source' = 'self_enrol'/);
// Staff-pushed documents and system events are not client activity, so they must not be in the event list.
assert.ok(!sql.includes('document_shared_to_client'));
assert.ok(!sql.includes("'auto_package'") || sql.includes('are excluded'), 'automatic enrolments must be documented as excluded');
assert.match(sql, /COALESCE\(u\.is_vivacity_internal, false\) = false/);
assert.match(sql, /COALESCE\(u\.archived, false\) = false/);
assert.match(sql, /c\.revoked_at IS NULL/);

// Snapshot weeks end on a Sunday that has finished.
assert.match(sql, /is not a Sunday/);
assert.match(sql, /has not ended yet/);

// The cron job is only created where pg_cron exists (it is not installed on unicorn-qa).
assert.match(sql, /IF EXISTS \(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'\)/);

console.log('CST scorecard migration checks passed');
