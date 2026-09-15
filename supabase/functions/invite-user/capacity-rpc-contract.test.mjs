import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// The capacity function is intentionally one-argument and derives auth.uid()
// from the caller JWT. Invitation writes still use the service-role client,
// but this authorization-sensitive read must use the validated caller session.
assert.match(source, /createUserClient\s*\}\s*from\s*"\.\.\/_shared\/supabase-client\.ts"/);
assert.match(source, /const callerScoped = createUserClient\(req\.headers\.get\("Authorization"\)\)/);
assert.match(source, /callerScoped\.rpc\(\s*['"]get_tenant_user_capacity['"]\s*,\s*\{\s*p_tenant_id:\s*payload\.tenant_id\s*,?\s*\},?\s*\)/s);
assert.doesNotMatch(source, /get_tenant_user_capacity['"]\s*,[\s\S]{0,300}p_caller_id/);

console.log('invite-user capacity RPC contract checks passed');
