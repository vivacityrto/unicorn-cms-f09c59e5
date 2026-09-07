import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// requireCaller (Vivacity Team only, per FeatureKeys.adminSystemConfig) must
// gate every branch before any meeting_minutes/meeting_action_tasks read or
// write.
assert.match(source, /import \{ requireCaller, FeatureKeys \} from "\.\.\/_shared\/requireCaller\.ts"/);
assert.match(source, /featureKey: FeatureKeys\.adminSystemConfig/);

const optionsIndex = source.indexOf('req.method === "OPTIONS"');
const gateIndex = source.indexOf('requireCaller(req, supabase, {');
const minutesReadIndex = source.indexOf('.from("meeting_minutes")');

assert.ok(optionsIndex > -1, 'must handle CORS preflight OPTIONS requests');
assert.ok(gateIndex > -1, 'must call requireCaller');
assert.ok(minutesReadIndex > -1, 'must read meeting_minutes');
assert.ok(optionsIndex < gateIndex, 'OPTIONS handling must run before the auth gate');
assert.ok(gateIndex < minutesReadIndex, 'the auth gate must run before reading meeting_minutes');

// The minutes.content JSON blob's `actions[]` lookup must be typed rather
// than an untyped `any` callback parameter.
assert.match(source, /interface MinutesContentAction/);
assert.match(source, /interface MinutesContent/);
assert.match(source, /const content: MinutesContent/);
assert.match(source, /content\.actions\.find\(\(a\) => a\.action_id === ct\.action_id\)/);
assert.ok(!source.includes('(a: any)'), 'must not use an untyped any callback parameter');

console.log('create-tasks-from-minutes auth-gate checks passed');
