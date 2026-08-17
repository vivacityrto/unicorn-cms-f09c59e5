import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('./20260817093000_fix_eos_role_helper_text_comparison.sql', import.meta.url),
  'utf8',
);

assert.match(sql, /CREATE OR REPLACE FUNCTION public\.has_eos_role\(/);
assert.match(sql, /role\s*=\s*_role::text/);
assert.doesNotMatch(sql, /role\s*=\s*_role\s*(?:\n|\))/);
assert.match(sql, /GRANT EXECUTE[\s\S]*TO authenticated, service_role/);

console.log('EOS role helper migration checks passed');
