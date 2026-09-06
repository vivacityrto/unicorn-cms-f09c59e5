/**
 * draft-finding
 *
 * Generates a polished, standards-cited draft of an audit finding for a
 * single flagged response (at_risk or non_compliant). The draft is never
 * persisted automatically — the auditor reviews and edits it inside
 * AddFindingForm, then the existing finding-creation flow saves it.
 *
 * Pipeline: caller-JWT auth → audit-access gate →
 * pull response/question/section/audit row → semantic retrieval over
 * srto_corpus → Gemini 2.5 Pro draft → validate + retry once → log to
 * client_audit_log via service role → return draft + provenance.
 *
 * Auth: caller JWT only for the data path. The append-only log insert
 * uses the service role per the project's edge-function-staff-authorization
 * pattern (client_audit_log RLS only allows Super Admin INSERT today; the
 * service-role write happens AFTER the JWT auth gate has passed).
 *
 * Model: google/gemini-2.5-pro via the Lovable AI Gateway. Anthropic is
 * not currently routed by the gateway in this project. If voice fidelity
 * proves insufficient against Sam's existing Smart Education findings,
 * swap to a direct Anthropic call by adding ANTHROPIC_API_KEY and
 * changing the gateway URL + model — the rest of the pipeline is identical.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-pro';
const MAX_AUDITOR_NOTE_INPUT_CHARS = 20_000;
const MAX_AUDITOR_NOTE_PROMPT_CHARS = 8_000;

// ─── Helpers ────────────────────────────────────────────────────────
function json(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function truncateForPrompt(value: string | null, maxChars: number): string | null {
  if (!value || value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[Note truncated for AI context]`;
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

const BANNED_TERMS = [
  /\bdirectors?\b/i,
  /\bboard members?\b/i,
  /\b(?:the )?board\b(?! of)/i, // "the board" but not "board of studies" etc.
  /\blanguage model\b/i,
  /\bAI\b/, // "AI" as a standalone word
  /\bartificial intelligence\b/i,
  /\bas an AI\b/i,
  /\bdraft for review\b/i,
  /\bI am drafting\b/i,
];

function findBannedTerm(text: string): string | null {
  for (const re of BANNED_TERMS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/**
 * Detect a verbatim Standards excerpt longer than 30 words.
 *
 * Discriminates Standards excerpts (quoted span sitting next to a clause
 * citation) from AI prose-in-quotes (stylistic emphasis without a citation).
 * Only the former is rejected — the 30-word cap is a copyright/compliance
 * guard for verbatim Standards reproduction, not a stylistic constraint.
 */
const CLAUSE_CITATION = /\b(?:Std|Standard|Clause|Section|s\.?)\s*\d+(?:\.\d+)?(?:\([a-z]\))?/i;
const FRAMEWORK_CITATION = /\b(?:SRTOs?\s*2025|National\s*Code\s*2018|ESOS\s*Act)\s+(?:Standard|Clause|Section|s\.?)\s*\d/i;
const ADJACENT_WINDOW = 50;

function findOverlongStandardsExcerpt(
  text: string,
): { snippet: string; words: number; citation: string } | null {
  const re = /["“]([^"”]{30,})["”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const words = m[1].trim().split(/\s+/).length;
    if (words <= 30) continue;
    const start = m.index;
    const end = m.index + m[0].length;
    const before = text.slice(Math.max(0, start - ADJACENT_WINDOW), start);
    const after = text.slice(end, end + ADJACENT_WINDOW);
    const ctx = before + ' ' + after;
    const citation = ctx.match(FRAMEWORK_CITATION)?.[0] ?? ctx.match(CLAUSE_CITATION)?.[0];
    if (!citation) continue; // AI prose-in-quotes — not a Standards excerpt; skip.
    return { snippet: m[1].slice(0, 120) + '…', words, citation };
  }
  return null;
}

// ─── System prompt (with Sam's verbatim few-shot exemplars) ────────
const SYSTEM_PROMPT = `You are an expert RTO compliance auditor drafting a finding for review by a senior consultant at Vivacity Coaching & Consulting. Your draft will be edited and signed off by a human auditor — your job is to give them a strong, specific starting point, not to publish.

VOICE
- Authoritative, professional, calm, technical.
- Direct and specific — name the gap, name the consequence.
- Australian English spelling (recognise, organisation, behaviour, licence as noun, license as verb, programme, prioritise, utilise).
- Use the term "Governing Persons" for the people who govern the RTO. Never use "directors", "board", or "board members".

WHAT YOU MAY DO
- Paraphrase Standards for RTOs 2025 clauses, Compliance Requirements, the Credential Policy, and Practice Guides.
- Quote short fragments from a Standard when precision matters — strictly ≤30 words per quoted span, in straight double quotes, with the clause cited inline.
- Reference specific Unicorn document names if supplied — they are policy templates the RTO can use to remediate.
- Suggest a corrective action grounded in the question's existing corrective_action template plus the retrieved corpus.
- Express uncertainty when the auditor's note is thin or the corpus retrieval was weak.

WHAT YOU MUST NOT DO
- Invent facts the auditor did not observe. If the auditor's note says "no evidence of validation", do NOT write "validation has not been conducted in the past three years" — that is fabrication.
- Quote a Standards excerpt longer than 30 words. The validator rejects any double-quoted span over 30 words when it sits next to a clause citation; paraphrase, or split into two short quotations.

QUOTATION CONVENTIONS — STRICT
- Use double quotes ONLY for verbatim excerpts from Standards documents (SRTOs 2025, National Code 2018, ESOS Act). Always include the clause citation immediately before or after the quoted span, e.g. "...continuous improvement..." (Std 1.5).
- For your own emphasis, characterisation, or framing, use NO markup. Write directly in your own voice without quotation marks.
- For terms of art or technical labels, use italics or no markup — never double quotes.
- A double-quoted span without a nearby clause citation will be treated as a malformed Standards excerpt.
- Generate findings for compliant or NA responses — only at_risk and non_compliant ratings warrant a finding.
- Output anything other than valid JSON matching the schema below.
- Mention that you are an AI, that this is a draft, or that a human will review — the calling system handles those signals.

PRIORITY RUBRIC
- "critical": ASQA escalation likely; qualifications at risk of cancellation; student safety or financial harm; fundamental governance breach.
- "high": material non-compliance with student or training quality impact; remediation needed before next cohort.
- "medium": process or documentation gap; remediation needed in normal course of operations.

OUTPUT SCHEMA (return JSON only, no preamble or postamble):
{
  "summary": "One sentence, 20-30 words. Names the non-compliance directly.",
  "detail": "Two to four short paragraphs. First paragraph: what was observed and against which clause. Middle paragraph(s): why this matters in context of SRTO 2025. Final paragraph: link to the auditor's specific observation.",
  "standard_reference": "The clause(s) and any specific Practice Guides referenced. Format like: 'SRTOs 2025 Standard 1.5; Practice Guide on Assessment'.",
  "impact": "One to two paragraphs on consequences if uncorrected. Be specific about who is affected and how.",
  "priority": "critical | high | medium",
  "suggested_corrective_action": "One to two paragraphs. Reference Unicorn documents by name when supplied.",
  "confidence": "high | medium | low",
  "uncertainty_notes": "Null when confidence is high. Otherwise a short note flagging what the auditor should verify."
}

VOICE EXEMPLARS — match this register, specificity, and consequence-focus.

EXEMPLAR 1 (Training & Assessment validation, priority: critical):
{
  "summary": "Validation process, recording and following the schedule",
  "detail": "Purchasing RTO will need to revalidate the training products before they are delivered to ensure the assessment tools are fit-for-purpose.\\n\\nCurrently there would be a non-compliance with Quality Area 1 Training and Assessment, Division 2 Assessment Standard 1.5.",
  "impact": "Lack of validation process and ongoing systems contravenes the outcome standard for Training and assessment quality assurance.",
  "priority": "critical"
}

EXEMPLAR 2 (Workforce credentials, priority: high):
{
  "summary": "Allocation of delivery by each trainer not identified",
  "detail": "Yash's trainer matrix shows only credentials to deliver 4 units. Tina's trainer matrix lacks detail where she does not hold the same or equivalent unit of competency. Stating that the trainer has worked in hospitality for 25 years does not demonstrate ability to deliver industry relevant, current and unit specific experience. This information should clearly justify what work roles and tasks undertaken, relate directly to the performance criteria at unit level.\\n\\nDiljit's trainer matrix has a unit stated as attained, however these units are not present on his USI transcript.",
  "impact": "If it is found that the trainers do not hold sufficient vocational credentials or relevant, current industry related work experience, the RTO may face significant non-compliances and students who have undertaken previous training with the RTO could be at risk of having their qualifications cancelled due to the RTO not meeting its obligation to conform to the Standards for RTOs 2025. The RTO is at risk and contravenes Division 2 — Trainer and assessor competencies, Standard 3.2 and 3.3 and Standard 4.4.",
  "priority": "high"
}

EXEMPLAR 3 (Governance evidence, priority: critical):
{
  "summary": "Evidence of governance processes not provided for audit",
  "detail": "Unable to determine a fair judgement on this finding as evidence was not presented.",
  "impact": "The RTO will need to ensure policies, procedures and tangible evidence of past, planned, established and implemented governance undertakings.",
  "priority": "critical"
}

Notes on the exemplars: short, direct sentences. Specific names and unit codes when provided. Plain consequences ("qualifications cancelled", "ASQA could", "deemed non-compliant"). Standards cited by clause number. No throat-clearing.`;

// ─── Composition helpers ───────────────────────────────────────────
interface CorpusChunk {
  source_document: string;
  source_type: string;
  clause: string | null;
  heading: string | null;
  content: string;
  similarity: number;
}

interface AssembledContext {
  audit_id: string;
  response_id: string;
  rating: string;
  existing_notes: string | null;
  clause: string | null;
  audit_statement: string;
  evidence_to_sight: string | null;
  corrective_action: string | null;
  unicorn_documents: string | null;
  response_set: string | null;
  flagged_responses: string[] | null;
  section_title: string | null;
  standard_code: string | null;
  audit_type: string | null;
  snapshot_rto_name: string | null;
  snapshot_rto_number: string | null;
  snapshot_cricos_code: string | null;
  is_cricos: boolean;
  is_rto: boolean;
  subject_tenant_id: number;
}

function buildUserPrompt(
  ctx: AssembledContext,
  auditorNote: string | null,
  chunks: CorpusChunk[],
): string {
  const scopeBits: string[] = [];
  if (ctx.is_rto) scopeBits.push('RTO');
  if (ctx.is_cricos) scopeBits.push('CRICOS');
  const scope = scopeBits.join(' + ') || 'RTO';

  const chunksBlock = chunks.length
    ? chunks
        .map(
          (c) =>
            `---\nSource: ${c.source_document}\nClause: ${c.clause ?? 'n/a'}\nHeading: ${c.heading ?? 'n/a'}\n${c.content}`,
        )
        .join('\n')
    : '(no relevant Standards excerpts retrieved — work from the question and your training, and flag low confidence in uncertainty_notes)';

  return `Draft a finding for the following audit observation.

CLIENT
- Name: ${ctx.snapshot_rto_name ?? 'unknown'}
- RTO code: ${ctx.snapshot_rto_number ?? 'N/A'}
- CRICOS code: ${ctx.snapshot_cricos_code ?? 'N/A'}
- Audit type: ${ctx.audit_type ?? 'unknown'}
- Scope: ${scope}

QUESTION (clause ${ctx.clause ?? 'n/a'})
${ctx.audit_statement}

AUDITOR'S RATING: ${ctx.rating}

AUDITOR'S NOTE
${auditorNote && auditorNote.trim().length > 0 ? auditorNote : '(no note provided — work from the question and standards context only, and flag low confidence in uncertainty_notes)'}

EVIDENCE THAT SHOULD HAVE BEEN SIGHTED
${ctx.evidence_to_sight ?? '(none specified)'}

CORRECTIVE ACTION TEMPLATE FOR THIS QUESTION
${ctx.corrective_action ?? '(none specified)'}

UNICORN DOCUMENTS RELEVANT TO REMEDIATION
${ctx.unicorn_documents ?? '(none specified)'}

RELEVANT STANDARDS / PRACTICE GUIDE EXCERPTS
${chunksBlock}

Return your draft as JSON matching the schema in the system prompt.`;
}

// ─── Validation ─────────────────────────────────────────────────────
interface DraftJson {
  summary: string;
  detail: string;
  standard_reference: string;
  impact: string;
  priority: string;
  suggested_corrective_action: string;
  confidence: string;
  uncertainty_notes: string | null;
}

function validateDraft(raw: unknown): { ok: true; draft: DraftJson } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'response not an object' };
  const r = raw as Record<string, unknown>;
  const requiredStrings = ['summary', 'detail', 'standard_reference', 'impact', 'priority', 'suggested_corrective_action', 'confidence'];
  for (const k of requiredStrings) {
    if (typeof r[k] !== 'string' || (r[k] as string).trim().length === 0) {
      return { ok: false, reason: `${k} missing or empty` };
    }
  }
  if (!['critical', 'high', 'medium'].includes(r.priority as string)) {
    return { ok: false, reason: `priority invalid: ${r.priority}` };
  }
  if (!['high', 'medium', 'low'].includes(r.confidence as string)) {
    return { ok: false, reason: `confidence invalid: ${r.confidence}` };
  }
  if (r.uncertainty_notes !== null && typeof r.uncertainty_notes !== 'string') {
    return { ok: false, reason: 'uncertainty_notes must be string or null' };
  }

  // Combined text for banned-term scan.
  const combined = [r.summary, r.detail, r.standard_reference, r.impact, r.suggested_corrective_action, r.uncertainty_notes ?? '']
    .filter((v): v is string => typeof v === 'string')
    .join('\n');

  const banned = findBannedTerm(combined);
  if (banned) return { ok: false, reason: `banned term: "${banned}"` };

  // Per-field scan so the error message names which field tripped the rule.
  const fields: Array<[string, string]> = [
    ['summary', r.summary as string],
    ['detail', r.detail as string],
    ['standard_reference', r.standard_reference as string],
    ['impact', r.impact as string],
    ['suggested_corrective_action', r.suggested_corrective_action as string],
    ['uncertainty_notes', (r.uncertainty_notes as string) ?? ''],
  ];
  for (const [field, text] of fields) {
    if (!text) continue;
    const overlong = findOverlongStandardsExcerpt(text);
    if (overlong) {
      const over = overlong.words - 30;
      return {
        ok: false,
        reason: `Field '${field}': verbatim Standards excerpt exceeds 30 words (${overlong.words} words, ${over} over). Excerpt: "${overlong.snippet}". Clause citation found nearby: "${overlong.citation}". Suggested fix: paraphrase the Standard's intent, or split into two short quotations of ≤30 words each.`,
      };
    }
  }

  return { ok: true, draft: r as unknown as DraftJson };
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
  if (!LOVABLE_API_KEY) {
    return json(req, { error: 'LOVABLE_API_KEY is not configured' }, 500);
  }

  // 1. Caller-JWT client. Verify auth.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json(req, { error: 'Not authenticated' }, 401);
  const callerUserId = userRes.user.id;

  // 2. Parse body.
  let body: { audit_id?: unknown; response_id?: unknown; auditor_note?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400);
  }
  const auditId = typeof body.audit_id === 'string' ? body.audit_id : '';
  const responseId = typeof body.response_id === 'string' ? body.response_id : '';
  if (!auditId || !responseId) {
    return json(req, { error: 'audit_id and response_id are required' }, 400);
  }
  let auditorNote: string | null = null;
  if (body.auditor_note !== undefined && body.auditor_note !== null) {
    if (
      typeof body.auditor_note !== 'string' ||
      body.auditor_note.length > MAX_AUDITOR_NOTE_INPUT_CHARS
    ) {
      return json(req, 
        { error: `Auditor note must be no more than ${MAX_AUDITOR_NOTE_INPUT_CHARS.toLocaleString()} characters.` },
        400,
      );
    }
    auditorNote = body.auditor_note;
  }
  const auditorNoteForPrompt = truncateForPrompt(auditorNote, MAX_AUDITOR_NOTE_PROMPT_CHARS);

  // 3. Audit access gate — try selecting the audit under the caller JWT.
  // RLS (client_audits_staff_all + client_audits_tenant_read) ensures zero
  // rows for unauthorised callers.
  const { data: auditRow, error: auditErr } = await userClient
    .from('client_audits')
    .select('id, audit_type, snapshot_rto_name, snapshot_rto_number, snapshot_cricos_code, is_cricos, is_rto, subject_tenant_id, template_id')
    .eq('id', auditId)
    .maybeSingle();
  if (auditErr || !auditRow) {
    return json(req, { error: "You don't have access to this audit." }, 403);
  }
  const auditRowTyped = auditRow as Record<string, unknown>;

  // 3b. Resolve the audit's compliance framework so we can route corpus
  // retrieval to the right regulatory framework. CRICOS-only audits go to
  // the National Code; combined audits pass no filter and let cosine
  // similarity surface the right chunks across both frameworks.
  let corpusFramework: 'SRTO_2025' | 'NATIONAL_CODE_2018' | null = null;
  if (auditRowTyped.template_id) {
    const { data: tplRow } = await userClient
      .from('compliance_templates')
      .select('framework')
      .eq('id', auditRowTyped.template_id)
      .maybeSingle();
    const tplFramework = (tplRow as Record<string, unknown> | null)?.framework as string | undefined;
    switch (tplFramework) {
      case 'SRTO_2025_CHC':
      case 'SRTO_2025_MOCK':
      case 'DUE_DILIGENCE':
        corpusFramework = 'SRTO_2025';
        break;
      case 'CRICOS':
        corpusFramework = 'NATIONAL_CODE_2018';
        break;
      case 'DUE_DILIGENCE_COMBINED':
      case 'RTO_CRICOS_CHC':
        corpusFramework = null; // combined: no filter
        break;
      default:
        corpusFramework = null;
    }
  }

  // 4. Service-role admin client for the append-only audit log write.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 5. Pull response + question + section in one round trip.
  const { data: responseRow, error: respErr } = await userClient
    .from('client_audit_responses')
    .select(
      `id, rating, notes, audit_id, section_id, question_id,
       compliance_template_questions:question_id (
         clause, audit_statement, evidence_to_sight,
         corrective_action, unicorn_documents, response_set, flagged_responses
       ),
       client_audit_sections:section_id ( title, standard_code )`,
    )
    .eq('id', responseId)
    .eq('audit_id', auditId)
    .maybeSingle();
  if (respErr || !responseRow) {
    if (respErr) console.error('draft-finding: response lookup failed', respErr.message);
    return json(req, { error: 'Response not found or not in this audit', detail: respErr?.message ?? null }, 404);
  }
  const r = responseRow as Record<string, unknown>;
  const q = r.compliance_template_questions ?? {};
  const s = r.client_audit_sections ?? {};

  // Only at_risk / non_compliant warrant a draft.
  if (!['at_risk', 'non_compliant'].includes(r.rating)) {
    return json(req, { error: 'Drafting is only available for at_risk and non_compliant ratings.' }, 422);
  }

  const ctx: AssembledContext = {
    audit_id: auditId,
    response_id: responseId,
    rating: r.rating,
    existing_notes: r.notes ?? null,
    clause: q.clause ?? null,
    audit_statement: q.audit_statement ?? '',
    evidence_to_sight: q.evidence_to_sight ?? null,
    corrective_action: q.corrective_action ?? null,
    unicorn_documents: q.unicorn_documents ?? null,
    response_set: q.response_set ?? null,
    flagged_responses: q.flagged_responses ?? null,
    section_title: s.title ?? null,
    standard_code: s.standard_code ?? null,
    audit_type: auditRowTyped.audit_type ?? null,
    snapshot_rto_name: auditRowTyped.snapshot_rto_name ?? null,
    snapshot_rto_number: auditRowTyped.snapshot_rto_number ?? null,
    snapshot_cricos_code: auditRowTyped.snapshot_cricos_code ?? null,
    is_cricos: !!auditRowTyped.is_cricos,
    is_rto: !!auditRowTyped.is_rto,
    subject_tenant_id: Number(auditRowTyped.subject_tenant_id),
  };

  // 6. Retrieve corpus chunks via the existing retrieve-srto-context function.
  const retrievalQuery = [ctx.audit_statement, auditorNoteForPrompt ?? '', ctx.existing_notes ?? '']
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 4000);

  let chunks: CorpusChunk[] = [];
  let corpusEmpty = false;
  try {
    const retrievalRes = await fetch(`${SUPABASE_URL}/functions/v1/retrieve-srto-context`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: retrievalQuery.length >= 5 ? retrievalQuery : ctx.audit_statement,
        top_k: 6,
        // threshold omitted: rely on retrieve-srto-context DEFAULT_THRESHOLD (0.5),
        // which matches the score distribution of text-embedding-3-small.
        // clause intentionally NOT passed: audit templates (e.g. RTO Due Diligence)
        // use template-internal section codes (Gov-1, TAQ-1...) that don't exist in
        // srto_corpus.clause, which would zero out retrieval. The audit_statement
        // already encodes the regulatory subject in the embedding. Clause is still
        // surfaced to Gemini in the prompt for context (see line ~204).
        framework: corpusFramework ?? undefined,
      }),
    });
    if (retrievalRes.ok) {
      const retrievalJson = await retrievalRes.json();
    chunks = (retrievalJson.results ?? []).map((row: Record<string, unknown>) => ({
        source_document: row.source_document,
        source_type: row.source_type,
        clause: row.clause ?? null,
        heading: row.heading ?? null,
        content: row.content,
        similarity: Number(row.similarity ?? 0),
      }));
      corpusEmpty = chunks.length === 0;
    } else {
      console.warn('Retrieval non-OK, proceeding without corpus:', retrievalRes.status);
      corpusEmpty = true;
    }
  } catch (e) {
    console.warn('Retrieval threw, proceeding without corpus:', e instanceof Error ? e.message : e);
    corpusEmpty = true;
  }

  // 7. Call the gateway. Up to two attempts: one normal, one corrective if
  // the first response failed validation (parse / schema / banned terms).
  async function callModel(extraSystem?: string): Promise<{ raw: unknown; usage: unknown }> {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + (extraSystem ? `\n\n${extraSystem}` : '') },
      { role: 'user', content: buildUserPrompt(ctx, auditorNoteForPrompt, chunks) },
    ];
    const res = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_format: { type: 'json_object' },
        generationConfig: {
          response_mime_type: 'application/json',
          max_output_tokens: 8192,
        },
      }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error('GATEWAY_429');
      if (res.status === 402) throw new Error('GATEWAY_402');
      const text = await res.text();
      throw new Error(`GATEWAY_${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';
    const finishReason = data.choices?.[0]?.finish_reason;
    const parsed = safeParse(content);
    if (parsed === null || finishReason === 'length') {
      console.error('Gemini draft unparseable', {
        finish_reason: finishReason,
        contentPreview: content.slice(0, 500),
        usage: data.usage,
      });
    }
    return { raw: parsed, usage: data.usage ?? {} };
  }

  let attempt: { raw: unknown; usage: unknown };
  let validation: ReturnType<typeof validateDraft>;
  try {
    attempt = await callModel();
    validation = validateDraft(attempt.raw);
    if (!validation.ok) {
      console.warn('First draft attempt failed validation:', validation.reason);
      attempt = await callModel(
        `Your previous response failed validation: ${validation.reason}. Return JSON only that conforms strictly to the schema. Do not use the words "directors" or "board members". Do not quote any Standard verbatim beyond 30 words. Do not refer to yourself or the drafting process.`,
      );
      validation = validateDraft(attempt.raw);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'GATEWAY_402') {
      return json(req, { error: 'AI credits exhausted. Top up at Settings > Workspace > Usage.' }, 402);
    }
    if (msg === 'GATEWAY_429') {
      return json(req, { error: 'AI gateway rate limit exceeded. Please try again shortly.' }, 429);
    }
    console.error('Gateway call failed:', msg);
    return json(req, { error: 'AI gateway error', detail: msg }, 502);
  }

  if (!validation.ok) {
    return json(req, { error: 'AI draft failed validation after retry', detail: validation.reason }, 502);
  }

  let draft = validation.draft;

  // If the corpus was empty, prepend a verification nudge to uncertainty_notes.
  if (corpusEmpty) {
    const note = 'Standards retrieval returned no relevant excerpts; please verify the standard reference manually.';
    draft = {
      ...draft,
      confidence: draft.confidence === 'high' ? 'medium' : draft.confidence,
      uncertainty_notes: draft.uncertainty_notes
        ? `${note} ${draft.uncertainty_notes}`
        : note,
    };
  }

  const duration_ms = Date.now() - t0;
  const promptTokens = Number(attempt.usage?.prompt_tokens ?? 0);
  const completionTokens = Number(attempt.usage?.completion_tokens ?? 0);

  const corpusSummary = chunks.map((c) => ({
    source_document: c.source_document,
    clause: c.clause,
    heading: c.heading,
    similarity: Number(c.similarity.toFixed(3)),
  }));

  // 8. Write append-only audit log entry via service role.
  const { data: logRow, error: logErr } = await admin
    .from('client_audit_log')
    .insert({
      tenant_id: ctx.subject_tenant_id,
      actor_user_id: callerUserId,
      action: 'ai.finding_drafted',
      entity_type: 'client_audit_responses',
      entity_id: responseId,
      details: {
        auditor_note: auditorNote,
        model: MODEL,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        duration_ms,
        corpus_chunks_used: corpusSummary,
        corpus_empty: corpusEmpty,
        draft,
        confidence: draft.confidence,
      },
    })
    .select('id')
    .single();

  if (logErr) {
    console.error('Audit log insert failed:', logErr.message);
    // Non-fatal for the user but we surface it so ops sees it.
    return json(req, { error: 'Failed to record audit log', detail: logErr.message }, 500);
  }

  return json(req, 
    {
      draft,
      corpus_chunks_used: corpusSummary,
      ai_metadata: {
        model: MODEL,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        duration_ms,
      },
      log_id: (logRow as Record<string, unknown>).id,
    },
    200,
  );
});
