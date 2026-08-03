/**
 * embed-ask-viv-documents
 *
 * Incremental ingestion of REAL generated document content into
 * ask_viv_corpus (source_type = 'document'). Separate from
 * embed-ask-viv-corpus because this is meaningfully heavier (binary
 * downloads, multi-format extraction) and has a real placeholder problem to
 * dodge: generate-document's own output has no actual uploaded file at all
 * (its own code comment admits it's a stub — "actual DOCX processing
 * requires additional server-side libraries"), and generated_documents rows
 * give no reliable way to tell a placeholder from a real row by column
 * alone (file_path is NOT NULL on both).
 *
 * Bucket/path resolution is therefore done per ORIGINATING TABLE, not by
 * probing generated_documents rows and hoping:
 *  - generated_documents WHERE document_version_id IS NOT NULL → real output
 *    from generate-release-documents → bucket 'document-files', path =
 *    file_path. (document_version_id IS NULL is ambiguous — could be a real
 *    excel-generated row or a placeholder — so those rows are skipped here
 *    entirely; excel-generated content is ingested via its own real table.)
 *  - excel_generated_files (its own table, only populated by
 *    generate-excel-document when bindings were actually present, so every
 *    row here is real by construction) → bucket 'package-documents', path =
 *    storage_path.
 *  - compliance_pack_exports WHERE status = 'success' → bucket
 *    'compliance-packs', path = storage_path.
 * A download failure on any resolved path is logged and skipped, never
 * treated as a hard error — a storage/DB inconsistency shouldn't fail the
 * whole run.
 *
 * Text extraction is copied verbatim from analyse-evidence/index.ts
 * (extractFromPdf/extractFromDocx/extractFromXlsx/extractAny) — same
 * unpdf/mammoth/xlsx versions, same dispatch-by-extension logic.
 *
 * Same two invocation modes as embed-ask-viv-corpus: steady-state (cron,
 * empty body, cursor-based) and ad-hoc backfill/test (tenant_id and/or
 * source in the body, requires a real Super Admin JWT).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf@0.11.0';
import mammoth from 'npm:mammoth@1.8.0';
import * as XLSX from 'npm:xlsx@0.18.5';
import { encode as encodeTokens } from 'npm:gpt-tokenizer@^2.5.0';
import { corsHeaders } from '../_shared/cors.ts';
import { generateEmbeddingsBatch, EMBEDDING_DIMENSIONS as EMBED_DIMS } from '../_shared/openai-embeddings.ts';

const TARGET_TOKENS = 800;
const OVERLAP_TOKENS = 150;
const EMBED_BATCH = 100;
const DEFAULT_LIMIT_PER_SOURCE = 50; // heavier per-row cost than prose sources — smaller batches
const MAX_DOC_BYTES = 25 * 1024 * 1024; // 25 MB per file, matches analyse-evidence's cap
const MAX_TEXT_CHARS = 200_000; // matches analyse-evidence's cap

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

// ─── Text extraction (copied verbatim from analyse-evidence/index.ts) ────
async function extractFromPdf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : (text ?? '');
}

async function extractFromDocx(bytes: Uint8Array): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: bytes as unknown as Buffer });
  return result.value ?? '';
}

function extractFromXlsx(bytes: Uint8Array): string {
  const wb = XLSX.read(bytes, { type: 'array' });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    parts.push(`### Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(ws)}`);
  }
  return parts.join('\n\n');
}

async function extractAny(path: string, bytes: Uint8Array): Promise<string> {
  const lower = path.toLowerCase();
  try {
    if (lower.endsWith('.pdf')) return await extractFromPdf(bytes);
    if (lower.endsWith('.docx')) return await extractFromDocx(bytes);
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return extractFromXlsx(bytes);
    if (lower.endsWith('.txt') || lower.endsWith('.csv') || lower.endsWith('.md')) {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch (e) {
    console.error(`Extract failed for ${path}:`, (e as Error).message);
    return '';
  }
}

interface SourceConfig {
  table: string;
  cursorColumn: string;
  select: string;
  extraFilter?: (query: any) => any;
  bucket: string;
  pathOf: (row: any) => string;
  headingOf: (row: any) => string;
  tenantOf: (row: any) => number | null;
}

const SOURCES: SourceConfig[] = [
  {
    table: 'generated_documents',
    cursorColumn: 'updated_at',
    select: 'id, tenant_id, file_path, file_name, document_version_id, updated_at',
    extraFilter: (q) => q.not('document_version_id', 'is', null),
    bucket: 'document-files',
    pathOf: (row) => row.file_path,
    headingOf: (row) => row.file_name,
    tenantOf: (row) => row.tenant_id ?? null,
  },
  {
    table: 'excel_generated_files',
    cursorColumn: 'generated_at',
    select: 'id, tenant_id, storage_path, file_name, generated_at',
    bucket: 'package-documents',
    pathOf: (row) => row.storage_path,
    headingOf: (row) => row.file_name,
    tenantOf: (row) => row.tenant_id ?? null,
  },
  {
    table: 'compliance_pack_exports',
    cursorColumn: 'completed_at',
    select: 'id, tenant_id, storage_path, file_name, status, completed_at',
    extraFilter: (q) => q.eq('status', 'success'),
    bucket: 'compliance-packs',
    pathOf: (row) => row.storage_path,
    headingOf: (row) => row.file_name,
    tenantOf: (row) => row.tenant_id ?? null,
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
  opts: { limit: number; tenantIdFilter: number | null }
): Promise<{ rows_processed: number; docs_skipped: number; chunks_inserted: number; chunks_deleted: number; errors: string[] }> {
  let rows_processed = 0;
  let docs_skipped = 0;
  let chunks_inserted = 0;
  let chunks_deleted = 0;
  const errors: string[] = [];

  let since: string | null = null;
  if (opts.tenantIdFilter === null) {
    const { data: state } = await admin
      .from('ask_viv_corpus_ingestion_state')
      .select('last_run_at')
      .eq('source_table', config.table)
      .maybeSingle();
    since = (state?.last_run_at as string | undefined) ?? '1970-01-01T00:00:00Z';
  }

  let query = admin.from(config.table).select(config.select);
  if (config.extraFilter) query = config.extraFilter(query);
  if (opts.tenantIdFilter !== null) {
    query = query.eq('tenant_id', opts.tenantIdFilter);
  } else if (since) {
    query = query.gt(config.cursorColumn, since);
  }
  query = query.order(config.cursorColumn, { ascending: true }).limit(opts.limit);

  const { data: rows, error: fetchErr } = await query;
  if (fetchErr) {
    errors.push(`${config.table}: fetch failed — ${fetchErr.message}`);
    return { rows_processed, docs_skipped, chunks_inserted, chunks_deleted, errors };
  }
  if (!rows || rows.length === 0) {
    return { rows_processed, docs_skipped, chunks_inserted, chunks_deleted, errors };
  }

  let maxCursor: string | null = null;

  for (const row of rows as any[]) {
    rows_processed++;
    const cursorValue = row[config.cursorColumn];
    if (cursorValue && (!maxCursor || cursorValue > maxCursor)) maxCursor = cursorValue;

    const path = config.pathOf(row);
    if (!path) {
      docs_skipped++;
      continue;
    }

    try {
      const { data: fileBlob, error: dlErr } = await admin.storage.from(config.bucket).download(path);
      if (dlErr || !fileBlob) {
        // Expected for placeholder/inconsistent rows — skip, not an error.
        docs_skipped++;
        continue;
      }
      const bytes = new Uint8Array(await fileBlob.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_DOC_BYTES) {
        docs_skipped++;
        continue;
      }

      let text = await extractAny(path, bytes);
      if (text.length > MAX_TEXT_CHARS) text = text.slice(0, MAX_TEXT_CHARS);
      if (!text.trim()) {
        docs_skipped++;
        continue;
      }

      const heading = config.headingOf(row);
      const tenantId = config.tenantOf(row);
      const chunks = chunkText(text);
      const chunkTotal = chunks.length;

      const provisional: Array<Omit<ChunkRow, 'embedding'>> = [];
      for (let i = 0; i < chunks.length; i++) {
        const content = chunks[i];
        const hash = await sha256Hex(normaliseForHash(content));
        provisional.push({
          tenant_id: tenantId,
          source_type: 'document',
          source_table: config.table,
          source_id: String(row.id),
          heading,
          content,
          chunk_index: i,
          chunk_total: chunkTotal,
          token_count: tokenCount(content),
          content_hash: hash,
          metadata: { bucket: config.bucket, path },
          updated_at: new Date().toISOString(),
        });
      }

      const newHashes = provisional.map((p) => p.content_hash);
      const { error: delErr, count: deletedCount } = await admin
        .from('ask_viv_corpus')
        .delete({ count: 'exact' })
        .eq('source_table', config.table)
        .eq('source_id', String(row.id))
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

  if (opts.tenantIdFilter === null && maxCursor) {
    await admin.from('ask_viv_corpus_ingestion_state').upsert(
      { source_table: config.table, last_run_at: maxCursor, updated_at: new Date().toISOString() },
      { onConflict: 'source_table' }
    );
  }

  return { rows_processed, docs_skipped, chunks_inserted, chunks_deleted, errors };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const t0 = Date.now();
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
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

  if (tenantIdFilter !== null || body.source) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorisation header' }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: 'Not authenticated' }, 401);
    const { data: callerRow } = await userClient
      .from('users')
      .select('unicorn_role')
      .eq('user_uuid', userRes.user.id)
      .maybeSingle();
    if (callerRow?.unicorn_role !== 'Super Admin') {
      return json({ error: 'Super Admin role required for ad-hoc backfill/test calls' }, 403);
    }
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const limit = typeof body.limit_per_source === 'number' ? body.limit_per_source : DEFAULT_LIMIT_PER_SOURCE;
  const sources = body.source ? SOURCES.filter((s) => s.table === body.source) : SOURCES;

  const results: Record<string, unknown> = {};
  let totalInserted = 0;
  let totalDeleted = 0;
  let totalProcessed = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  for (const config of sources) {
    const r = await ingestSource(admin, config, { limit, tenantIdFilter });
    results[config.table] = r;
    totalInserted += r.chunks_inserted;
    totalDeleted += r.chunks_deleted;
    totalProcessed += r.rows_processed;
    totalSkipped += r.docs_skipped;
    allErrors.push(...r.errors);
  }

  return json(
    {
      ok: allErrors.length === 0,
      mode: tenantIdFilter !== null ? 'ad_hoc_tenant_backfill' : body.source ? 'ad_hoc_source' : 'incremental',
      rows_processed: totalProcessed,
      docs_skipped: totalSkipped,
      chunks_inserted: totalInserted,
      chunks_deleted: totalDeleted,
      duration_ms: Date.now() - t0,
      by_source: results,
      errors: allErrors,
    },
    allErrors.length === 0 ? 200 : 207
  );
});
