/**
 * embed-ask-viv-corpus
 *
 * Incremental ingestion for Ask Viv Assistant's RAG corpus (ask_viv_corpus,
 * created in Phase A but unused until now). Reads prose from five source
 * tables — client_notes, notes (legacy), email_messages, eos_meeting_summaries
 * (JSONB, rendered to text), and client_timeline_events (a historical archive
 * distinct from the Fact Builder's last-20-events recency source added in
 * Phase B) — chunks, embeds via OpenAI direct (text-embedding-3-small, same
 * as srto_corpus), and upserts.
 *
 * Two invocation modes:
 *  - Steady-state (cron, every 30 min, no body / empty body): for each source,
 *    reads rows changed since ask_viv_corpus_ingestion_state.last_run_at,
 *    processes up to `limit_per_source` (default 150), advances the
 *    high-water mark. Never scans a whole table at once — a per-row DB
 *    trigger would be more real-time but far more fragile; polling on a
 *    schedule tolerates a failed run without any per-row bookkeeping.
 *  - Ad-hoc backfill/test (body includes tenant_id and/or source): bypasses
 *    the cursor entirely, scoped to a specific tenant and/or source table.
 *    Does NOT advance ingestion_state — this is an out-of-band top-up, not
 *    the steady-state path.
 *
 * Caller must authenticate as a Vivacity Super Admin OR be the pg_cron job
 * (verify_jwt is enforced at the platform level via private.cron_function_jwt();
 * this function does not additionally gate on role for that path, matching
 * the existing send-action-item-due-reminders / process-notification-outbox
 * convention for cron-only internal endpoints — but ad-hoc backfill/test
 * calls DO require a real user JWT, so the Super Admin check below still
 * applies whenever the caller is a real user rather than the cron job).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encode as encodeTokens } from 'npm:gpt-tokenizer@^2.5.0';
import { corsHeaders } from '../_shared/cors.ts';
import { generateEmbeddingsBatch, EMBEDDING_DIMENSIONS as EMBED_DIMS } from '../_shared/openai-embeddings.ts';
import { requireCaller, FeatureKeys } from '../_shared/requireCaller.ts';

const TARGET_TOKENS = 800;
const OVERLAP_TOKENS = 150;
const EMBED_BATCH = 100;
const DEFAULT_LIMIT_PER_SOURCE = 150;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normaliseForHash(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function tokenCount(text: string): number {
  try {
    return encodeTokens(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  const noTags = html.replace(/<[^>]*>/g, ' ');
  const decoded = noTags.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (m) => HTML_ENTITIES[m] ?? m);
  return decoded.replace(/\s+/g, ' ').trim();
}

/** One row = one logical document here (not a multi-page doc), so chunking is a
 * plain token window over the row's full text rather than heading-aware splitting. */
function chunkText(text: string): string[] {
  const tc = tokenCount(text);
  if (tc <= TARGET_TOKENS) return [text];

  const tokens = encodeTokens(text);
  const chunks: string[] = [];
  const step = TARGET_TOKENS - OVERLAP_TOKENS;
  for (let i = 0; i < tokens.length; i += step) {
    const end = Math.min(i + TARGET_TOKENS, tokens.length);
    const startChar = Math.floor((i / tokens.length) * text.length);
    const endChar = Math.floor((end / tokens.length) * text.length);
    chunks.push(text.slice(startChar, endChar).trim());
    if (end >= tokens.length) break;
  }
  return chunks.filter((c) => c.length > 0);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  let attempt = 0;
  const delays = [1000, 2000, 4000];
  while (true) {
    try {
      return await generateEmbeddingsBatch(texts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes(' 429 ') && attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
        attempt++;
        continue;
      }
      throw e;
    }
  }
}

interface Doc {
  id: string;
  tenantId: number | null;
  heading: string | null;
  content: string;
  metadata: Record<string, unknown>;
}

/** Render an EOS meeting summary's JSONB arrays into readable prose for embedding. */
function renderJsonList(label: string, items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  const lines = items.map((item) => {
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const text = o.text ?? o.title ?? o.headline ?? o.description ?? o.name ?? null;
      if (text === null) return `- ${JSON.stringify(o)}`;
      const extras: string[] = [];
      if (o.status) extras.push(`status: ${o.status}`);
      if (o.due_date) extras.push(`due: ${o.due_date}`);
      if (o.solution) extras.push(`solution: ${o.solution}`);
      return extras.length > 0 ? `- ${text} (${extras.join(', ')})` : `- ${text}`;
    }
    return `- ${String(item)}`;
  });
  return `${label}:\n${lines.join('\n')}`;
}

/** Render an EOS meeting's personal/professional win shares — a different shape
 * than renderJsonList's text/title/headline fields, so it needs its own renderer. */
function renderSegueShares(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  const lines = items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const parts: string[] = [];
      if (o.personal_win) parts.push(`Personal: ${o.personal_win}`);
      if (o.professional_win) parts.push(`Professional: ${o.professional_win}`);
      if (typeof o.rating === 'number') parts.push(`rating: ${o.rating}/10`);
      return parts.length > 0 ? `- ${parts.join(' | ')}` : null;
    })
    .filter((l): l is string => l !== null);
  return lines.length > 0 ? `Personal/professional wins shared:\n${lines.join('\n')}` : '';
}

interface SourceConfig {
  table: string;
  sourceType: string;
  cursorColumn: string;
  select: string;
  toDoc: (row: any) => Doc | null;
}

const SOURCES: SourceConfig[] = [
  {
    table: 'client_notes',
    sourceType: 'note',
    cursorColumn: 'updated_at',
    select: 'id, tenant_id, title, content, note_type, updated_at, created_at',
    toDoc: (row) => {
      const content = stripHtml(row.content);
      if (!content) return null;
      return {
        id: row.id,
        tenantId: row.tenant_id ?? null,
        heading: row.title ?? null,
        content: row.title ? `${row.title}\n\n${content}` : content,
        metadata: { note_type: row.note_type, created_at: row.created_at },
      };
    },
  },
  {
    table: 'notes',
    sourceType: 'note',
    cursorColumn: 'updated_at',
    select: 'id, tenant_id, title, note_details, note_type, updated_at, created_at',
    toDoc: (row) => {
      const content = stripHtml(row.note_details);
      if (!content) return null;
      return {
        id: row.id,
        tenantId: row.tenant_id ?? null,
        heading: row.title ?? null,
        content: row.title ? `${row.title}\n\n${content}` : content,
        metadata: { note_type: row.note_type, created_at: row.created_at },
      };
    },
  },
  {
    table: 'email_messages',
    sourceType: 'email',
    cursorColumn: 'updated_at',
    select: 'id, tenant_id, subject, sender_name, ai_summary, body_preview, body_html, received_at, updated_at',
    toDoc: (row) => {
      const body = row.ai_summary || stripHtml(row.body_html) || row.body_preview || '';
      if (!body) return null;
      const heading = row.subject ?? null;
      return {
        id: row.id,
        tenantId: row.tenant_id ?? null,
        heading,
        content: `${heading ? `Subject: ${heading}\n` : ''}${row.sender_name ? `From: ${row.sender_name}\n` : ''}\n${body}`,
        metadata: { received_at: row.received_at },
      };
    },
  },
  {
    table: 'eos_meeting_summaries',
    sourceType: 'eos',
    cursorColumn: 'created_at',
    // Joins to eos_meetings for scheduled_date/title — the meeting's REAL date,
    // not the free-text period_range field. Without this, retrieved chunks had
    // no reliable chronological anchor at all, so "what happened at the last
    // L10" style questions couldn't be answered from search_eos results alone
    // (fixed properly via the deterministic list_eos_meetings/
    // get_eos_meeting_details tools — this join just gives the semantic-search
    // corpus a real date to cite, for topic-based questions).
    select:
      'id, tenant_id, meeting_type, period_range, headlines, issues, todos, rocks, cascades, segue_shares, rating, created_at, meeting_id, eos_meetings!inner(title, scheduled_date, status)',
    toDoc: (row) => {
      const meeting = (row as any).eos_meetings;
      const scheduledDate: string | null = meeting?.scheduled_date ?? null;
      const dateLabel = scheduledDate ? scheduledDate.slice(0, 10) : row.period_range ?? null;
      const parts = [`EOS ${row.meeting_type ?? 'meeting'} summary${dateLabel ? ` — ${dateLabel}` : ''}`];
      const headlines = renderJsonList('Headlines', row.headlines);
      const issues = renderJsonList('Issues', row.issues);
      const todos = renderJsonList('To-dos', row.todos);
      const rocks = renderJsonList('Rocks', row.rocks);
      const cascades = renderJsonList('Cascading messages', row.cascades);
      const wins = renderSegueShares(row.segue_shares);
      for (const p of [headlines, issues, todos, rocks, cascades, wins]) {
        if (p) parts.push(p);
      }
      if (parts.length <= 1) return null;
      return {
        id: row.id,
        tenantId: row.tenant_id ?? null,
        heading: `EOS ${row.meeting_type ?? 'meeting'}${meeting?.title ? ` — ${meeting.title}` : dateLabel ? ` — ${dateLabel}` : ''}`,
        content: parts.join('\n\n'),
        metadata: { meeting_type: row.meeting_type, scheduled_date: scheduledDate, title: meeting?.title ?? null },
      };
    },
  },
  {
    table: 'client_timeline_events',
    sourceType: 'timeline_event',
    cursorColumn: 'created_at',
    select: 'id, tenant_id, event_type, title, body, occurred_at, created_at',
    toDoc: (row) => {
      if (!row.title) return null;
      return {
        id: row.id,
        tenantId: row.tenant_id ?? null,
        heading: row.title,
        content: row.body ? `${row.title}\n\n${row.body}` : row.title,
        metadata: { event_type: row.event_type, occurred_at: row.occurred_at },
      };
    },
  },
];

interface ChunkRow {
  tenant_id: number | null;
  source_type: string;
  source_table: string;
  source_id: string;
  heading: string | null;
  content: string;
  chunk_index: number;
  chunk_total: number;
  token_count: number;
  content_hash: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  updated_at: string;
}

async function ingestSource(
  admin: ReturnType<typeof createClient>,
  config: SourceConfig,
  opts: { limit: number; sinceOverride: string | null; tenantIdFilter: number | null }
): Promise<{ rows_processed: number; chunks_inserted: number; chunks_deleted: number; errors: string[] }> {
  let rows_processed = 0;
  let chunks_inserted = 0;
  let chunks_deleted = 0;
  const errors: string[] = [];

  let since = opts.sinceOverride;
  let sinceId: string | null = null;
  if (since === null && opts.tenantIdFilter === null) {
    const { data: state } = await admin
      .from('ask_viv_corpus_ingestion_state')
      .select('last_run_at, last_id')
      .eq('source_table', config.table)
      .maybeSingle();
    since = (state?.last_run_at as string | undefined) ?? '1970-01-01T00:00:00Z';
    sinceId = (state?.last_id as string | null | undefined) ?? null;
  }

  let query = admin.from(config.table).select(config.select);
  if (opts.tenantIdFilter !== null) {
    query = query.eq('tenant_id', opts.tenantIdFilter);
  } else if (since) {
    // Plain `.gt(cursorColumn, since)` silently drops every row past the
    // first batch whenever more rows share the exact same cursorColumn
    // value than fit in one batch (a real bug found in `notes`, a
    // bulk-migrated table where 9,556 of ~11,337 rows share one identical
    // updated_at timestamp) — the cursor advances to that value and `.gt()`
    // excludes all of them forever after. Tiebreak on id once a prior run
    // has recorded one.
    if (sinceId) {
      query = query.or(`${config.cursorColumn}.gt.${since},and(${config.cursorColumn}.eq.${since},id.gt.${sinceId})`);
    } else {
      query = query.gt(config.cursorColumn, since);
    }
  }
  query = query.order(config.cursorColumn, { ascending: true }).order('id', { ascending: true }).limit(opts.limit);

  const { data: rows, error: fetchErr } = await query;
  if (fetchErr) {
    errors.push(`${config.table}: fetch failed — ${fetchErr.message}`);
    return { rows_processed, chunks_inserted, chunks_deleted, errors };
  }
  if (!rows || rows.length === 0) {
    return { rows_processed, chunks_inserted, chunks_deleted, errors };
  }

  // Composite ordering (cursorColumn, id) guarantees the last row in the
  // batch is the true high-water mark — no separate max-tracking needed.
  const lastRow = (rows as any[])[rows.length - 1];
  const maxCursor: string | null = lastRow[config.cursorColumn] ?? null;
  const maxId: string | null = lastRow.id ? String(lastRow.id) : null;

  for (const row of rows as any[]) {
    rows_processed++;

    try {
      const doc = config.toDoc(row);
      if (!doc || !doc.content.trim()) continue;

      const chunks = chunkText(doc.content);
      const chunkTotal = chunks.length;

      const provisional: Array<Omit<ChunkRow, 'embedding'>> = [];
      for (let i = 0; i < chunks.length; i++) {
        const content = chunks[i];
        const hash = await sha256Hex(normaliseForHash(content));
        provisional.push({
          tenant_id: doc.tenantId,
          source_type: config.sourceType,
          source_table: config.table,
          source_id: String(doc.id),
          heading: doc.heading,
          content,
          chunk_index: i,
          chunk_total: chunkTotal,
          token_count: tokenCount(content),
          content_hash: hash,
          metadata: doc.metadata,
          updated_at: new Date().toISOString(),
        });
      }

      // Rows here can genuinely change content over time (unlike srto_corpus's
      // largely-static compliance documents), so replace this row's chunk set
      // outright rather than only upserting — otherwise an edited note leaves
      // stale chunks from its old content hanging around under old chunk_index
      // values that no longer exist in the new content.
      const newHashes = provisional.map((p) => p.content_hash);
      const { error: delErr, count: deletedCount } = await admin
        .from('ask_viv_corpus')
        .delete({ count: 'exact' })
        .eq('source_table', config.table)
        .eq('source_id', String(doc.id))
        .not('content_hash', 'in', `(${newHashes.join(',')})`);
      if (delErr) throw new Error(`stale-chunk cleanup failed: ${delErr.message}`);
      chunks_deleted += deletedCount ?? 0;

      for (let i = 0; i < provisional.length; i += EMBED_BATCH) {
        const slice = provisional.slice(i, i + EMBED_BATCH);
        const vectors = await embedBatch(slice.map((r) => r.content));
        if (vectors.length !== slice.length) {
          throw new Error(`embedding count mismatch: got ${vectors.length}, expected ${slice.length}`);
        }
        for (const v of vectors) {
          if (v.length !== EMBED_DIMS) throw new Error(`embedding dim mismatch: got ${v.length}`);
        }
        const insertRows: ChunkRow[] = slice.map((r, j) => ({ ...r, embedding: vectors[j] }));
        const { error: upErr } = await admin
          .from('ask_viv_corpus')
          .upsert(insertRows, { onConflict: 'source_table,source_id,chunk_index,content_hash' });
        if (upErr) throw new Error(`upsert failed: ${upErr.message}`);
        chunks_inserted += insertRows.length;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${config.table}#${row.id}: ${msg}`);
    }
  }

  // Only advance the steady-state cursor on the real cron path — ad-hoc
  // backfill/test calls (tenantIdFilter or sinceOverride set) never touch it.
  if (opts.tenantIdFilter === null && opts.sinceOverride === null && maxCursor) {
    await admin.from('ask_viv_corpus_ingestion_state').upsert(
      { source_table: config.table, last_run_at: maxCursor, last_id: maxId, updated_at: new Date().toISOString() },
      { onConflict: 'source_table' }
    );
  }

  return { rows_processed, chunks_inserted, chunks_deleted, errors };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  const t0 = Date.now();
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    return json({ error: 'OPENAI_API_KEY is not configured in edge function secrets' }, 500);
  }

  let body: { tenant_id?: number; source?: string; limit_per_source?: number } = {};
  try {
    if (req.headers.get('content-length') && req.headers.get('content-length') !== '0') {
      body = await req.json();
    }
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const tenantIdFilter = typeof body.tenant_id === 'number' ? body.tenant_id : null;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Ad-hoc backfill/test calls (tenant_id and/or source set) require a real
  // Super Admin JWT — only the cursor-based steady-state path (empty body) is
  // trusted as a cron-only internal endpoint, matching the existing
  // send-action-item-due-reminders convention.
  if (tenantIdFilter !== null || body.source) {
    const caller = await requireCaller(req, admin, {
      featureKey: FeatureKeys.adminVector,
      headers: corsHeaders(req),
      unauthorizedMessage: 'Missing authorisation header',
      forbiddenMessage: 'Super Admin role required for ad-hoc backfill/test calls',
    });
    if (!caller.ok) return caller.response;
  }
  const limit = typeof body.limit_per_source === 'number' ? body.limit_per_source : DEFAULT_LIMIT_PER_SOURCE;
  const sources = body.source ? SOURCES.filter((s) => s.table === body.source) : SOURCES;

  const results: Record<string, unknown> = {};
  let totalInserted = 0;
  let totalDeleted = 0;
  let totalProcessed = 0;
  const allErrors: string[] = [];

  for (const config of sources) {
    const r = await ingestSource(admin, config, {
      limit,
      sinceOverride: null,
      tenantIdFilter,
    });
    results[config.table] = r;
    totalInserted += r.chunks_inserted;
    totalDeleted += r.chunks_deleted;
    totalProcessed += r.rows_processed;
    allErrors.push(...r.errors);
  }

  return json(
    {
      ok: allErrors.length === 0,
      mode: tenantIdFilter !== null ? 'ad_hoc_tenant_backfill' : body.source ? 'ad_hoc_source' : 'incremental',
      rows_processed: totalProcessed,
      chunks_inserted: totalInserted,
      chunks_deleted: totalDeleted,
      duration_ms: Date.now() - t0,
      by_source: results,
      errors: allErrors,
    },
    allErrors.length === 0 ? 200 : 207
  );
});
