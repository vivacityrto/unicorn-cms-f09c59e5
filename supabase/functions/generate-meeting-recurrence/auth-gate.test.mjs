import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// L10 #25: this function previously had no recognizable caller-auth gate at
// all and relied entirely on RLS. requireCaller must now run before any
// DB read/write, and OPTIONS must still be handled before the gate runs.
assert.match(source, /import \{ requireCaller, FeatureKeys \} from "\.\.\/_shared\/requireCaller\.ts"/);

const optionsIndex = source.indexOf("req.method === 'OPTIONS'");
const gateIndex = source.indexOf('requireCaller(req, FeatureKeys.staffMeetings)');
const meetingLookupIndex = source.indexOf(".from('eos_meetings')");
const recurrenceInsertIndex = source.indexOf(".from('eos_meeting_recurrences')");
const occurrencesInsertIndex = source.indexOf(".from('eos_meeting_occurrences')");

assert.ok(optionsIndex > -1, 'must handle CORS preflight OPTIONS requests');
assert.ok(gateIndex > -1, 'must call requireCaller with FeatureKeys.staffMeetings');
assert.ok(meetingLookupIndex > -1, 'must look up the meeting to confirm its real tenant_id');
assert.ok(recurrenceInsertIndex > -1, 'must insert into eos_meeting_recurrences');
assert.ok(occurrencesInsertIndex > -1, 'must insert into eos_meeting_occurrences');

assert.ok(optionsIndex < gateIndex, 'OPTIONS handling must run before the auth gate');
assert.ok(gateIndex < meetingLookupIndex, 'the auth gate must run before the tenant/meeting consistency check');
assert.ok(meetingLookupIndex < recurrenceInsertIndex, 'the meeting/tenant consistency check must run before any insert');
assert.ok(recurrenceInsertIndex < occurrencesInsertIndex, 'the recurrence insert must run before the occurrences insert');

// Cross-tenant reference guard: caller-supplied tenant_id must be checked
// against the meeting's actual tenant_id before any write, not trusted as-is.
assert.match(source, /meeting\.tenant_id !== requestData\.tenant_id/);

// RLS remains the real per-tenant/facilitator authorization boundary for the
// writes themselves — this function must keep using the forwarded caller JWT
// (anon key + Authorization header), not switch to a service-role client
// that would bypass the existing "Facilitators can manage" RLS policies.
assert.match(source, /Deno\.env\.get\('SUPABASE_ANON_KEY'\)/);
assert.ok(!source.includes('SUPABASE_SERVICE_ROLE_KEY'), 'must not switch the write path to a service-role client');

console.log('generate-meeting-recurrence auth-gate checks passed');
