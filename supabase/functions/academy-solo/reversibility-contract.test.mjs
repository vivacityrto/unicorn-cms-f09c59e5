import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../migrations/20260915040000_academy_solo_reversibility_and_invite_capacity_fix.sql', import.meta.url), 'utf8');

assert.match(migration, /WHEN p_is_solo_pilot THEN 1\s+WHEN v_has_restore_cap THEN v_restore_max_users\s+ELSE p_max_users/s);
assert.match(migration, /'previous_max_users'/);
assert.match(migration, /v_metadata\s*-\s*'academy_solo'/);
assert.doesNotMatch(migration, /COALESCE\(metadata,\s*'\{\}'::jsonb\)\s*\?\s*'academy_solo'\s*THEN\s*1/);

console.log('Academy Solo reversibility contract checks passed');
