import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// requireCaller must gate every insert/update, and OPTIONS must be handled
// before the gate runs.
assert.match(source, /import \{ FeatureKeys, requireCaller \} from "\.\.\/_shared\/requireCaller\.ts"/);

const optionsIndex = source.indexOf('req.method === "OPTIONS"');
const gateIndex = source.indexOf('requireCaller(req, admin, {');
const clientAuditsIndex = source.indexOf('.from("client_audits")');

assert.ok(optionsIndex > -1, 'must handle CORS preflight OPTIONS requests');
assert.ok(gateIndex > -1, 'must call requireCaller');
assert.ok(clientAuditsIndex > -1, 'must insert into client_audits');
assert.ok(optionsIndex < gateIndex, 'OPTIONS handling must run before the auth gate');
assert.ok(gateIndex < clientAuditsIndex, 'the auth gate must run before the client_audits insert');

// The linked_stage_instance_id path must verify the stage instance's
// package actually belongs to the audited tenant before accepting the link
// (cross-tenant reference guard).
assert.match(source, /\.eq\("tenant_id", subject_tenant_id\)/);

// The background audit-intelligence-pack kickoff must use the typed
// EdgeRuntime global pattern shared across this repo's Edge Functions, not
// an untyped `any` cast.
assert.match(source, /globalThis as unknown as \{/);
assert.match(source, /EdgeRuntime\?: \{ waitUntil\?: \(p: Promise<unknown>\) => void \};/);
assert.ok(!source.includes('(globalThis as any)'), 'must not cast globalThis to any');

console.log('create-client-audit auth-gate checks passed');
