/**
 * draft-executive-summary
 *
 * Wave 4 #2 capstone — synthesises the executive narrative for a near-complete
 * audit. Reads every finding, the section rollup, and corpus chunks for the
 * most-cited critical/high clauses; returns a coherent four-part draft
 * (executive_summary, overall_finding, risk_rationale, action_plan_rollup).
 * Never writes to client_audits — the auditor accepts each field via the UI.
 *
 * Auth: caller-JWT for the data path (RLS-enforced via client_audits select).
 * Service role only for the append-only client_audit_log insert and the
 * cool-down count, both AFTER the auth gate has passed.
 *
 * Cool-down: 5 minutes per audit. Once-per-audit synthesis, not per-question
 * drafting — daily cap intentionally omitted.
 *
 * Validation gate: the client_audit_log insert is structurally unreachable
 * unless validateDraft(...).ok === true (discriminated-union narrow). A
 * half-validated draft cannot reach the prompt-tuning dashboard.
 *
 * Per-clause retrieval failures are logged to console.warn only — never to
 * client_audit_log. The log entry records corpus_empty + successful_retrievals;
 * per-clause failure detail belongs in stderr for ops debugging.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { validateDraft, type DraftJson, type ValidationResult } from './_validation.ts';

// Re-export for any historical importers (test now imports from _validation.ts).
export { validateDraft };
export type { DraftJson, ValidationResult };

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-pro';
const COOLDOWN_MINUTES = 5;
const MAX_CLAUSE_RETRIEVALS = 8;
const MIN_FINDINGS_FOR_SYNTHESIS = 3;

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

// validateDraft + types now live in _validation.ts (extracted so the test
// suite can import them without transitively executing Deno.serve()).

// ─── System prompt ──────────────────────────────────────────────────
// EXEMPLARS placeholder: Sam to supply 2–3 redacted historical executive
// summaries (one CRICOS/Combined, one CHC/Mock, one Due Diligence).
// Replace {{EXEMPLARS_PENDING}} with verbatim prose; redact identifying
// info to [Client Name] / [RTO Code] but preserve sentence structure.
const EXEMPLARS_BLOCK = `{{EXEMPLARS_PENDING}}`;

const SYSTEM_PROMPT = `You are an expert RTO compliance auditor synthesising the executive narrative for a completed audit, on behalf of a senior consultant at Vivacity Coaching & Consulting. Your draft will be reviewed and edited by a human auditor before publication. Read the entire audit — every finding, every section assessment, every priority signal — and produce a coherent narrative that another senior auditor would recognise as one professional's considered view of the whole audit.

VOICE
- Authoritative, professional, calm, and precise — but written for the RTO's own leadership team to read directly, not for a fellow auditor. This is the client-facing report; assume the reader knows their RTO well but has not memorised the Standards' clause numbering.
- Synthesise; do not list. The reader should feel they are hearing one auditor's view, not reading a roll-up.
- Direct and specific. Name the consequences, and explain what a cited standard requires in plain terms rather than assuming the number alone communicates it.
- Australian English spelling.
- Use "Governing Persons" for the people who govern the RTO. Never use "directors", "board", or "board members".

WHAT YOU MAY DO
- Quote short fragments from a Standard when precision matters — strictly ≤30 words per quoted span, in straight double quotes, with the clause cited inline.
- Reference clauses by their full identifier (for example SRTOs 2025 Standard 1.5; National Code 2018 Standard 7.1) — but always pair the citation with a plain-language gloss of what it actually requires, so a reader unfamiliar with the Standards' numbering isn't left with a bare citation.
- Weight critical findings as the dominant narrative thread.
- Justify the auto-derived risk rating by reference to the specific findings that drove it.
- Express uncertainty when finding evidence is thin or contradictory.

WHAT YOU MUST NOT DO
- Invent findings, evidence, or standards references not present in the source data.
- Override the risk_rating value — it is computed elsewhere; you explain it, you do not decide it.
- Reference any finding ID that is not in the FINDINGS list provided. Every linked_finding_ids value MUST come from that list.
- Include a finding's internal ID/UUID (the FINDING_ID value) anywhere in executive_summary, overall_finding, risk_rationale, or any narrative/summary text in action_plan_rollup. Those are internal database identifiers the client must never see — describe the finding by what it says, not by its ID. UUIDs belong ONLY in the linked_finding_ids arrays.
- Output anything other than valid JSON matching the schema below.
- Mention that you are an AI, that this is a draft, or that a human will review.
- Quote a Standards excerpt longer than 30 words. The validator rejects any double-quoted span over 30 words when it sits next to a clause citation; paraphrase, or split into two short quotations.

QUOTATION CONVENTIONS — STRICT
- Use double quotes ONLY for verbatim excerpts from Standards documents (SRTOs 2025, National Code 2018, ESOS Act). Always include the clause citation immediately before or after the quoted span, e.g. "...continuous improvement..." (Std 1.5).
- For your own emphasis, characterisation, or framing, use NO markup. Write directly in your own voice without quotation marks.
- For terms of art or technical labels, use italics or no markup — never double quotes.
- A double-quoted span without a nearby clause citation will be treated as a malformed Standards excerpt.

EXECUTIVE SUMMARY STRUCTURE (3–5 paragraphs)
- Paragraph 1: Audit context — what was audited, why, the headline conclusion.
- Paragraph 2: Most consequential findings — synthesised, not enumerated.
- Paragraph 3 (if applicable): Secondary themes — supporting findings that contextualise but do not drive the narrative.
- Paragraph 4: Forward-looking note — what remediation will require, in broad terms.
- Final paragraph: Closing positioning — confidence in the RTO's capacity to remediate, framed honestly.

OVERALL FINDING (1–2 sentences)
- Captures the audit's bottom line. If the audit is Extreme or Critical Risk, say so directly. If it is Compliant, say that too.

RISK RATIONALE (1–2 paragraphs)
- Explain the auto-derived risk_rating by reference to the dominant findings. Do not change the rating.
- Be specific: name the clauses, name the consequence categories.

ACTION PLAN ROLLUP STRUCTURE
- introduction: 2–3 sentence framing of the remediation work overall.
- priority_groups: ordered critical → high → medium. Each group's narrative explains why these actions cluster, then enumerates the specific actions, each linked back to the finding(s) it addresses via linked_finding_ids.
- closing: 1–2 sentence implementation note (sequencing, ownership, expected timeline category).

CONFIDENCE
- "high" when findings are detailed and consistent.
- "medium" when some findings are thin or contradict each other.
- "low" when fewer than 5 findings exist or auditor notes are largely absent.

OUTPUT SCHEMA (return JSON only):
{
  "executive_summary": "string",
  "overall_finding": "string",
  "risk_rationale": "string",
  "action_plan_rollup": {
    "introduction": "string",
    "priority_groups": [
      {
        "priority": "critical" | "high" | "medium",
        "narrative": "string",
        "actions": [
          { "summary": "string", "linked_finding_ids": ["uuid", "..."] }
        ]
      }
    ],
    "closing": "string"
  },
  "confidence": "high" | "medium" | "low",
  "uncertainty_notes": null | "string"
}

EXEMPLARS
${EXEMPLARS_BLOCK}`;

interface CorpusChunk {
  source_document: string;
  source_type: string;
  clause: string | null;
  heading: string | null;
  content: string;
  similarity: number;
}

interface FindingRow {
  id: string;
  summary: string;
  detail: string | null;
  regulatory_reference: string | null;
  standard_reference: string | null;
  impact: string | null;
  priority: string;
  clause: string | null;
  section_title: string | null;
  code_prefix: string | null;
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

  // 2. Body.
  let body: { audit_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400);
  }
  const auditId = typeof body.audit_id === 'string' ? body.audit_id : '';
  if (!auditId) return json(req, { error: 'audit_id is required' }, 400);

  // 3. Audit access gate via RLS.
  const { data: auditRow, error: auditErr } = await userClient
    .from('client_audits' as any)
    .select(
      `id, title, audit_type, risk_rating, score_total, score_max, score_pct,
       snapshot_rto_name, snapshot_rto_number, snapshot_cricos_code,
       is_rto, is_cricos, training_products, subject_tenant_id, template_id`,
    )
    .eq('id', auditId)
    .maybeSingle();
  if (auditErr || !auditRow) {
    console.error('[draft-executive-summary] audit access denied', {
      auditId,
      callerUserId,
      errorMessage: auditErr?.message ?? null,
      errorCode: (auditErr as any)?.code ?? null,
    });
    return json(req, { error: "You don't have access to this audit." }, 403);
  }
  const audit = auditRow as Record<string, any>;

  // 3b. Resolve framework from compliance_templates.
  let templateFramework: string | null = null;
  let corpusFramework: 'SRTO_2025' | 'NATIONAL_CODE_2018' | null = null;
  if (audit.template_id) {
    const { data: tplRow } = await userClient
      .from('compliance_templates' as any)
      .select('framework')
      .eq('id', audit.template_id)
      .maybeSingle();
    templateFramework = (tplRow as Record<string, any> | null)?.framework ?? null;
    switch (templateFramework) {
      case 'SRTO_2025_CHC':
      case 'SRTO_2025_MOCK':
      case 'DUE_DILIGENCE':
        corpusFramework = 'SRTO_2025';
        break;
      case 'CRICOS':
        corpusFramework = 'NATIONAL_CODE_2018';
        break;
      default:
        // Combined / unknown — cross-framework retrieval.
        corpusFramework = null;
    }
  }

  // 4. Service-role admin client for cool-down + log writes.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 5. Cool-down — 5 minutes per audit.
  const cooldownSince = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString();
  const { count: recentCount, error: cdErr } = await admin
    .from('client_audit_log' as any)
    .select('id', { count: 'exact', head: true })
    .eq('action', 'ai.executive_summary_drafted')
    .eq('entity_id', auditId)
    .gte('created_at', cooldownSince);
  if (cdErr) {
    console.error('Cool-down check failed:', cdErr.message);
  } else if ((recentCount ?? 0) >= 1) {
    return json(req, 
      {
        error: `You generated an executive summary draft for this audit less than ${COOLDOWN_MINUTES} minutes ago. Please wait before regenerating.`,
        cooldown_minutes: COOLDOWN_MINUTES,
      },
      429,
    );
  }

  // 6. Findings.
  const { data: findingRowsRaw, error: findingsErr } = await userClient
    .from('client_audit_findings' as any)
    .select(
      `id, summary, detail, regulatory_reference, standard_reference, impact, priority,
       response_id, section_id,
       client_audit_responses:response_id (
         compliance_template_questions:question_id ( clause )
       ),
       client_audit_sections:section_id ( title, code_prefix )`,
    )
    .eq('audit_id', auditId);
  if (findingsErr) {
    return json(req, { error: 'Failed to load findings', detail: findingsErr.message }, 500);
  }
  const findingRows: FindingRow[] = (findingRowsRaw ?? []).map((row: any) => ({
    id: row.id,
    summary: row.summary ?? '',
    detail: row.detail ?? null,
    regulatory_reference: row.regulatory_reference ?? null,
    standard_reference: row.standard_reference ?? null,
    impact: row.impact ?? null,
    priority: row.priority ?? 'medium',
    clause: row.client_audit_responses?.compliance_template_questions?.clause ?? null,
    section_title: row.client_audit_sections?.title ?? null,
    code_prefix: row.client_audit_sections?.code_prefix ?? null,
  }));

  if (findingRows.length < MIN_FINDINGS_FOR_SYNTHESIS) {
    return json(req, 
      {
        error: `An executive summary draft requires at least ${MIN_FINDINGS_FOR_SYNTHESIS} findings. This audit has ${findingRows.length}.`,
      },
      422,
    );
  }

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  findingRows.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
  const findingsByPriority = {
    critical: findingRows.filter((f) => f.priority === 'critical').length,
    high: findingRows.filter((f) => f.priority === 'high').length,
    medium: findingRows.filter((f) => f.priority === 'medium').length,
  };
  const validFindingIds = new Set(findingRows.map((f) => f.id));

  // 7. Sections.
  const { data: sectionRowsRaw } = await userClient
    .from('client_audit_sections' as any)
    .select(
      `id, title, standard_code, audit_phase, code_prefix, risk_level, section_summary, sort_order,
       v_client_audit_section_completion:id ( total_questions, complete_count, findings_required, notes_required, section_state )`,
    )
    .eq('audit_id', auditId)
    .order('sort_order', { ascending: true });

  const sections = (sectionRowsRaw ?? []).map((row: any) => {
    const v = Array.isArray(row.v_client_audit_section_completion)
      ? row.v_client_audit_section_completion[0]
      : row.v_client_audit_section_completion;
    return {
      id: row.id,
      title: row.title,
      standard_code: row.standard_code ?? null,
      code_prefix: row.code_prefix ?? null,
      risk_level: row.risk_level ?? null,
      section_summary: row.section_summary ?? null,
      total_questions: v?.total_questions ?? null,
      complete_count: v?.complete_count ?? null,
      section_state: v?.section_state ?? null,
    };
  });

  // 8. Corpus retrieval — top critical+high clauses by citation count.
  const clauseCounts = new Map<string, number>();
  for (const f of findingRows) {
    if ((f.priority === 'critical' || f.priority === 'high') && f.clause) {
      clauseCounts.set(f.clause, (clauseCounts.get(f.clause) ?? 0) + 1);
    }
  }
  const topClauses = Array.from(clauseCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CLAUSE_RETRIEVALS)
    .map(([clause]) => clause);

  let chunks: CorpusChunk[] = [];
  let successfulRetrievals = 0;
  if (topClauses.length > 0) {
    const retrievals = await Promise.allSettled(
      topClauses.map(async (clause) => {
        const findingForClause = findingRows.find((f) => f.clause === clause);
        const queryText = [findingForClause?.summary, findingForClause?.detail, clause]
          .filter(Boolean)
          .join(' ')
          .slice(0, 2000);
        const res = await fetch(`${SUPABASE_URL}/functions/v1/retrieve-srto-context`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: queryText.length >= 5 ? queryText : clause,
            top_k: 4,
            // threshold omitted: rely on retrieve-srto-context DEFAULT_THRESHOLD (0.5),
            // which matches the score distribution of text-embedding-3-small.
            // clause intentionally NOT passed as a retrieval filter: audit templates
            // (e.g. RTO Due Diligence) use template-internal codes that don't exist
            // in srto_corpus.clause. The clause string is already concatenated into
            // queryText above so it still influences the embedding, and it remains
            // in the assembled prompt and audit log payload below.
            framework: corpusFramework ?? undefined,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`status=${res.status} body=${text.slice(0, 200)}`);
        }
        const j = await res.json();
        return { clause, results: (j.results ?? []) as any[] };
      }),
    );
    const seen = new Set<string>();
    for (let i = 0; i < retrievals.length; i++) {
      const r = retrievals[i];
      const clause = topClauses[i];
      if (r.status !== 'fulfilled') {
        // Per-clause failure detail goes to stderr only — never to client_audit_log.
        // The log records corpus_empty + successful_retrievals counts; per-clause
        // failure detail belongs in function logs for ops debugging.
        console.warn(`retrieve-srto-context failed for clause ${clause}:`, r.reason);
        continue;
      }
      successfulRetrievals++;
      for (const row of r.value.results) {
        const key = `${row.source_document}::${row.clause ?? ''}::${row.heading ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        chunks.push({
          source_document: row.source_document,
          source_type: row.source_type,
          clause: row.clause ?? null,
          heading: row.heading ?? null,
          content: row.content,
          similarity: Number(row.similarity ?? 0),
        });
      }
    }
    chunks.sort((a, b) => b.similarity - a.similarity);
    chunks = chunks.slice(0, 30);
  }
  const corpusEmpty = chunks.length === 0;

  // 9. Build user prompt.
  const scopeBits: string[] = [];
  if (audit.is_rto) scopeBits.push('RTO');
  if (audit.is_cricos) scopeBits.push('CRICOS');
  const scope = scopeBits.join(' + ') || 'RTO';
  const trainingProducts = Array.isArray(audit.training_products)
    ? audit.training_products.join(', ')
    : '(none recorded)';

  const sectionLines = sections
    .map((s) => {
      const head = `- ${s.standard_code ?? ''} ${s.title}: ${s.complete_count ?? 0} of ${s.total_questions ?? 0} responses complete, section state ${s.section_state ?? 'n/a'}, risk level ${s.risk_level ?? 'n/a'}`;
      return s.section_summary ? `${head}\n  ${s.section_summary}` : head;
    })
    .join('\n');

  const findingLines = findingRows
    .map(
      (f) => `---
FINDING_ID: ${f.id}
PRIORITY: ${f.priority}
CLAUSE: ${f.clause ?? 'n/a'}
SECTION: ${f.section_title ?? 'n/a'} (${f.code_prefix ?? 'n/a'})
SUMMARY: ${f.summary}
DETAIL: ${f.detail ?? '(none)'}
IMPACT: ${f.impact ?? '(none)'}
REGULATORY_REFERENCE: ${f.regulatory_reference ?? f.standard_reference ?? '(none)'}`,
    )
    .join('\n');

  const chunksBlock = chunks.length
    ? chunks
        .map(
          (c) =>
            `---\nSource: ${c.source_document}\nFramework: ${c.source_type}\nClause: ${c.clause ?? 'n/a'}\nHeading: ${c.heading ?? 'n/a'}\n${c.content}`,
        )
        .join('\n')
    : '(no relevant Standards excerpts retrieved — work from the findings only and flag medium or low confidence in uncertainty_notes)';

  const userPrompt = `Synthesise the executive narrative for the following completed audit.

CLIENT
- Name: ${audit.snapshot_rto_name ?? 'unknown'}
- RTO code: ${audit.snapshot_rto_number ?? 'N/A'}
- CRICOS code: ${audit.snapshot_cricos_code ?? 'N/A'}
- Audit type: ${audit.audit_type ?? 'unknown'}
- Framework: ${templateFramework ?? 'unknown'}
- Scope: ${scope}
- Training products on scope: ${trainingProducts}

AUDIT SCORE AND RISK
- Score: ${audit.score_total ?? '?'} of ${audit.score_max ?? '?'} (${audit.score_pct ?? '?'}%)
- Auto-derived risk rating: ${audit.risk_rating ?? 'unknown'}
- Total findings: ${findingRows.length} (${findingsByPriority.critical} critical, ${findingsByPriority.high} high, ${findingsByPriority.medium} medium)

SECTION ROLLUP
${sectionLines || '(no sections)'}

FINDINGS (priority-ordered)
${findingLines}

RELEVANT STANDARDS / PRACTICE GUIDE EXCERPTS (top retrieval across critical and high findings)
${chunksBlock}

Return your synthesis as JSON matching the schema in the system prompt. Every linked_finding_ids value must be one of the FINDING_ID values listed above. FINDING_ID is an internal database identifier for your own cross-referencing only — it must NEVER appear in the prose narrative (executive_summary, overall_finding, risk_rationale, or any narrative/summary text); describe each finding by its content there instead.`;

  // 10. Gateway call with one corrective retry.
  async function callModel(extraSystem?: string): Promise<{ raw: any; usage: any }> {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + (extraSystem ? `\n\n${extraSystem}` : '') },
      { role: 'user', content: userPrompt },
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
      console.error('Gemini synthesis unparseable', {
        finish_reason: finishReason,
        contentPreview: content.slice(0, 500),
        usage: data.usage,
      });
    }
    return { raw: parsed, usage: data.usage ?? {} };
  }

  let attempt: { raw: any; usage: any };
  let validation: ValidationResult;
  try {
    attempt = await callModel();
    validation = validateDraft(attempt.raw, validFindingIds);
    if (!validation.ok) {
      console.warn('First synthesis attempt failed validation:', validation.reason);
      const quoteMatch = validation.reason.match(/verbatim Standards excerpt exceeds 30 words \((\d+) words, (\d+) over\)/);
      const quotePrefix = quoteMatch
        ? `Your previous response quoted a Standard for ${quoteMatch[1]} words — ${quoteMatch[2]} over the 30-word cap. Paraphrase the Standard's intent in your own words, or split into two short quotations of ≤30 words each. Remember: only use double quotes for verbatim Standards excerpts (with a clause citation adjacent), never for stylistic emphasis. `
        : '';
      attempt = await callModel(
        `${quotePrefix}Your previous response failed validation: ${validation.reason}. Return JSON only that conforms strictly to the schema. Every linked_finding_ids value must be one of the FINDING_ID values from the FINDINGS section — do NOT invent or modify finding IDs. Do not use the words "directors" or "board members". Use double quotes only for short verbatim Standards excerpts (≤30 words) with a clause citation immediately adjacent; for your own emphasis or framing, use no markup. Do not refer to yourself or the drafting process.`,
      );
      validation = validateDraft(attempt.raw, validFindingIds);
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

  // ── Validation gate ───────────────────────────────────────────────
  // Every code path below this branch sees `validation.ok === true`,
  // so `validation.draft` is structurally accessible. The log insert
  // is unreachable in the failure case.
  if (!validation.ok) {
    return json(req, { error: 'AI draft failed validation after retry', detail: validation.reason }, 502);
  }

  let draft = validation.draft;

  if (corpusEmpty) {
    const note = 'Standards retrieval returned no relevant excerpts; please verify the standard references manually.';
    draft = {
      ...draft,
      confidence: draft.confidence === 'high' ? 'medium' : draft.confidence,
      uncertainty_notes: draft.uncertainty_notes ? `${note} ${draft.uncertainty_notes}` : note,
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

  const sourceSummary = {
    audit_id: auditId,
    audit_type: audit.audit_type,
    total_findings: findingRows.length,
    findings_by_priority: findingsByPriority,
    risk_rating: audit.risk_rating,
    framework: templateFramework ?? null,
  };

  // 11. Append-only audit log via service role.
  const { data: logRow, error: logErr } = await admin
    .from('client_audit_log' as any)
    .insert({
      tenant_id: Number(audit.subject_tenant_id),
      actor_user_id: callerUserId,
      action: 'ai.executive_summary_drafted',
      entity_type: 'client_audits',
      entity_id: auditId,
      details: {
        audit_type: audit.audit_type,
        framework: templateFramework ?? null,
        total_findings: findingRows.length,
        findings_by_priority: findingsByPriority,
        risk_rating: audit.risk_rating,
        model: MODEL,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        duration_ms,
        corpus_empty: corpusEmpty,
        clauses_attempted: topClauses.length,
        successful_retrievals: successfulRetrievals,
        corpus_chunks_used: corpusSummary,
        clauses_retrieved: topClauses,
        draft,
        confidence: draft.confidence,
      },
    })
    .select('id')
    .single();

  if (logErr) {
    console.error('Audit log insert failed:', logErr.message);
    return json(req, { error: 'Failed to record audit log', detail: logErr.message }, 500);
  }

  return json(req, 
    {
      draft,
      source_summary: sourceSummary,
      ai_metadata: {
        model: MODEL,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        duration_ms,
      },
      log_id: (logRow as any).id,
    },
    200,
  );
});
