import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

assert.match(source, /SELF_DELETE_FORBIDDEN/);
assert.match(source, /LAST_ADMIN_FORBIDDEN/);
assert.match(source, /from\("tenant_members"\)/);
assert.match(source, /AUDIT_WRITE_FAILED/);
assert.ok(source.indexOf('AUDIT_WRITE_FAILED') < source.indexOf('auth\.admin\.deleteUser'));

console.log('delete-user safeguard checks passed');
