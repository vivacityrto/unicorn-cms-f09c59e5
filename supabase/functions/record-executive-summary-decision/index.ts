/**
 * record-executive-summary-decision
 *
 * Companion to draft-executive-summary. Logs whether the auditor accepted,
 * edited, or rejected each of the three persisted fields (executive_summary,
 * overall_finding, risk_rationale) along with edit-distance percentages.
 * Append-only. Best-effort from the UI's perspective — the actual
 * client_audits row has already been updated (or not) by the time this fires.
 *
 * The action_plan_rollup is render-only / clipboard per Wave 4 #2 §5 and
 * therefore not part of the decision payload.
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

interface FieldDecision {
  decision: 'accepted' | 'edited' | 'rejected';
  edit_distance_pct: number | null;
}
type AuditLogRow = { tenant_id: number | null; actor_user_id: string | null; entity_id: string | null; action: string | null };

function parseFieldDecision(raw: unknown): FieldDecision | null | string {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object') return 'must be an object';
  const r = raw as Record<string, unknown>;
  if (typeof r.decision !== 'string' || !VALID_DECISIONS.has(r.decision)) {
    return 'decision must be accepted | edited | rejected';
  }
  let editDistancePct: number | null = null;
  if (r.edit_distance_pct !== undefined && r.edit_distance_pct !== null) {
    const n = Number(r.edit_distance_pct);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return 'edit_distance_pct must be 0..100';
    }
    editDistancePct = Math.round(n * 100) / 100;
  }
  return {
    decision: r.decision as 'accepted' | 'edited' | 'rejected',
    edit_distance_pct: editDistancePct,
  };
}

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
    audit_id?: unknown;
    executive_summary?: unknown;
    overall_finding?: unknown;
    risk_rationale?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400);
  }

  const draftLogId = typeof body.draft_log_id === 'string' ? body.draft_log_id : '';
  const auditId = typeof body.audit_id === 'string' ? body.audit_id : '';
  if (!draftLogId || !auditId) {
    return json(req, { error: 'draft_log_id and audit_id are required' }, 400);
  }

  const fields: Record<string, FieldDecision | null> = {};
  for (const key of ['executive_summary', 'overall_finding', 'risk_rationale'] as const) {
    const parsed = parseFieldDecision(body[key]);
    if (typeof parsed === 'string') {
      return json(req, { error: `${key}: ${parsed}` }, 400);
    }
    fields[key] = parsed;
  }
  if (Object.values(fields).every((v) => v === null)) {
    return json(req, { error: 'At least one field decision is required' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Verify the draft log row exists, belongs to this caller, and references
  // this audit. Service-role lookup because client_audit_log RLS restricts
  // non-Super-Admin SELECTs.
  const { data: draftRow, error: draftErr } = await admin
    .from('client_audit_log' as never)
    .select('id, tenant_id, actor_user_id, entity_id, action')
    .eq('id', draftLogId)
    .maybeSingle();
  if (draftErr || !draftRow) {
    return json(req, { error: 'Draft log entry not found' }, 404);
  }
  const d = draftRow as unknown as AuditLogRow;
  if (d.action !== 'ai.executive_summary_drafted') {
    return json(req, { error: 'Referenced log row is not an AI executive summary draft' }, 400);
  }
  if (d.actor_user_id !== callerUserId) {
    return json(req, { error: 'Draft log belongs to a different user' }, 403);
  }
  if (d.entity_id !== auditId) {
    return json(req, { error: 'Draft log does not match this audit' }, 400);
  }

  const { error: insErr } = await admin.from('client_audit_log' as never).insert({
    tenant_id: d.tenant_id,
    actor_user_id: callerUserId,
    action: 'ai.executive_summary_decision',
    entity_type: 'client_audits',
    entity_id: auditId,
    details: {
      draft_log_id: draftLogId,
      fields,
    },
  });

  if (insErr) {
    console.error('Decision log insert failed:', insErr.message);
    return json(req, { error: 'Failed to record decision', detail: insErr.message }, 500);
  }

  return json(req, { ok: true }, 200);
});
