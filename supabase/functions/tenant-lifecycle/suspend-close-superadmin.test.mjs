import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// suspend/close must be gated behind checkSuperAdmin, the same tier already
// enforced for archive and reactivate-from-archived in this file. Before
// this fix, staff.internal alone (held by every internal role — Team
// Member, CSC, BGT, CET, Integrator, Team Leader — not just Super Admin)
// was sufficient to suspend or close any tenant.
assert.match(
  source,
  /if \(action === "suspend" \|\| action === "close"\) \{\s*\n\s*if \(!checkSuperAdmin\(profile\)\)/,
  'suspend/close must require checkSuperAdmin',
);

// The new gate must run before the close-specific and simple-update code
// paths that actually mutate the tenant.
const gateIndex = source.indexOf('if (action === "suspend" || action === "close")');
const closeTransactionIndex = source.indexOf('executeCloseTransaction(req, supabase, tenant_id');
const simpleUpdateIndex = source.indexOf('.update(updatePayload)');
assert.ok(gateIndex > -1, 'suspend/close SuperAdmin gate must be present');
assert.ok(gateIndex < closeTransactionIndex, 'gate must run before executeCloseTransaction is called');
assert.ok(gateIndex < simpleUpdateIndex, 'gate must run before the simple-update tenant mutation');

// Archive and reactivate-from-archived precedent must still be intact.
assert.match(source, /Only SuperAdmin can reactivate archived tenants/);
assert.match(source, /Only SuperAdmin can archive tenants/);

console.log('tenant-lifecycle suspend/close SuperAdmin gate checks passed');
