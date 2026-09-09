import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// Manual auth pattern (predates the shared requireCaller helper, see
// AGENTS.md's Edge Function guardrails): Authorization header -> getUser ->
// check_permission RPC, all before body parsing or any per-tenant work.
const optionsIndex = source.indexOf('req.method === "OPTIONS"');
const authHeaderIndex = source.indexOf('req.headers.get("Authorization")');
const getUserIndex = source.indexOf('supabase.auth.getUser(callerToken)');
const permissionRpcIndex = source.indexOf("supabase.rpc('check_permission'");
const bodyParseIndex = source.indexOf('await req.json()');

assert.ok(optionsIndex > -1, 'must handle CORS preflight OPTIONS requests');
assert.ok(authHeaderIndex > -1, 'must read the Authorization header');
assert.ok(getUserIndex > -1, 'must authenticate the caller via supabase.auth.getUser');
assert.ok(permissionRpcIndex > -1, 'must check admin.invites.manage permission');
assert.ok(bodyParseIndex > -1, 'must parse the request body');

assert.ok(optionsIndex < authHeaderIndex, 'OPTIONS handling must run before reading the Authorization header');
assert.ok(authHeaderIndex < getUserIndex, 'the Authorization header must be read before authenticating');
assert.ok(getUserIndex < permissionRpcIndex, 'the caller must be authenticated before the permission check');
assert.ok(permissionRpcIndex < bodyParseIndex, 'the permission check must run before parsing the request body');

// Every tenant_id in the batch must pass a per-tenant access check, not just
// the top-level caller permission.
assert.match(source, /hasTenantAccessSafe\(supabase, callerUser\.user\.id, tenant_id\)/);

// The per-tenant unhandled-error branch must narrow via `instanceof Error`
// rather than an untyped `any` catch value.
assert.match(source, /catch \(e: unknown\)/);
assert.match(source, /e instanceof Error/);

// L10 #28 regression guard: jsonResponse(req, status, body) requires `req`
// as its first argument — corsHeaders(req) inside it calls req.headers.get(),
// so any call site that omits `req` (shifting status into the `req` slot,
// e.g. the historical `jsonResponse(422, {...})`) throws a TypeError instead
// of returning the intended structured error response. Every call site must
// start with `req,`, and none may start with a bare numeric status code.
const jsonResponseCalls = [...source.matchAll(/(?<!function )jsonResponse\(\s*([^,]+),/g)].map((m) => m[1].trim());
assert.ok(jsonResponseCalls.length > 0, 'must find at least one jsonResponse( call site to check');
for (const firstArg of jsonResponseCalls) {
  assert.equal(firstArg, 'req', `jsonResponse(...) call must pass req as its first argument, found "${firstArg}"`);
}

console.log('bulk-send-invitations auth-gate checks passed');
