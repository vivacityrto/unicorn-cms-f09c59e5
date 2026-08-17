/**
 * validate-ai-assist
 *
 * Assessment Validation Tool — Sprint 3 AI layer (Addendum §3.3/§3.7).
 * Three modes, one function, reusing the exact pattern already proven in
 * draft-finding: caller-JWT auth -> access gate -> Lovable AI Gateway call
 * -> schema validation -> write draft rows flagged for human review ->
 * log the interaction. No output here is ever auto-accepted — every row
 * this function writes carries an ai_* flag and is left for a human
 * validator/reviewer to accept or override, per the Golden Rule in the
 * unicorn-assessment-validation-tool skill: "AI handles the volume.
 * Humans handle the meaning."
 *
 * Modes:
 *   - checklist_prefill:     pre-fills validation_checklist_items (desktop
 *                            or peer_review) from kit_text vs unit context.
 *   - mapping_prefill:       proposes validation_mapping_cells (tool <->
 *                            unit requirement) from kit_text.
 *   - evidence_sampling_draft: drafts model responses into
 *                            validation_evidence_sampling_items.
 *
 * NOTE: tga_scope_units / tga_units are empty in this project as of this
 * build, so unit requirement text cannot be pulled live from TGA sync yet.
 * This function takes unit_context / requirements / tasks explicitly in
 * the request body rather than querying those empty tables. Once TGA unit
 * content is populated, the caller can source that context from there
 * without any change to this function.
 *
 * De-identification gate: combined free-text input is scanned for emails,
 * AU phone numbers and "USI:" patterns before anything is sent to the
 * model. This is a mechanical floor, not a substitute for staff stripping
 * student names before pasting kit content — see the skill's Golden Rule
 * on de-identification.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-pro';
const DAILY_CAP = 40;

const MODES = ['checklist_prefill', 'mapping_prefill', 'evidence_sampling_draft'] as const;
type Mode = typeof MODES[number];

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeParse(raw: string): unknown {
  let s = (raw ?? '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const firstStruct = s.search(/[{[]/);
  if (firstStruct > 0) s = s.slice(firstStruct);
  try {
    return JSON.parse(s);
  } catch {
    /* fall through */
  }
  const m = s.match(/[{[][\s\S]*[}\]]/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      /* noop */
    }
  }
  return null;
}

// Mechanical de-identification floor — not exhaustive, not a substitute
// for staff stripping names before pasting kit content.
const PII_PATTERNS = [
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, // email
  /\b(?:\+?61|0)[2-478](?:[ -]?\d){8}\b/, // AU phone
  /\bUSI[:\s]*[A-Za-z0-9]{10}\b/i, // Unique Student Identifier
];

function findPii(text: string): string | null {
  for (const re of PII_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

const PROMPT_TAIL =
  '\n\nDo not make regulatory judgements. Flag areas for human review. ' +
  'Output valid JSON only, matching the schema described above — no preamble, no postamble.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const t0 = Date.now();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorisation header' }, 401);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    return json({ error: 'LOVABLE_API_KEY is not configured' }, 500);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: 'Not authenticated' }, 401);
  const callerUserId = userRes.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const mode = body.mode as Mode;
  if (!MODES.includes(mode)) {
    return json({ error: `mode must be one of: ${MODES.join(', ')}` }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Vivacity staff only — this is an internal drafting aid, not a
  // client-facing action.
  const { data: userRow } = await admin
    .from('users')
    .select('unicorn_role')
    .eq('user_uuid', callerUserId)
    .maybeSingle();
  if (!userRow?.unicorn_role) {
    return json({ error: 'Forbidden: Vivacity staff only' }, 403);
  }

  // Daily cap, shared discipline with draft-finding.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: draftsToday } = await admin
    .from('ai_interaction_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', callerUserId)
    .like('mode', 'validation_%')
    .gte('created_at', since);
  if ((draftsToday ?? 0) >= DAILY_CAP) {
    return json({ error: `Daily AI draft limit reached (${DAILY_CAP}). Try again tomorrow.` }, 429);
  }

  async function callModel(systemPrompt: string, userPrompt: string): Promise<{ raw: unknown; usage: any }> {
    const res = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
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
    return { raw: safeParse(content), usage: data.usage ?? {} };
  }

  async function logInteraction(params: {
    tenantId: number | null;
    promptText: string;
    responseText: string;
    recordsAccessed: unknown;
    requestContext: unknown;
  }) {
    await admin.from('ai_interaction_logs').insert({
      user_id: callerUserId,
      tenant_id: params.tenantId,
      mode: `validation_${mode}`,
      prompt_text: params.promptText,
      response_text: params.responseText,
      records_accessed: params.recordsAccessed,
      request_context: params.requestContext,
    });
  }

  try {
    if (mode === 'checklist_prefill') {
      const sessionId = body.session_id as string;
      const checklistRole = body.checklist_role as string;
      const kitText = (body.kit_text as string) ?? '';
      const unitContext = (body.unit_context as string) ?? '';
      if (!sessionId || !checklistRole || !kitText) {
        return json({ error: 'session_id, checklist_role and kit_text are required' }, 400);
      }
      if (!['validator', 'peer_reviewer'].includes(checklistRole)) {
        return json({ error: "checklist_role must be 'validator' or 'peer_reviewer'" }, 400);
      }
      const piiHit = findPii(kitText + '\n' + unitContext);
      if (piiHit) {
        return json(
          { error: 'De-identification gate: input appears to contain PII. Strip student names/IDs before submitting.', detail: piiHit },
          422,
        );
      }

      const { data: sessionRow, error: sessErr } = await userClient
        .from('validation_sessions')
        .select('id, tool_id, validation_tools:tool_id(subject_tenant_id, unit_code, unit_title)')
        .eq('id', sessionId)
        .maybeSingle();
      if (sessErr || !sessionRow) return json({ error: "You don't have access to this session." }, 403);
      const tenantId = Number((sessionRow as any).validation_tools?.subject_tenant_id ?? null) || null;

      const systemPrompt =
        'You are assisting an RTO compliance validator preparing a desktop validation checklist. ' +
        'Produce a 17-item checklist across 5 sections (assessment conditions; principles of assessment; ' +
        'rules of evidence; mapping to unit requirements; general compliance) against the supplied unit ' +
        'context and assessment tool text. For each item return section_no (1-5), item_no (1-17 overall), ' +
        'item_text, result ("met"|"not_met"|"unclear"), and notes. This is a pre-fill only — a human ' +
        'validator confirms every item. Return JSON: { "items": [ { "section_no": n, "item_no": n, ' +
        '"item_text": "...", "result": "...", "notes": "..." } ] }.' +
        PROMPT_TAIL;
      const userPrompt = `UNIT CONTEXT\n${unitContext}\n\nASSESSMENT TOOL TEXT\n${kitText.slice(0, 20000)}`;

      const { raw, usage } = await callModel(systemPrompt, userPrompt);
      const items = (raw as any)?.items;
      if (!Array.isArray(items) || items.length === 0) {
        return json({ error: 'AI did not return a usable checklist. Try again or fill manually.' }, 502);
      }

      const rows = items
        .filter((it: any) => it?.section_no && it?.item_no && it?.item_text)
        .map((it: any) => ({
          session_id: sessionId,
          checklist_role: checklistRole,
          section_no: Number(it.section_no),
          item_no: Number(it.item_no),
          item_text: String(it.item_text),
          result: ['met', 'not_met', 'unclear'].includes(it.result) ? it.result : 'unclear',
          ai_prefilled: true,
          notes: it.notes ? String(it.notes) : null,
        }));

      const { error: upsertErr } = await admin
        .from('validation_checklist_items')
        .upsert(rows, { onConflict: 'session_id,checklist_role,section_no,item_no' });
      if (upsertErr) return json({ error: 'Failed to write checklist items', detail: upsertErr.message }, 500);

      await logInteraction({
        tenantId,
        promptText: userPrompt.slice(0, 8000),
        responseText: JSON.stringify(raw).slice(0, 8000),
        recordsAccessed: { session_id: sessionId },
        requestContext: { mode, checklist_role: checklistRole, usage },
      });

      return json({ ok: true, items_written: rows.length }, 200);
    }

    if (mode === 'mapping_prefill') {
      const toolId = body.tool_id as string;
      const kitText = (body.kit_text as string) ?? '';
      const requirements = body.requirements as Array<{ requirement_type: string; requirement_ref: string; requirement_text?: string }>;
      const tasks = body.tasks as string[];
      if (!toolId || !kitText || !Array.isArray(requirements) || !Array.isArray(tasks)) {
        return json({ error: 'tool_id, kit_text, requirements[] and tasks[] are required' }, 400);
      }
      const piiHit = findPii(kitText);
      if (piiHit) {
        return json({ error: 'De-identification gate: kit_text appears to contain PII.', detail: piiHit }, 422);
      }

      const { data: toolRow, error: toolErr } = await userClient
        .from('validation_tools')
        .select('id, subject_tenant_id')
        .eq('id', toolId)
        .maybeSingle();
      if (toolErr || !toolRow) return json({ error: "You don't have access to this tool." }, 403);

      const systemPrompt =
        'You are assisting an RTO compliance validator building a mapping matrix between assessment tasks ' +
        'and unit requirements (elements/PCs, performance evidence, knowledge evidence, foundation skills, ' +
        'assessment conditions). For every requirement x task combination that the tool text addresses, ' +
        'return a mapping. Only propose is_mapped=true where the tool text genuinely addresses that ' +
        'requirement — under-propose rather than over-propose; a human validator confirms every cell. ' +
        'Return JSON: { "mappings": [ { "requirement_ref": "...", "task_ref": "...", "is_mapped": true } ] }.' +
        PROMPT_TAIL;
      const userPrompt =
        `REQUIREMENTS\n${JSON.stringify(requirements)}\n\nTASKS\n${JSON.stringify(tasks)}\n\nASSESSMENT TOOL TEXT\n${kitText.slice(0, 20000)}`;

      const { raw, usage } = await callModel(systemPrompt, userPrompt);
      const mappings = (raw as any)?.mappings;
      if (!Array.isArray(mappings)) {
        return json({ error: 'AI did not return a usable mapping. Try again or map manually.' }, 502);
      }

      const reqByRef = new Map(requirements.map((r) => [r.requirement_ref, r]));
      const rows = mappings
        .filter((m: any) => m?.requirement_ref && m?.task_ref && reqByRef.has(m.requirement_ref))
        .map((m: any) => {
          const req = reqByRef.get(m.requirement_ref)!;
          return {
            tool_id: toolId,
            requirement_type: req.requirement_type,
            requirement_ref: req.requirement_ref,
            requirement_text: req.requirement_text ?? null,
            task_ref: String(m.task_ref),
            is_mapped: !!m.is_mapped,
            ai_suggested: true,
          };
        });

      if (rows.length === 0) {
        return json({ ok: true, cells_written: 0, note: 'AI proposed no mappings for the supplied tasks/requirements.' }, 200);
      }

      const { error: upsertErr } = await admin
        .from('validation_mapping_cells')
        .upsert(rows, { onConflict: 'tool_id,requirement_type,requirement_ref,task_ref' });
      if (upsertErr) return json({ error: 'Failed to write mapping cells', detail: upsertErr.message }, 500);

      await logInteraction({
        tenantId: Number((toolRow as any).subject_tenant_id) || null,
        promptText: userPrompt.slice(0, 8000),
        responseText: JSON.stringify(raw).slice(0, 8000),
        recordsAccessed: { tool_id: toolId },
        requestContext: { mode, usage },
      });

      return json({ ok: true, cells_written: rows.length }, 200);
    }

    // evidence_sampling_draft
    const sessionId = body.session_id as string;
    const tasks = body.tasks as Array<{ task_ref: string; unit_requirement_ref?: string }>;
    if (!sessionId || !Array.isArray(tasks) || tasks.length === 0) {
      return json({ error: 'session_id and tasks[] are required' }, 400);
    }

    const { data: sessionRow, error: sessErr } = await userClient
      .from('validation_sessions')
      .select('id, tool_id, validation_tools:tool_id(subject_tenant_id)')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessErr || !sessionRow) return json({ error: "You don't have access to this session." }, 403);
    const tenantId = Number((sessionRow as any).validation_tools?.subject_tenant_id ?? null) || null;

    const systemPrompt =
      'You are assisting an RTO compliance validator with evidence sampling: for each assessment task, ' +
      'draft a model response that would satisfy the mapped unit requirement, then flag whether a typical ' +
      'student response risks being too brief, vague, or narrow relative to that requirement. A human ' +
      'validator edits every model response before it is used. Return JSON: { "items": [ { "task_ref": "...", ' +
      '"model_response": "...", "flag": "ok"|"too_brief"|"vague"|"narrow" } ] }.' +
      PROMPT_TAIL;
    const userPrompt = `TASKS\n${JSON.stringify(tasks)}`;

    const { raw, usage } = await callModel(systemPrompt, userPrompt);
    const items = (raw as any)?.items;
    if (!Array.isArray(items)) {
      return json({ error: 'AI did not return usable model responses.' }, 502);
    }

    const rows = items
      .filter((it: any) => it?.task_ref)
      .map((it: any) => {
        const match = tasks.find((t) => t.task_ref === it.task_ref);
        return {
          session_id: sessionId,
          task_ref: String(it.task_ref),
          unit_requirement_ref: match?.unit_requirement_ref ?? null,
          model_response: it.model_response ? String(it.model_response) : null,
          flag: ['ok', 'too_brief', 'vague', 'narrow'].includes(it.flag) ? it.flag : null,
          ai_drafted: true,
        };
      });

    const { error: insertErr } = await admin.from('validation_evidence_sampling_items').insert(rows);
    if (insertErr) return json({ error: 'Failed to write evidence sampling items', detail: insertErr.message }, 500);

    await logInteraction({
      tenantId,
      promptText: userPrompt.slice(0, 8000),
      responseText: JSON.stringify(raw).slice(0, 8000),
      recordsAccessed: { session_id: sessionId },
      requestContext: { mode, usage },
    });

    return json({ ok: true, items_written: rows.length, duration_ms: Date.now() - t0 }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'GATEWAY_402') {
      return json({ error: 'AI credits exhausted. Top up at Settings > Workspace > Usage.' }, 402);
    }
    if (msg === 'GATEWAY_429') {
      return json({ error: 'AI gateway rate limit exceeded. Please try again shortly.' }, 429);
    }
    console.error('validate-ai-assist error:', msg);
    return json({ error: 'AI gateway error', detail: msg }, 502);
  }
});
