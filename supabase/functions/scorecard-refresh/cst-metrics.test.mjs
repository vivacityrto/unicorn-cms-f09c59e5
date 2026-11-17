import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL('../../migrations/20261117100000_cst_scorecard_activity_report.sql', import.meta.url),
  'utf8',
);

// Every CST metric key the edge function resolves must be one the SQL
// function understands, and the other way round.
const keys = [
  'cst_client_activity_rate_pct',
  'cst_rtos_with_activity_pct',
  'cst_certificates_issued_count',
  'cst_users_never_signed_in_count',
  'cst_rtos_no_activity_count',
];
for (const key of keys) {
  assert.ok(source.includes(`case '${key}':`), `scorecard-refresh must resolve ${key}`);
  assert.ok(migration.includes(`'${key}'`), `get_cst_team_metric must handle ${key}`);
}
assert.match(source, /rpc\('get_cst_team_metric'/);

// A week with no snapshot must be skipped (null), never recorded as zero.
assert.match(source, /data === null \|\| data === undefined \? null : Number\(data\)/);
assert.match(migration, /HAVING count\(\*\) > 0/);

// The placeholder list must no longer claim these keys.
const placeholderIndex = source.indexOf('// Placeholder resolvers');
for (const key of keys) {
  assert.ok(source.indexOf(`case '${key}':`) < placeholderIndex, `${key} must not sit in the placeholder block`);
}

// The snapshot is keyed by Sunday, entries by Monday: the resolver must convert.
assert.match(source, /p_week_ending: snapshotWeekEnding\(weekEnding\)/);
assert.match(source, /from "\.\/weeks\.ts"/);

// System entries need a real auth user (entered_by is a foreign key), and a failed
// write must surface instead of being reported as a success.
assert.ok(!source.includes('00000000-0000-0000-0000-000000000000'), 'no placeholder user id');
assert.match(source, /SCORECARD_REFRESH_ACTOR_USER_ID/);
assert.match(source, /if \(insertError\) throw insertError;/);
assert.match(source, /if \(updateError\) throw updateError;/);

console.log('scorecard-refresh CST metric checks passed');
