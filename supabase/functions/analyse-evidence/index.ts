/**
 * analyse-evidence
 *
 * Wave 4 #1: AI-suggested ratings from uploaded evidence.
 *
 * Pipeline: caller-JWT auth → audit access gate → daily cap (30/user/day) →
 * load response + question + linked documents → cross-tenant document
 * leakage check (defence-in-depth alongside RLS) → fetch storage files →
 * extract text (PDF / DOCX / XLSX) → semantic retrieval over srto_corpus →
 * Gemini 2.5 Pro analysis → strict hallucination check on quoted excerpts →
 * persist suggestion to client_audit_responses.ai_* columns → return.
 *
 * The auditor reviews the suggestion in the UI and clicks Accept / Override
 * / Discard. Suggestions are advisory; rating is never auto-applied.
 *
 * Loading copy in the UI: "This typically takes up to a minute" (per the
 * approved amendment — TAS docs over 100 pages can land at 50+ seconds).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { extractText, getDocumentProxy } from 'npm:unpdf@0.11.0';
import mammoth from 'npm:mammoth@1.8.0';
import * as XLSX from 'npm:xlsx@0.18.5';

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-pro';
const DAILY_CAP = 30;
const MAX_DOC_BYTES = 25 * 1024 * 1024; // 25 MB per file
const MAX_TEXT_CHARS_PER_DOC = 200_000;
const STORAGE_BUCKET = 'documents';
type JsonRow = Record<string, unknown>;

function json(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/**
 * Defensive parser for Gemini output. Handles markdown fences, natural-language
 * preambles, and trailing chatter — returns null only if no JSON object/array
 * can be recovered. Belt-and-braces alongside response_mime_type=application/json.
 */
function safeParse(raw: string): unknown {
  let s = (raw ?? '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const firstStruct = s.search(/[{[]/);
  if (firstStruct > 0) s = s.slice(firstStruct);
  try { return JSON.parse(s); } catch { /* fall through */ }
  const m = s.match(/[{[][\s\S]*[}\]]/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* noop */ } }
  return null;
}

// ─── Text extraction ────────────────────────────────────────────────
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
    // Unknown format — try utf-8 best effort.
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch (e) {
    console.error(`Extract failed for ${path}:`, (e as Error).message);
    return '';
  }
}

// ─── Hallucination check ───────────────────────────────────────────
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\u00A0]+/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
}

function excerptFoundInCorpus(excerpt: string, sources: { name: string; text: string }[]): { found: boolean; sourceName?: string } {
  const needle = normalize(excerpt);
  if (needle.length < 12) return { found: false }; // Too short to verify reliably.
  for (const src of sources) {
    if (normalize(src.text).includes(needle)) return { found: true, sourceName: src.name };
  }
  return { found: false };
}

// ─── Prompt ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a senior RTO compliance auditor at Vivacity Coaching & Consulting analysing uploaded evidence against a single audit question. Your job is to suggest a rating to a human auditor who will review and accept, override, or discard your suggestion.

VOICE
- Authoritative, calm, technical, Australian English (recognise, organisation, behaviour, programme, prioritise).
- Use "Governing Persons" for those who govern the RTO. Never use "directors", "the board", or "board members".

WHAT YOU MAY DO
- Read the supplied evidence excerpts and the audit question's evidence_to_sight.
- Quote short fragments (≤30 words) from the evidence VERBATIM in the "excerpts" array — these will be machine-verified against source text. Excerpts you cannot quote verbatim from the source MUST NOT appear.
- Identify gaps where evidence_to_sight requirements are not met.
- Suggest one rating from the question's allowed response_set.

WHAT YOU MUST NOT DO
- Invent quotes. Every string in "excerpts" must appear character-for-character in one of the source documents (whitespace tolerant).
- Mark something compliant when key required evidence is missing.
- Mention that you are an AI, that this is a draft, or that a human will review.

OUTPUT SCHEMA (return JSON only):
{
  "suggested_rating": "compliant | at_risk | non_compliant | na",
  "rationale": "Two to four short paragraphs explaining the recommendation, citing the evidence and SRTOs 2025 clause where relevant.",
  "excerpts": [
    { "quote": "verbatim ≤30 word fragment from evidence", "source": "filename of source document" }
  ],
  "gaps": [
    "Plain-English description of an evidence_to_sight requirement not met by the supplied documents."
  ],
  "confidence": "high | medium | low"
}`;

interface GeminiOut {
  suggested_rating: string;
  rationale: string;
  excerpts: { quote: string; source: string }[];
  gaps: string[];
  confidence: string;
}

function validateOut(raw: unknown): { ok: true; out: GeminiOut } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'response not an object' };
  const r = raw as Record<string, unknown>;
  if (typeof r.suggested_rating !== 'string') return { ok: false, reason: 'suggested_rating missing' };
  if (!['compliant', 'at_risk', 'non_compliant', 'na'].includes(r.suggested_rating)) {
    return { ok: false, reason: `suggested_rating invalid: ${r.suggested_rating}` };
  }
  if (typeof r.rationale !== 'string' || r.rationale.trim().length === 0) {
    return { ok: false, reason: 'rationale missing' };
  }
  if (!['high', 'medium', 'low'].includes(r.confidence as string)) {
    return { ok: false, reason: `confidence invalid: ${r.confidence}` };
  }
  if (!Array.isArray(r.excerpts)) return { ok: false, reason: 'excerpts not array' };
  if (!Array.isArray(r.gaps)) return { ok: false, reason: 'gaps not array' };
  return { ok: true, out: r as unknown as GeminiOut };
}

// ─── Main ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  const t0 = Date.now();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(req, { error: 'Missing authorisation header' }, 401);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return json(req, { error: 'LOVABLE_API_KEY is not configured' }, 500);

  // 1. Caller-JWT client + verify auth.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json(req, { error: 'Not authenticated' }, 401);
  const callerUserId = userRes.user.id;

  // 2. Body.
  let body: { audit_id?: unknown; response_id?: unknown };
  try { body = await req.json(); } catch { return json(req, { error: 'Invalid JSON body' }, 400); }
  const auditId = typeof body.audit_id === 'string' ? body.audit_id : '';
  const responseId = typeof body.response_id === 'string' ? body.response_id : '';
  if (!auditId || !responseId) return json(req, { error: 'audit_id and response_id are required' }, 400);

  // 3. Audit access gate via JWT (RLS filters).
  const { data: auditRow, error: auditErr } = await userClient
    .from('client_audits')
    .select('id, audit_type, snapshot_rto_name, snapshot_rto_number, snapshot_cricos_code, is_cricos, is_rto, subject_tenant_id, template_id')
    .eq('id', auditId)
    .maybeSingle();
  if (auditErr || !auditRow) return json(req, { error: "You don't have access to this audit." }, 403);
  const audit = auditRow as JsonRow;
  // Note: when corpus retrieval is added here, resolve framework via
  // compliance_templates.framework and pass `framework` to
  // retrieve-srto-context (see draft-finding for the canonical mapping).

  // 4. Service-role admin client for usage cap, log, suggestion write.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 5. Daily cap check.
  const today = new Date().toISOString().slice(0, 10);
  const { count: usedToday, error: capErr } = await admin
    .from('ai_evidence_analysis_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', callerUserId)
    .eq('usage_date', today)
    .eq('status', 'success');
  if (capErr) console.error('Cap check failed', capErr.message);
  if ((usedToday ?? 0) >= DAILY_CAP) {
    return json(req, { error: `Daily AI evidence analysis limit reached (${DAILY_CAP}). Resets at midnight UTC.`, cap: DAILY_CAP }, 429);
  }

  // 6. Load response + question + linked documents (under caller JWT).
  const { data: responseRow, error: respErr } = await userClient
    .from('client_audit_responses')
    .select(`
      id, audit_id, question_id, rating, notes,
      compliance_template_questions:question_id (
        clause, audit_statement, evidence_to_sight,
        corrective_action, response_set, flagged_responses
      )
    `)
    .eq('id', responseId)
    .eq('audit_id', auditId)
    .maybeSingle();
  if (respErr || !responseRow) return json(req, { error: 'Response not found in this audit' }, 404);
  const r = responseRow as JsonRow;
  const q = r.compliance_template_questions ?? {};

  const { data: links, error: linkErr } = await userClient
    .from('client_audit_response_documents')
    .select('document_id')
    .eq('response_id', responseId);
  if (linkErr) return json(req, { error: 'Failed to load linked documents', detail: linkErr.message }, 500);
  if (!links || links.length === 0) {
    return json(req, { error: 'No documents linked to this response. Link evidence first.' }, 400);
  }
  const documentIds = (links as JsonRow[]).map((l) => l.document_id);

  // 7. Load documents (admin — already gated by audit-access above) and
  //    enforce cross-tenant defence-in-depth: every document.tenant_id must
  //    equal audit.subject_tenant_id.
  const { data: docs, error: docsErr } = await admin
    .from('documents')
    .select('id, title, tenant_id, uploaded_files, file_names')
    .in('id', documentIds);
  if (docsErr || !docs) return json(req, { error: 'Failed to load documents', detail: docsErr?.message ?? null }, 500);

  for (const d of docs) {
    if (d.tenant_id !== null && d.tenant_id !== audit.subject_tenant_id) {
      console.warn(`Cross-tenant document leakage attempt: doc=${d.id} doc.tenant=${d.tenant_id} audit.tenant=${audit.subject_tenant_id} caller=${callerUserId}`);
      return json(req, { error: 'One or more linked documents do not belong to this audit\'s tenant.' }, 403);
    }
  }

  // 8. Download + extract.
  const sources: { name: string; text: string; documentId: number }[] = [];
  for (const d of docs as JsonRow[]) {
    const files: string[] = Array.isArray(d.uploaded_files) ? d.uploaded_files : [];
    const names: string[] = Array.isArray(d.file_names) ? d.file_names : [];
    for (let i = 0; i < files.length; i++) {
      const path = files[i];
      const displayName = names[i] || path.split('/').pop() || `doc-${d.id}`;
      try {
        const { data: blob, error: dlErr } = await admin.storage.from(STORAGE_BUCKET).download(path);
        if (dlErr || !blob) { console.warn(`Download failed ${path}: ${dlErr?.message}`); continue; }
        const ab = await blob.arrayBuffer();
        if (ab.byteLength > MAX_DOC_BYTES) { console.warn(`Skipping ${path} — exceeds ${MAX_DOC_BYTES} bytes`); continue; }
        const text = (await extractAny(path, new Uint8Array(ab))).slice(0, MAX_TEXT_CHARS_PER_DOC);
        if (text.trim().length === 0) { console.warn(`Empty extraction for ${path}`); continue; }
        sources.push({ name: displayName, text, documentId: d.id });
      } catch (e) {
        console.error(`Failed processing ${path}:`, (e as Error).message);
      }
    }
  }

  if (sources.length === 0) {
    return json(req, { error: 'Could not extract text from any linked document.' }, 422);
  }

  // 9. Build the user prompt.
  const evidenceBlock = sources
    .map((s) => `### Source: ${s.name}\n${s.text}`)
    .join('\n\n---\n\n');

  const scopeBits: string[] = [];
  if (audit.is_rto) scopeBits.push('RTO');
  if (audit.is_cricos) scopeBits.push('CRICOS');
  const scope = scopeBits.join(' + ') || 'RTO';

  const userPrompt = `Analyse the following evidence against a single audit question.

CLIENT
- Name: ${audit.snapshot_rto_name ?? 'unknown'}
- RTO code: ${audit.snapshot_rto_number ?? 'N/A'}
- CRICOS code: ${audit.snapshot_cricos_code ?? 'N/A'}
- Audit type: ${audit.audit_type ?? 'unknown'}
- Scope: ${scope}

QUESTION (clause ${q.clause ?? 'n/a'})
${q.audit_statement ?? '(no statement)'}

EVIDENCE THAT SHOULD BE SIGHTED
${q.evidence_to_sight ?? '(none specified)'}

ALLOWED RATINGS FOR THIS QUESTION
${q.response_set ?? 'compliant | at_risk | non_compliant | na'}

EXISTING AUDITOR NOTE
${(r.notes && r.notes.trim().length > 0) ? r.notes : '(none)'}

UPLOADED EVIDENCE (${sources.length} file${sources.length === 1 ? '' : 's'})
${evidenceBlock}

Return your suggestion as JSON matching the schema in the system prompt. Every quote in "excerpts" MUST appear verbatim in one of the source documents above.`;

  // 10. Call Gemini.
  let raw: unknown;
  try {
    const aiResp = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        generationConfig: {
          response_mime_type: 'application/json',
          max_output_tokens: 8192,
        },
      }),
    });

    if (aiResp.status === 429) {
      await admin.from('ai_evidence_analysis_usage').insert({
        user_id: callerUserId, response_id: responseId, audit_id: auditId,
        document_count: sources.length, model: MODEL, status: 'rate_limited', error: 'gateway 429',
      });
      return json(req, { error: 'AI gateway is rate limited. Try again shortly.' }, 429);
    }
    if (aiResp.status === 402) {
      return json(req, { error: 'AI credits exhausted. Add credits in Lovable AI workspace settings.' }, 402);
    }
    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error('Gateway error', aiResp.status, txt);
      return json(req, { error: `AI call failed (${aiResp.status})` }, 502);
    }
    const aiJson = await aiResp.json();
    const content = aiJson?.choices?.[0]?.message?.content;
    const finishReason = aiJson?.choices?.[0]?.finish_reason;
    if (!content) return json(req, { error: 'AI returned no content' }, 502);
    raw = safeParse(content);
    if (raw === null || finishReason === 'length') {
      console.error('Gemini analyse-evidence unparseable', {
        finish_reason: finishReason,
        contentPreview: typeof content === 'string' ? content.slice(0, 500) : content,
        usage: aiJson?.usage,
      });
      if (raw === null) return json(req, { error: 'AI response was not valid JSON' }, 502);
    }
  } catch (e) {
    console.error('Gemini call threw:', (e as Error).message);
    return json(req, { error: 'AI call failed' }, 502);
  }

  const v = validateOut(raw);
  if (!v.ok) return json(req, { error: `AI output invalid: ${v.reason}` }, 502);
  const out = v.out;

  // 11. Hallucination check — every excerpt must be findable in a source.
  const verifiedExcerpts: { quote: string; source: string; verified_against: string }[] = [];
  const rejectedExcerpts: { quote: string; source: string }[] = [];
  for (const ex of out.excerpts) {
    if (typeof ex?.quote !== 'string' || typeof ex?.source !== 'string') continue;
    const check = excerptFoundInCorpus(ex.quote, sources);
    if (check.found) {
      verifiedExcerpts.push({ quote: ex.quote, source: ex.source, verified_against: check.sourceName! });
    } else {
      rejectedExcerpts.push({ quote: ex.quote, source: ex.source });
    }
  }
  if (rejectedExcerpts.length > 0) {
    console.warn('Rejected hallucinated excerpts:', JSON.stringify(rejectedExcerpts));
  }

  const confidenceNumber = out.confidence === 'high' ? 0.85 : out.confidence === 'medium' ? 0.6 : 0.35;
  const analysisId = crypto.randomUUID();

  // 12. Persist suggestion to client_audit_responses.
  const { error: updErr } = await admin
    .from('client_audit_responses')
    .update({
      ai_suggested_rating: out.suggested_rating,
      ai_suggested_notes: out.rationale,
      ai_confidence: confidenceNumber,
      ai_analyzed_at: new Date().toISOString(),
      ai_analysis_id: analysisId,
      ai_excerpts: verifiedExcerpts,
      ai_gaps: out.gaps,
      ai_model: MODEL,
    })
    .eq('id', responseId);
  if (updErr) {
    console.error('Failed to persist AI suggestion', updErr.message);
    return json(req, { error: 'Failed to persist suggestion', detail: updErr.message }, 500);
  }

  // 13. Log usage.
  await admin.from('ai_evidence_analysis_usage').insert({
    user_id: callerUserId,
    response_id: responseId,
    audit_id: auditId,
    document_count: sources.length,
    model: MODEL,
    status: 'success',
  });

  const elapsedMs = Date.now() - t0;
  return json(req, {
    ok: true,
    analysis_id: analysisId,
    suggested_rating: out.suggested_rating,
    rationale: out.rationale,
    excerpts: verifiedExcerpts,
    rejected_excerpt_count: rejectedExcerpts.length,
    gaps: out.gaps,
    confidence: out.confidence,
    confidence_score: confidenceNumber,
    documents_analysed: sources.length,
    elapsed_ms: elapsedMs,
    model: MODEL,
  }, 200);
});
