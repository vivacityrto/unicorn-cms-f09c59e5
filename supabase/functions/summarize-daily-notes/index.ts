// Summarise a user's daily notes across a Day / Week / Month period.
// - Verifies caller JWT in-code (verify_jwt=false in config).
// - Best-effort in-process daily cap per user.
// - Calls Anthropic Sonnet through the shared server-side client; returns
//   { headline, summary, open_count }.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  callAnthropic,
  CLAUDE_SONNET_MODEL,
  extractText,
} from '../_shared/anthropic-client.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DAILY_CAP = 20;
const MAX_DIGEST_BYTES = 60 * 1024;

interface CapEntry { count: number; resetsAt: number; }
const capMap = new Map<string, CapEntry>();

function checkCap(userId: string): { ok: boolean; hoursLeft: number } {
  const now = Date.now();
  const entry = capMap.get(userId);
  if (!entry || entry.resetsAt <= now) {
    capMap.set(userId, { count: 1, resetsAt: now + 24 * 60 * 60 * 1000 });
    return { ok: true, hoursLeft: 24 };
  }
  if (entry.count >= DAILY_CAP) {
    return { ok: false, hoursLeft: Math.max(1, Math.ceil((entry.resetsAt - now) / 3_600_000)) };
  }
  entry.count += 1;
  return { ok: true, hoursLeft: Math.ceil((entry.resetsAt - now) / 3_600_000) };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractJson(text: string): unknown | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence ? fence[1] : text).trim();
  try { return JSON.parse(raw); } catch { /* fall through */ }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* ignore */ }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.slice('Bearer '.length);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const callerId = claimsData.claims.sub as string;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const userId = String(body?.user_id ?? '');
  const periodLabel = String(body?.period_label ?? '').slice(0, 200);
  const periodStart = String(body?.period_start ?? '');
  const periodEnd = String(body?.period_end ?? '');
  const digest = String(body?.digest ?? '');

  if (!userId || !periodLabel || !periodStart || !periodEnd || !digest.trim()) {
    return json({ error: 'Missing required fields' }, 400);
  }
  if (userId !== callerId) {
    return json({ error: 'Forbidden' }, 403);
  }
  if (new TextEncoder().encode(digest).byteLength > MAX_DIGEST_BYTES) {
    return json({ error: 'Digest too large' }, 413);
  }

  const cap = checkCap(callerId);
  if (!cap.ok) {
    return json(
      { error: `Daily summary limit reached. Resets in ${cap.hoursLeft} hours.`, cap: DAILY_CAP },
      429,
    );
  }

  const system = [
    'You summarise a user\'s personal daily task notes for a selected period.',
    'Write in Australian English. Be specific, concrete, and concise.',
    'Cover: what got done, what is still open, and any reflective/free-text observations.',
    'Do not invent items that are not in the digest. Do not include dates in the headline.',
    'Return JSON only, matching the schema exactly. No preamble, no markdown fences.',
    'Schema: { "headline": string (max 80 chars), "summary": string (2-6 short paragraphs, plain text with \\n between paragraphs), "open_count": integer >= 0 }',
  ].join(' ');

  const user = [
    `Period: ${periodLabel} (${periodStart} to ${periodEnd}).`,
    'Digest of notes for this period follows. Lines beginning with "- [x]" are completed items; "- [ ]" are open items.',
    '',
    digest,
  ].join('\n');

  let content: string;
  try {
    const response = await callAnthropic({
      model: CLAUDE_SONNET_MODEL,
      system,
      messages: [{ role: 'user', content: user }],
      max_tokens: 1400,
      temperature: 0.2,
    });

    content = extractText(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Anthropic summary request failed', message.slice(0, 500));
    if (/\b(429|529)\b/.test(message)) {
      return json({ error: 'Anthropic rate limit reached. Please try again shortly.' }, 429);
    }
    return json({ error: 'Anthropic summary service unavailable.' }, 502);
  }

  const parsed = extractJson(content);
  if (!parsed || typeof parsed !== 'object') {
    return json({ error: 'AI returned an invalid response' }, 502);
  }
  const p = parsed as Record<string, unknown>;
  const headline = typeof p.headline === 'string' ? p.headline.slice(0, 200) : 'Notes summary';
  const summary = typeof p.summary === 'string' ? p.summary : '';
  const openCount = typeof p.open_count === 'number' && Number.isFinite(p.open_count)
    ? Math.max(0, Math.floor(p.open_count))
    : 0;

  return json({ headline, summary, open_count: openCount });
});
