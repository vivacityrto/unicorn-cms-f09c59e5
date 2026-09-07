import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// The Supabase client parameter previously used a locally-declared `any`
// alias (`type SupabaseClientAny = any`) instead of the real supabase-js
// type. This must now match the untyped-but-real `SupabaseClient` import
// pattern used elsewhere in supabase/functions/_shared (e.g.
// emit-timeline-event.ts, auth-helpers.ts).
assert.match(source, /import \{ createClient, SupabaseClient \} from "https:\/\/esm\.sh\/@supabase\/supabase-js@2\.49\.4"/);
assert.ok(!source.includes('SupabaseClientAny'), 'must not keep the retired any-alias type name');
assert.ok(!source.includes('type SupabaseClientAny'), 'must not redeclare an any-typed client alias');

const supabaseParamMatches = source.match(/supabase: SupabaseClient,/g) || [];
assert.ok(supabaseParamMatches.length >= 6, 'every helper function must type its supabase parameter as SupabaseClient');

// Status/health check branch (no auth required) must remain distinct from
// the authenticated import branches — this test only asserts the typing
// change didn't collapse or remove that branch.
assert.match(source, /Status\/health check \(no auth required\)/);

console.log('tga-rto-import supabase-client typing checks passed');
