/**
 * generate-ask-viv-faqs
 *
 * Mines real staff usage of Ask Viv Assistant into a handful of suggested
 * FAQ-style prompts, shown as clickable chips in the empty state of both
 * the full page and the floating widget. Reads every ask_viv_turns row with
 * role='user' and mode='assistant' across ALL staff — not scoped to one
 * user, since the point is cross-team usage patterns — and asks Haiku to
 * cluster them into representative, rephrased prompts. Truncate-and-replace
 * on each run into ask_viv_suggested_faqs; there's no history value in a
 * stale clustering once a fresher one exists.
 *
 * Cron-only by default (empty body, daily). An ad-hoc `{ force: true }` call
 * requires a real Super Admin JWT, for testing without waiting on the cron
 * schedule — mirrors the embed-ask-viv-corpus ad-hoc/steady-state split.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { callAnthropicHaiku, extractText } from '../_shared/anthropic-client.ts';

const MIN_TURNS_REQUIRED = 5;
const MAX_TURNS_SAMPLED = 500;
const TARGET_FAQ_COUNT = 8;

function json(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

interface RawFaq {
  prompt: string;
  category: string;
  occurrence_count: number;
}

function parseFaqJson(text: string): RawFaq[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
  return parsed
    .filter((f: any) => f && typeof f.prompt === 'string' && f.prompt.trim().length > 0)
    .map((f: any) => ({
      prompt: String(f.prompt).trim(),
      category: typeof f.category === 'string' && f.category.trim() ? f.category.trim() : 'General',
      occurrence_count: Number.isFinite(f.occurrence_count) ? Math.max(1, Math.round(f.occurrence_count)) : 1,
    }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let body: { force?: boolean } = {};
  try {
    if (req.headers.get('content-length') && req.headers.get('content-length') !== '0') {
      body = await req.json();
    }
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400);
  }

  if (body.force) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(req, { error: 'Missing authorisation header' }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json(req, { error: 'Not authenticated' }, 401);
    const { data: callerRow } = await userClient
      .from('users')
      .select('unicorn_role')
      .eq('user_uuid', userRes.user.id)
      .maybeSingle();
    if (callerRow?.unicorn_role !== 'Super Admin') {
      return json(req, { error: 'Super Admin role required for ad-hoc trigger' }, 403);
    }
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: turns, error: turnsErr } = await admin
    .from('ask_viv_turns')
    .select('content, created_at')
    .eq('role', 'user')
    .eq('mode', 'assistant')
    .order('created_at', { ascending: false })
    .limit(MAX_TURNS_SAMPLED);

  if (turnsErr) {
    return json(req, { error: `Failed to load ask_viv_turns: ${turnsErr.message}` }, 500);
  }

  const questions = (turns || []).map((t) => t.content.trim()).filter((c) => c.length > 0);

  if (questions.length < MIN_TURNS_REQUIRED) {
    return json(req, 
      {
        ok: true,
        skipped: true,
        reason: `Only ${questions.length} real staff question(s) so far, need at least ${MIN_TURNS_REQUIRED}`,
      },
      200
    );
  }

  const clusterPrompt =
    `Here are ${questions.length} real questions asked by internal RTO compliance-consulting staff to an internal AI ` +
    `assistant (Ask Viv), covering client status, deadlines, workload, documents, and Standards/EOS content:\n\n` +
    questions.map((q, i) => `${i + 1}. ${q}`).join('\n') +
    `\n\nCluster these into the ${TARGET_FAQ_COUNT} most common distinct question PATTERNS (not verbatim duplicates). For each pattern:\n` +
    `- Write ONE well-phrased, generalized prompt a staff member could click to ask it themselves. Replace any specific ` +
    `client/tenant names with the placeholder "[Client Name]" when the pattern is about looking up one specific client; keep it ` +
    `phrased as a genuinely portfolio-wide question when the pattern already is one (e.g. "who needs the most attention right now").\n` +
    `- Give it a short category label (e.g. "Client status", "Deadlines & overdue work", "Workload", "Documents & templates", "Standards & compliance").\n` +
    `- Count how many of the questions above map to this pattern, as occurrence_count.\n\n` +
    `Output ONLY a JSON array, ranked by occurrence_count descending, no preamble, no markdown fences, shaped exactly like:\n` +
    `[{"prompt": "...", "category": "...", "occurrence_count": 3}]`;

  let faqs: RawFaq[];
  try {
    const resp = await callAnthropicHaiku({
      system:
        'You cluster real user questions into representative FAQ prompts. Output strictly valid JSON only — no prose, no markdown code fences.',
      messages: [{ role: 'user', content: clusterPrompt }],
      max_tokens: 2048,
    });
    faqs = parseFaqJson(extractText(resp));
  } catch (err) {
    return json(req, { error: `FAQ clustering failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }

  if (faqs.length === 0) {
    return json(req, { ok: true, skipped: true, reason: 'Haiku returned no usable FAQ clusters' }, 200);
  }

  const ranked = faqs
    .sort((a, b) => b.occurrence_count - a.occurrence_count)
    .slice(0, TARGET_FAQ_COUNT)
    .map((f, idx) => ({ ...f, rank: idx + 1 }));

  const { error: delErr } = await admin.from('ask_viv_suggested_faqs').delete().gte('rank', 0);
  if (delErr) {
    return json(req, { error: `Failed to clear old FAQs: ${delErr.message}` }, 500);
  }

  const { error: insErr } = await admin.from('ask_viv_suggested_faqs').insert(
    ranked.map((f) => ({
      prompt_text: f.prompt,
      category: f.category,
      occurrence_count: f.occurrence_count,
      rank: f.rank,
    }))
  );
  if (insErr) {
    return json(req, { error: `Failed to insert new FAQs: ${insErr.message}` }, 500);
  }

  return json(req, { ok: true, questions_sampled: questions.length, faqs_generated: ranked.length }, 200);
});
