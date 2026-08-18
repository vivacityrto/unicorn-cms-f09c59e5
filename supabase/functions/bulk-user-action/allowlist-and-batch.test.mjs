import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// Runtime role allowlist: the TS union type on the request body only
// constrains the compiler, not an actual JSON payload. Without a runtime
// check, change_role would accept any string the users.unicorn_role FK
// permits (e.g. "Super Admin", "Team Leader") and grant a client tenant
// user internal Vivacity staff privileges.
assert.match(source, /const ALLOWED_ROLES = new Set\(\['Admin', 'General User'\]\)/);
assert.match(source, /INVALID_ROLE/);
const roleCheckIndex = source.indexOf('!ALLOWED_ROLES.has(role)');
const roleUpdateIndex = source.indexOf('.update({ unicorn_role: role');
assert.ok(roleCheckIndex > -1, 'role allowlist check must be present');
assert.ok(roleCheckIndex < roleUpdateIndex, 'role allowlist check must run before the unicorn_role update');

// All-or-nothing: every requested user_uuid must resolve to a real user
// before the batch mutation (activate/deactivate/change_role) runs.
assert.match(source, /UNKNOWN_TARGET_USERS/);
const missingCheckIndex = source.indexOf('missingUuids.length > 0');
const batchDispatchIndex = source.indexOf("if (action === 'activate' || action === 'deactivate')");
assert.ok(missingCheckIndex > -1, 'missing-target-user check must be present');
assert.ok(missingCheckIndex < batchDispatchIndex, 'missing-target-user check must run before any batch action executes');

console.log('bulk-user-action role allowlist + all-or-nothing checks passed');
