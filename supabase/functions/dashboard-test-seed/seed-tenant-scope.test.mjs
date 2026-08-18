import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// This endpoint fabricates critical/high-severity risk_events, alerts, and
// notes. It previously targeted "the first 3 active tenants" system-wide,
// which could be real production client tenants. It must now require an
// explicit operator-configured allowlist and refuse to run without one.
assert.match(source, /TEST_SEED_TENANT_IDS/);
assert.match(source, /function seedTenantAllowlist/);

const allowlistCheckIndex = source.indexOf('allowlist.size < 3');
const tenantQueryIndex = source.indexOf('.in("id", [...allowlist])');
const oldUnscopedQuery = /\.eq\("status", "active"\)\s*\n\s*\.limit\(3\)/;

assert.ok(allowlistCheckIndex > -1, 'must refuse to run without a configured seed tenant allowlist');
assert.ok(tenantQueryIndex > -1, 'tenant query must be restricted to the configured allowlist');
assert.ok(allowlistCheckIndex < tenantQueryIndex, 'the allowlist guard must run before the tenant query');
assert.ok(
  !oldUnscopedQuery.test(source),
  'must not query active tenants without an .in(allowlist) restriction',
);

console.log('dashboard-test-seed seed-tenant scope checks passed');
