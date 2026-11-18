import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static checks on the migration that makes lifecycle active part of "Live Client".
const sql = readFileSync(new URL('../../migrations/20261118110000_cst_live_requires_active_lifecycle.sql', import.meta.url), 'utf8');
const down = readFileSync(new URL('../../migrations/rollback/20261118110000_cst_live_requires_active_lifecycle.down.sql', import.meta.url), 'utf8');

// Both functions that define Live carry the new condition, and nothing else widens the set.
const liveBlocks = sql.match(/WITH live AS \([\s\S]*?\n  \),/g) ?? [];
assert.equal(liveBlocks.length, 2);
for (const block of liveBlocks) {
  assert.match(block, /t\.status IN \('active', 'on_hold', 'In Arears', 'warning'\)/);
  assert.match(block, /t\.lifecycle_status = 'active'/);
  assert.match(block, /t\.archived_at IS NULL/);
  assert.match(block, /academy_solo/);
}

// Replaced in place: no DROP, same signatures, still SECURITY DEFINER with an empty search_path.
assert.ok(!/DROP FUNCTION/i.test(sql));
assert.equal((sql.match(/SECURITY DEFINER\s+SET search_path TO ''/g) ?? []).length, 2);
// Grants stay internal: service_role only.
assert.match(sql, /REVOKE ALL ON FUNCTION public\.cst_activity_stats\(timestamptz, timestamptz\) FROM PUBLIC, anon, authenticated/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.cst_last_activity\(\) FROM PUBLIC, anon, authenticated/);
assert.ok(!/GRANT EXECUTE[^;]*TO (anon|authenticated|PUBLIC)/i.test(sql));

// The rollback restores the earlier rule.
assert.ok(!/lifecycle_status\s*=/.test(down));
assert.match(down, /CREATE OR REPLACE FUNCTION public\.cst_activity_stats/);
assert.match(down, /CREATE OR REPLACE FUNCTION public\.cst_last_activity/);
console.log('cst live lifecycle checks passed');
