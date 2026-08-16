/**
 * retrieve-srto-context
 *
 * Caller-JWT semantic retrieval over the SRTO 2025 corpus. Embeds the
 * incoming query via OpenAI direct (text-embedding-3-small, 1536 dims) and
 * calls the security-invoker `match_srto_chunks` RPC, which enforces RLS
 * against `srto_corpus` (any signed-in Vivacity user with a `users` row).
 *
 * Input:
 *   {
 *     query:         string  (5..4000 chars),
 *     top_k?:        number  (1..20, default 8),
 *     threshold?:    number  (0..1, default 0.5),
 *     source_type?:  'outcome_standards' | 'compliance_requirements'
 *                  | 'credential_policy' | 'practice_guide'
 *                  | 'national_code' | 'cricos_practice_guide' | 'esos_act',
 *     clause?:       string,
 *     framework?:    'SRTO_2025' | 'NATIONAL_CODE_2018' | 'ESOS_ACT_2000'
 *   }
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

import { generateEmbedding } from '../_shared/openai-embeddings.ts';

// Default similarity threshold. Lowered from 0.7 to 0.5 so downstream
// consumers (Ask Viv, Wave 3 finding draft, Wave 4 #2 exec summary) get
// non-empty retrieval without each one having to pass an override.
const DEFAULT_THRESHOLD = 0.5;

const VALID_SOURCE_TYPES = new Set([
  'outcome_standards',
  'compliance_requirements',
  'credential_policy',
  'practice_guide',
  'national_code',
  'cricos_practice_guide',
  'esos_act',
]);

const VALID_FRAMEWORKS = new Set(['SRTO_2025', 'NATIONAL_CODE_2018', 'ESOS_ACT_2000']);

function json(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  const t0 = Date.now();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(req, { error: 'Missing authorisation header' }, 401);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    return json(req, { error: 'OPENAI_API_KEY is not configured in edge function secrets' }, 500);
  }

  // Caller-JWT client. RLS via match_srto_chunks (security invoker).
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  // Verify the JWT resolves to a real auth user (cheap sanity check;
  // the RPC will additionally fail if the user has no `users` row).
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) {
    return json(req, { error: 'Not authenticated' }, 401);
  }

  // Parse + validate body.
  let body: {
    query?: unknown;
    top_k?: unknown;
    threshold?: unknown;
    source_type?: unknown;
    clause?: unknown;
    framework?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400);
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (query.length < 5 || query.length > 4000) {
    return json(req, { error: 'query must be a string of 5..4000 characters' }, 400);
  }

  let topK = 8;
  if (body.top_k !== undefined) {
    const n = Number(body.top_k);
    if (!Number.isFinite(n) || n < 1 || n > 20) {
      return json(req, { error: 'top_k must be 1..20' }, 400);
    }
    topK = Math.floor(n);
  }

  let threshold = DEFAULT_THRESHOLD;
  if (body.threshold !== undefined) {
    const n = Number(body.threshold);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      return json(req, { error: 'threshold must be 0..1' }, 400);
    }
    threshold = n;
  }

  let sourceType: string | null = null;
  if (body.source_type !== undefined && body.source_type !== null) {
    if (typeof body.source_type !== 'string' || !VALID_SOURCE_TYPES.has(body.source_type)) {
      return json(req, { error: 'source_type invalid' }, 400);
    }
    sourceType = body.source_type;
  }

  let clause: string | null = null;
  if (body.clause !== undefined && body.clause !== null) {
    if (typeof body.clause !== 'string' || body.clause.length > 32) {
      return json(req, { error: 'clause invalid' }, 400);
    }
    clause = body.clause;
  }

  let framework: string | null = null;
  if (body.framework !== undefined && body.framework !== null) {
    if (typeof body.framework !== 'string' || !VALID_FRAMEWORKS.has(body.framework)) {
      return json(req, { error: 'framework invalid' }, 400);
    }
    framework = body.framework;
  }

  // Embed the query via OpenAI direct.
  let embedding: number[];
  const embedTokens = Math.ceil(query.length / 4);
  try {
    embedding = await generateEmbedding(query);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Embedding fetch failed', msg);
    if (/\b429\b/.test(msg)) {
      return json(req, { error: 'Rate limit exceeded, please try again shortly.' }, 429);
    }
    if (/\b402\b/.test(msg)) {
      return json(req, { error: 'OpenAI credits exhausted or quota exceeded.' }, 402);
    }
    return json(req, { error: 'Failed to embed query', detail: msg }, 502);
  }

  // Call the RPC.
  const { data: results, error: rpcErr } = await supabase.rpc('match_srto_chunks', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: topK,
    filter_source_type: sourceType,
    filter_clause: clause,
    filter_framework: framework,
  });

  if (rpcErr) {
    console.error('match_srto_chunks RPC failed', rpcErr.message);
    return json(req, { error: 'Retrieval failed', detail: rpcErr.message }, 500);
  }

  return json(req, 
    {
      query,
      top_k: topK,
      threshold,
      framework,
      results: results ?? [],
      embedding_tokens: embedTokens,
      duration_ms: Date.now() - t0,
    },
    200,
  );
});
