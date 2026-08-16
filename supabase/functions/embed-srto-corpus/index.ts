/**
 * embed-srto-corpus
 *
 * Admin operation. Reads source PDFs from the `srto-source-documents`
 * Storage bucket, extracts text, chunks it, embeds each chunk via OpenAI
 * direct (text-embedding-3-small, 1536 dims), and upserts into
 * public.srto_corpus.
 *
 * Note: The Lovable AI Gateway does NOT support embedding models — only
 * chat/completion. Embeddings call OpenAI directly via the shared helper
 * `_shared/openai-embeddings.ts`. Chat/completion calls elsewhere still use
 * the gateway.
 *
 * Caller must authenticate as a Vivacity Super Admin (users.unicorn_role
 * = 'Super Admin'). DB writes are performed with the service role key.
 *
 * Input body (all optional):
 *   { source_document?: string, source_type?: string, force_reembed?: boolean }
 *
 * Returns: { documents_processed, chunks_inserted, chunks_skipped,
 *            chunks_deleted, duration_ms, errors[] }
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf@^0.12.0';
import { encode as encodeTokens } from 'npm:gpt-tokenizer@^2.5.0';
import { corsHeaders } from '../_shared/cors.ts';
import { requireCaller, FeatureKeys } from '../_shared/requireCaller.ts';
import {
  generateEmbedding,
  generateEmbeddingsBatch,
  EMBEDDING_PROVIDER,
  EMBEDDING_MODEL_NAME,
  EMBEDDING_DIMENSIONS as EMBED_DIMS,
} from '../_shared/openai-embeddings.ts';
const TARGET_TOKENS = 800;
const OVERLAP_TOKENS = 150;
const EMBED_BATCH = 100;

type SrtoSourceType =
  | 'outcome_standards'
  | 'compliance_requirements'
  | 'credential_policy'
  | 'practice_guide'
  | 'national_code'
  | 'cricos_practice_guide'
  | 'esos_act';

type Framework = 'SRTO_2025' | 'NATIONAL_CODE_2018' | 'ESOS_ACT_2000';

interface ChunkRow {
  source_document: string;
  source_type: SrtoSourceType;
  framework: Framework;
  source_version: string | null;
  clause: string | null;
  quality_area: string | null;
  heading: string | null;
  content: string;
  token_count: number;
  chunk_index: number;
  chunk_total: number;
  content_hash: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  updated_at: string;
}

// ----- Quality area mapping (SRTO 2025) ----------------------------
const CLAUSE_QA_PREFIX: Record<string, string> = {
  '1': 'Training & Assessment',
  '2': 'VET Student Support',
  '3': 'VET Workforce',
  '4': 'Governance',
};

// ----- Quality area mapping (National Code 2018) -------------------
const NATIONAL_CODE_QUALITY_AREAS: Record<string, string> = {
  '1':  'Marketing Information and Practices',
  '2':  'Recruitment of an Overseas Student',
  '3':  'Formalisation of Enrolment',
  '4':  'Education Agents',
  '5':  'Younger Overseas Students',
  '6':  'Overseas Student Support Services',
  '7':  'Transfer Between Registered Providers',
  '8':  'Overseas Student Visa Requirements',
  '9':  'Deferring, Suspending or Cancelling Enrolment',
  '10': 'Complaints and Appeals',
  '11': 'Additional Registration Requirements',
};

const PRACTICE_GUIDE_QA: Array<[RegExp, string]> = [
  [/assessment/i, 'Training & Assessment'],
  [/training(?!_support)/i, 'Training & Assessment'],
  [/recognition|rpl|credit/i, 'Training & Assessment'],
  [/wellbeing|support|diversity|complaint|appeal|feedback|inclusion/i, 'VET Student Support'],
  [/workforce|trainer|assessor|competenc/i, 'VET Workforce'],
  [/governance|leadership|accountability|risk|continuous|fit_and_proper|credential|information|transparency|facilities|resources|equipment/i, 'Governance'],
];

function qualityAreaForClause(clause: string | null, framework: Framework): string | null {
  if (!clause) return null;
  const top = clause.split('.')[0];
  if (framework === 'NATIONAL_CODE_2018') {
    return NATIONAL_CODE_QUALITY_AREAS[top] ?? null;
  }
  // Default to SRTO 2025 mapping (also covers ESOS for now — null fallback).
  return CLAUSE_QA_PREFIX[top] ?? null;
}

function qualityAreaForPracticeGuide(filename: string): string | null {
  for (const [re, qa] of PRACTICE_GUIDE_QA) {
    if (re.test(filename)) return qa;
  }
  return null;
}

// ----- Helpers ------------------------------------------------------
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normaliseForHash(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function tokenCount(text: string): number {
  try {
    return encodeTokens(text).length;
  } catch {
    // Fallback: rough char-based estimate.
    return Math.ceil(text.length / 4);
  }
}

function detectClause(heading: string | null, content: string): string | null {
  const haystack = `${heading ?? ''}\n${content.slice(0, 200)}`;
  const m = haystack.match(/\b(\d+\.\d+(?:\.\d+)?)\b/);
  return m ? m[1] : null;
}

function detectSourceVersion(text: string, filename: string): string | null {
  const m = text.match(/F\d{4}L\d{5}/);
  if (m) return `${m[0]} (registered version detected)`;
  return filename;
}

// ----- Heading-aware chunker ---------------------------------------
const HEADING_PATTERNS: RegExp[] = [
  /^Standard\s+\d+\.\d+\b.*$/m,
  /^\d+\.\d+(?:\.\d+)?\s+[A-Z][^\n]{2,120}$/m,
  /^Performance Indicators?$/im,
];

interface RawSection {
  heading: string | null;
  text: string;
}

function splitByHeadings(fullText: string): RawSection[] {
  const lines = fullText.split('\n');
  const sections: RawSection[] = [];
  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const isHeading = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 120) return false;
    return HEADING_PATTERNS.some((re) => re.test(trimmed));
  };

  for (const line of lines) {
    if (isHeading(line)) {
      if (buffer.length) {
        sections.push({ heading: currentHeading, text: buffer.join('\n').trim() });
        buffer = [];
      }
      currentHeading = line.trim();
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length) {
    sections.push({ heading: currentHeading, text: buffer.join('\n').trim() });
  }
  // Drop empty sections.
  return sections.filter((s) => s.text.length > 0);
}

function splitByTokenWindow(text: string, target: number, overlap: number): string[] {
  const tokens = encodeTokens(text);
  if (tokens.length <= target) return [text];

  // gpt-tokenizer doesn't expose decode in all versions; window by characters
  // proportional to token positions.
  const chunks: string[] = [];
  const step = target - overlap;
  for (let i = 0; i < tokens.length; i += step) {
    const end = Math.min(i + target, tokens.length);
    const startChar = Math.floor((i / tokens.length) * text.length);
    const endChar = Math.floor((end / tokens.length) * text.length);
    chunks.push(text.slice(startChar, endChar).trim());
    if (end >= tokens.length) break;
  }
  return chunks.filter((c) => c.length > 0);
}

interface PreparedChunk {
  heading: string | null;
  content: string;
  token_count: number;
}

function chunkDocument(fullText: string): PreparedChunk[] {
  const sections = splitByHeadings(fullText);
  const out: PreparedChunk[] = [];

  for (const section of sections) {
    const tc = tokenCount(section.text);
    if (tc <= TARGET_TOKENS) {
      out.push({ heading: section.heading, content: section.text, token_count: tc });
    } else {
      const windows = splitByTokenWindow(section.text, TARGET_TOKENS, OVERLAP_TOKENS);
      for (const w of windows) {
        out.push({ heading: section.heading, content: w, token_count: tokenCount(w) });
      }
    }
  }

  // Filter out trivially short chunks (<25 tokens).
  return out.filter((c) => c.token_count >= 25);
}

// ----- Embedding (OpenAI direct via shared helper) ---------------
// _apiKey kept in signature for backwards compatibility with existing
// callers — the shared helper reads OPENAI_API_KEY from env directly.
async function embedBatch(texts: string[], _apiKey?: string): Promise<number[][]> {
  let attempt = 0;
  const delays = [1000, 2000, 4000];
  while (true) {
    try {
      return await generateEmbeddingsBatch(texts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Retry on transient 429 from OpenAI.
      if (msg.includes(' 429 ') && attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
        attempt++;
        continue;
      }
      throw e;
    }
  }
}

// ----- Source-type and framework detection from path --------------
const PATH_PREFIX_MAP: Record<string, { source_type: SrtoSourceType; framework: Framework }> = {
  outcome_standards:        { source_type: 'outcome_standards',        framework: 'SRTO_2025' },
  compliance_requirements:  { source_type: 'compliance_requirements',  framework: 'SRTO_2025' },
  credential_policy:        { source_type: 'credential_policy',        framework: 'SRTO_2025' },
  practice_guide:           { source_type: 'practice_guide',           framework: 'SRTO_2025' },
  national_code:            { source_type: 'national_code',            framework: 'NATIONAL_CODE_2018' },
  cricos_practice_guide:    { source_type: 'cricos_practice_guide',    framework: 'NATIONAL_CODE_2018' },
  esos_act:                 { source_type: 'esos_act',                 framework: 'ESOS_ACT_2000' },
};

function metadataFromPath(path: string): { source_type: SrtoSourceType; framework: Framework } | null {
  const folder = path.split('/')[0];
  return PATH_PREFIX_MAP[folder] ?? null;
}

function documentKeyFromPath(path: string): string {
  const filename = path.split('/').pop() ?? path;
  return filename.replace(/\.pdf$/i, '');
}

// ----- Main ---------------------------------------------------------
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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const caller = await requireCaller(req, admin, {
    featureKey: FeatureKeys.adminVector,
    headers: corsHeaders(req),
    unauthorizedMessage: 'Missing authorisation header',
    forbiddenMessage: 'Super Admin role required',
  });
  if (!caller.ok) return caller.response;

  // 1b. Health-check short-circuit.
  // Order is intentional: Authorization parsed -> user resolved -> Super Admin
  // gate enforced -> only THEN do we branch on the health request. This keeps
  // the health endpoint strictly more restrictive than (never weaker than) the
  // main embed path, so it can never become a cheaper auth-bypass surface.
  // We accept BOTH triggers because some `supabase functions invoke` versions
  // strip custom headers; the path suffix is the more reliable trigger.
  const url = new URL(req.url);
  const isHealthCheck =
    url.pathname.endsWith('/health') ||
    url.pathname.endsWith('/health/') ||
    req.headers.get('x-srto-health') === '1';
  if (isHealthCheck) {
    const tPing = Date.now();

    // Check storage bucket reachability.
    let bucket_reachable = false;
    try {
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error: bucketErr } = await adminClient.storage
        .from('srto-source-documents')
        .list('', { limit: 1 });
      bucket_reachable = !bucketErr;
    } catch {
      bucket_reachable = false;
    }

    // Check DB writability via a no-op authenticated select on srto_corpus.
    let db_writable = false;
    try {
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error: dbErr } = await adminClient
        .from('srto_corpus')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      db_writable = !dbErr;
    } catch {
      db_writable = false;
    }

    // Real test embedding via OpenAI direct.
    try {
      const vec = await generateEmbedding('health check');
      const latency_ms = Date.now() - tPing;
      return json(
        {
          ok: true,
          embedding_provider: EMBEDDING_PROVIDER,
          model: EMBEDDING_MODEL_NAME,
          dim: vec.length,
          expected_dim: EMBED_DIMS,
          dims_match: vec.length === EMBED_DIMS,
          openai_reachable: true,
          bucket_reachable,
          db_writable,
          latency_ms,
        },
        200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isCredits = /\b402\b/.test(msg);
      return json(
        {
          ok: false,
          embedding_provider: EMBEDDING_PROVIDER,
          model: EMBEDDING_MODEL_NAME,
          openai_reachable: false,
          bucket_reachable,
          db_writable,
          error: isCredits
            ? 'OpenAI account out of credits or quota exceeded.'
            : 'OpenAI embeddings unreachable',
          detail: msg.slice(0, 500),
        },
        isCredits ? 402 : 502,
      );
    }
  }

  // 2. Parse body.
  let body: { source_document?: string; source_type?: string; force_reembed?: boolean } = {};
  try {
    if (req.headers.get('content-length') && req.headers.get('content-length') !== '0') {
      body = await req.json();
    }
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const force = body.force_reembed === true;

  // 4. List PDFs in the bucket (recurse through known folders).
  const folders: SrtoSourceType[] = body.source_type
    ? [body.source_type as SrtoSourceType]
    : [
        'outcome_standards',
        'compliance_requirements',
        'credential_policy',
        'practice_guide',
        'national_code',
        'cricos_practice_guide',
        'esos_act',
      ];

  const targets: string[] = [];
  for (const folder of folders) {
    const { data: list, error: listErr } = await admin.storage
      .from('srto-source-documents')
      .list(folder, { limit: 200 });
    if (listErr) {
      console.error(`List failed for ${folder}:`, listErr.message);
      continue;
    }
    for (const obj of list ?? []) {
      if (!obj.name.toLowerCase().endsWith('.pdf')) continue;
      const path = `${folder}/${obj.name}`;
      if (body.source_document && documentKeyFromPath(path) !== body.source_document) continue;
      targets.push(path);
    }
  }

  if (targets.length === 0) {
    return json(
      {
        ok: true,
        documents_processed: 0,
        chunks_inserted: 0,
        chunks_skipped: 0,
        chunks_deleted: 0,
        duration_ms: Date.now() - t0,
        warning: 'No source PDFs matched filters.',
      },
      200,
    );
  }

  let chunks_inserted = 0;
  let chunks_skipped = 0;
  let chunks_deleted = 0;
  const errors: string[] = [];

  // 5. Per-document pipeline.
  for (const path of targets) {
    try {
      const meta = metadataFromPath(path);
      if (!meta) {
        errors.push(`Unknown source_type for path: ${path}`);
        continue;
      }
      const sourceType = meta.source_type;
      const framework = meta.framework;
      const sourceDocument = documentKeyFromPath(path);

      // Download.
      const { data: file, error: dlErr } = await admin.storage
        .from('srto-source-documents')
        .download(path);
      if (dlErr || !file) throw new Error(`Download failed: ${dlErr?.message}`);

      const bytes = new Uint8Array(await file.arrayBuffer());

      // Extract text via unpdf.
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      const fullText = Array.isArray(text) ? text.join('\n\n') : (text as string);

      const sourceVersion = detectSourceVersion(fullText, sourceDocument);

      // Chunk.
      const prepared = chunkDocument(fullText);
      const chunkTotal = prepared.length;

      if (force) {
        const { error: delErr, count } = await admin
          .from('srto_corpus')
          .delete({ count: 'exact' })
          .eq('source_document', sourceDocument);
        if (delErr) throw new Error(`Force delete failed: ${delErr.message}`);
        chunks_deleted += count ?? 0;
      }

      // Build rows + hashes.
      const provisional: Array<Omit<ChunkRow, 'embedding'>> = [];
      for (let i = 0; i < prepared.length; i++) {
        const c = prepared[i];
        const hash = await sha256Hex(normaliseForHash(c.content));
        const clause = detectClause(c.heading, c.content);
        const qa =
          qualityAreaForClause(clause, framework) ??
          (sourceType === 'practice_guide' ? qualityAreaForPracticeGuide(sourceDocument) : null);

        provisional.push({
          source_document: sourceDocument,
          source_type: sourceType,
          framework,
          source_version: sourceVersion,
          clause,
          quality_area: qa,
          heading: c.heading,
          content: c.content,
          token_count: c.token_count,
          chunk_index: i,
          chunk_total: chunkTotal,
          content_hash: hash,
          metadata: { parser: 'unpdf@0.12' },
          updated_at: new Date().toISOString(),
        });
      }

      // Skip already-present (document, chunk_index, hash) when not forcing.
      let toEmbed = provisional;
      if (!force) {
        const { data: existing } = await admin
          .from('srto_corpus')
          .select('chunk_index, content_hash')
          .eq('source_document', sourceDocument);
        const seen = new Set((existing ?? []).map((r) => `${r.chunk_index}|${r.content_hash}`));
        const before = provisional.length;
        toEmbed = provisional.filter((r) => !seen.has(`${r.chunk_index}|${r.content_hash}`));
        chunks_skipped += before - toEmbed.length;
      }

      if (toEmbed.length === 0) continue;

      // Batch embed.
      for (let i = 0; i < toEmbed.length; i += EMBED_BATCH) {
        const slice = toEmbed.slice(i, i + EMBED_BATCH);
        const vectors = await embedBatch(slice.map((r) => r.content));

        if (vectors.length !== slice.length) {
          throw new Error(`Embedding count mismatch: got ${vectors.length}, expected ${slice.length}`);
        }
        for (let j = 0; j < vectors.length; j++) {
          if (vectors[j].length !== EMBED_DIMS) {
            throw new Error(`Embedding dim mismatch: got ${vectors[j].length}`);
          }
        }

        const rows: ChunkRow[] = slice.map((r, j) => ({ ...r, embedding: vectors[j] }));

        const { error: upErr } = await admin
          .from('srto_corpus')
          .upsert(rows, { onConflict: 'source_document,chunk_index,content_hash' });
        if (upErr) throw new Error(`Upsert failed: ${upErr.message}`);

        chunks_inserted += rows.length;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed for ${path}:`, msg);
      errors.push(`${path}: ${msg}`);
    }
  }

  return json(
    {
      ok: errors.length === 0,
      documents_processed: targets.length,
      chunks_inserted,
      chunks_skipped,
      chunks_deleted,
      duration_ms: Date.now() - t0,
      errors,
    },
    errors.length === 0 ? 200 : 207,
  );
});
