import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// Had no auth check at all until a prior fix (see the header comment in
// index.ts) — an unauthenticated caller could supply an arbitrary
// tenantId + rtoId and overwrite that tenant's live TGA scope/contacts/
// addresses with data fetched for a caller-chosen RTO. requireCaller must
// gate the request before any DB read/write, and the tenant-access
// fallback must check the ACTUAL target tenant, not just a broad role.
assert.match(source, /import \{ requireCaller, FeatureKeys \} from "\.\.\/_shared\/requireCaller\.ts"/);
assert.match(source, /featureKey: FeatureKeys\.staffTga/);
assert.match(source, /hasTenantAccessSafe\(admin, userId, tenantIdNum\)/);

const optionsIndex = source.indexOf("req.method === 'OPTIONS'");
const gateIndex = source.indexOf('requireCaller(req, supabaseAdmin, {');
const firstJobInsertIndex = source.indexOf(".from('tga_rest_sync_jobs').insert(");

assert.ok(optionsIndex > -1, 'must handle CORS preflight OPTIONS requests');
assert.ok(gateIndex > -1, 'must call requireCaller');
assert.ok(firstJobInsertIndex > -1, 'must create a tga_rest_sync_jobs row');
assert.ok(optionsIndex < gateIndex, 'OPTIONS handling must run before the auth gate');
assert.ok(gateIndex < firstJobInsertIndex, 'the auth gate must run before any DB read/write');

// Phase 2.6 P5-A: this file's 43 no-explicit-any findings were retired by
// modelling the actual TGA scope-item and organisation-details shapes
// instead of using `any` — assert the interfaces exist and no `any`
// annotation crept back in.
assert.match(source, /interface TgaScopeItem/);
assert.match(source, /interface TgaOrgData/);
assert.match(source, /interface TgaStagingRow/);
assert.ok(!/:\s*any\b/.test(source), 'must not reintroduce an explicit any type annotation');
assert.ok(!/as any\b/.test(source), 'must not reintroduce an any cast');

console.log('tga-rto-sync auth-gate and typing checks passed');
