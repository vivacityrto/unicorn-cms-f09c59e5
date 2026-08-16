/**
 * record-finding-decision
 *
 * Companion to draft-finding. Logs whether the auditor accepted, edited,
 * or rejected an AI draft after reviewing it. Append-only. Best-effort
 * from the UI's perspective — the actual finding has already been saved
 * (or discarded) by the time this fires.
 *
 * Auth: caller-JWT for the access gate; service role for the log insert
 * (matches draft-finding for the same RLS reasons).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

function json(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

const VALID_DECISIONS = new Set(['accepted', 'edited', 'rejected']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(req, { error: 'Missing authorisation header' }, 401);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json(req, { error: 'Not authenticated' }, 401);
  const callerUserId = userRes.user.id;

  let body: {
    draft_log_id?: unknown;
    response_id?: unknown;
    decision?: unknown;
    final_summary?: unknown;
    final_priority?: unknown;
    edit_distance_pct?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400);
  }

  const draftLogId = typeof body.draft_log_id === 'string' ? body.draft_log_id : '';
  const responseId = typeof body.response_id === 'string' ? body.response_id : '';
  const decision = typeof body.decision === 'string' ? body.decision : '';

  if (!draftLogId || !responseId) {
    return json(req, { error: 'draft_log_id and response_id are required' }, 400);
  }
  if (!VALID_DECISIONS.has(decision)) {
    return json(req, { error: 'decision must be accepted | edited | rejected' }, 400);
  }

  const finalSummary =
    typeof body.final_summary === 'string' ? body.final_summary.slice(0, 2000) : null;
  const finalPriority =
    typeof body.final_priority === 'string' ? body.final_priority.slice(0, 32) : null;

  let editDistancePct: number | null = null;
  if (body.edit_distance_pct !== undefined && body.edit_distance_pct !== null) {
    const n = Number(body.edit_distance_pct);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return json(req, { error: 'edit_distance_pct must be 0..100' }, 400);
    }
    editDistancePct = Math.round(n * 100) / 100;
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Verify the draft log row exists, belongs to this caller, and references
  // this response. Looked up via service role because client_audit_log RLS
  // restricts non-Super-Admin SELECTs.
  const { data: draftRow, error: draftErr } = await admin
    .from('client_audit_log' as any)
    .select('id, tenant_id, actor_user_id, entity_id, action')
    .eq('id', draftLogId)
    .maybeSingle();
  if (draftErr || !draftRow) {
    return json(req, { error: 'Draft log entry not found' }, 404);
  }
  const d = draftRow as Record<string, any>;
  if (d.action !== 'ai.finding_drafted') {
    return json(req, { error: 'Referenced log row is not an AI draft' }, 400);
  }
  if (d.actor_user_id !== callerUserId) {
    return json(req, { error: 'Draft log belongs to a different user' }, 403);
  }
  if (d.entity_id !== responseId) {
    return json(req, { error: 'Draft log does not match this response' }, 400);
  }

  const { error: insErr } = await admin.from('client_audit_log' as any).insert({
    tenant_id: d.tenant_id,
    actor_user_id: callerUserId,
    action: 'ai.finding_decision',
    entity_type: 'client_audit_responses',
    entity_id: responseId,
    details: {
      draft_log_id: draftLogId,
      decision,
      edit_distance_pct: editDistancePct,
      final_summary: finalSummary,
      final_priority: finalPriority,
    },
  });

  if (insErr) {
    console.error('Decision log insert failed:', insErr.message);
    return json(req, { error: 'Failed to record decision', detail: insErr.message }, 500);
  }

  return json(req, { ok: true }, 200);
});
