import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// This RPC writes unicorn1.users.mapped_user_uuid via a SECURITY DEFINER
// function reachable only from this function's service-role client (see
// supabase/migrations/20260909054500_revoke_public_execute_mark_unicorn1_user_mapped.sql),
// so the same FeatureKeys.adminUnicorn1 gate as search-unicorn1-users must
// run before the RPC call.
assert.match(source, /import \{ requireCaller, FeatureKeys \} from "\.\.\/_shared\/requireCaller\.ts"/);

const optionsIndex = source.indexOf('req.method === "OPTIONS"');
const gateIndex = source.indexOf('FeatureKeys.adminUnicorn1');
const rpcIndex = source.indexOf("rpc(\"mark_unicorn1_user_mapped\"");

assert.ok(optionsIndex > -1, 'must handle CORS preflight OPTIONS requests');
assert.ok(gateIndex > -1, 'must gate on FeatureKeys.adminUnicorn1');
assert.ok(rpcIndex > -1, 'must call the mark_unicorn1_user_mapped RPC');
assert.ok(optionsIndex < gateIndex, 'OPTIONS handling must run before the auth gate');
assert.ok(gateIndex < rpcIndex, 'the auth gate must run before the RPC write');

assert.match(source, /catch \(e: unknown\)/);

console.log('mark-unicorn1-user-mapped auth-gate checks passed');
