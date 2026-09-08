import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// This endpoint inserts rows into `packages` (a shared, tenant-agnostic
// table) with no per-tenant scoping, so it must be gated to Super Admin
// only, and that gate must run before any DB read/write.
assert.match(source, /import \{ requireSuperAdmin \} from '\.\.\/_shared\/requireCaller\.ts'/);

const optionsIndex = source.indexOf("req.method === 'OPTIONS'");
const gateIndex = source.indexOf('requireSuperAdmin(req)');
const firstDbCallIndex = source.indexOf(".from('packages')");

assert.ok(optionsIndex > -1, 'must handle CORS preflight OPTIONS requests');
assert.ok(gateIndex > -1, 'must call requireSuperAdmin');
assert.ok(firstDbCallIndex > -1, 'must query the packages table');
assert.ok(optionsIndex < gateIndex, 'OPTIONS handling must run before the auth gate');
assert.ok(gateIndex < firstDbCallIndex, 'the auth gate must run before any DB read/write');

// The error branch must preserve message-bearing PostgREST result errors
// without leaking an untyped `any` value directly.
assert.match(source, /catch \(error: unknown\)/);
assert.match(source, /getErrorMessage\(error, String\(error\)\)/);

console.log('add-missing-packages auth-gate checks passed');
