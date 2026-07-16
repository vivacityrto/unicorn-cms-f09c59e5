/**
 * release-audit-report
 *
 * Releases a completed client-audit PDF to the tenant portal.
 *
 * WHY THIS EDGE FUNCTION (not the RPC):
 * public.release_audit_report inserts portal_documents with
 * direction='outbound', status='active', source='audit_report' — values that
 * violate check constraints added later (vivacity_to_client / shared /
 * generated). Every real call through the RPC has thrown 23514 for a while,
 * so release logic lives here instead. The RPC is retained and gated as
 * defense-in-depth only.
 *
 * Auth (L3 / 15 Jul 2026 Unicorn security audit addendum):
 * 1. Resolve caller from forwarded Authorization (userClient).
 * 2. Require check_permission(caller, 'audits.report', 'full') — matches UI
 *    usePermission('audits.report'). RLS alone is NOT enough: tenant users
 *    can SELECT their own in-progress audits via client_audits_tenant_read_active,
 *    and client_audits_staff_all admits any is_vivacity_team_safe staffer.
 * 3. Service-role admin only for the portal_documents insert + audit update
 *    AFTER the permission gate has passed.
 *
 * verify_jwt: false — auth handled in-function (anon key is a valid JWT).
 *
 * Keeper-repo note: live source was not pullable in this cloud-agent
 * environment (Supabase MCP needsAuth; interactive OAuth unavailable).
 * Body reconstructed from the dead RPC, corrected constraint values, and the
 * frontend contract in useAuditReport.ts (200 / 403 / 409 / 422). Before
 * deploy, re-pull live via get_edge_function and confirm the only intentional
 * delta is the check_permission gate (+ this header).
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ─── 1. Resolve caller from forwarded Authorization ───────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorisation header' }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return json({ error: 'Not authenticated' }, 401);
    }
    const callerUserId = userRes.user.id;

    // ─── 1b. Explicit permission gate (L3) ────────────────────────────
    // Must run before any audit SELECT / write. RLS SELECT alone lets tenant
    // users read their own in-progress audits and self-release.
    const { data: allowed, error: permErr } = await userClient.rpc(
      'check_permission',
      {
        p_user_id: callerUserId,
        p_feature_key: 'audits.report',
        p_min_level: 'full',
      },
    );
    if (permErr) {
      console.error('[release-audit-report] check_permission failed', {
        callerUserId,
        errorMessage: permErr.message,
      });
      return json({ error: 'Forbidden' }, 403);
    }
    if (!allowed) {
      return json({ error: 'Forbidden' }, 403);
    }

    // ─── 2. Body ──────────────────────────────────────────────────────
    let body: { audit_id?: unknown; release_notes?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const auditId = typeof body.audit_id === 'string' ? body.audit_id.trim() : '';
    if (!auditId) {
      return json({ error: 'audit_id is required' }, 400);
    }
    if (!UUID_RE.test(auditId)) {
      return json({ error: 'audit_id must be a valid UUID' }, 400);
    }

    let releaseNotes: string | null = null;
    if (typeof body.release_notes === 'string') {
      const trimmed = body.release_notes.trim();
      if (trimmed.length > 4000) {
        return json({ error: 'Release notes must be 4000 characters or fewer.' }, 400);
      }
      releaseNotes = trimmed.length > 0 ? trimmed : null;
    }

    // ─── 3. Load audit (RLS via userClient — staff with audits.report) ─
    const { data: auditRow, error: auditErr } = await userClient
      .from('client_audits')
      .select(
        `id, title, doc_number, subject_tenant_id, report_pdf_path,
         report_client_visible, report_released_at, score_pct, score_total`,
      )
      .eq('id', auditId)
      .maybeSingle();

    if (auditErr || !auditRow) {
      console.error('[release-audit-report] audit access denied', {
        auditId,
        callerUserId,
        errorMessage: auditErr?.message ?? null,
      });
      return json({ error: "You don't have access to this audit." }, 403);
    }

    const audit = auditRow as {
      id: string;
      title: string | null;
      doc_number: string | null;
      subject_tenant_id: number;
      report_pdf_path: string | null;
      report_client_visible: boolean;
      report_released_at: string | null;
      score_pct: number | null;
      score_total: number | null;
    };

    // ─── 4. Idempotency / preconditions ───────────────────────────────
    if (audit.report_client_visible) {
      return json(
        {
          error: 'Report already released',
          released_at: audit.report_released_at,
        },
        409,
      );
    }

    if (audit.score_pct == null && audit.score_total == null) {
      return json(
        { error: 'This audit has no score yet — complete the audit first.' },
        422,
      );
    }

    if (!audit.report_pdf_path) {
      return json(
        { error: 'No report PDF has been generated yet' },
        422,
      );
    }

    // ─── 5. Service-role writes (after permission gate) ───────────────
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const fileName =
      (audit.doc_number || audit.title || 'Compliance Health Check Report') +
      '.pdf';

    const { data: portalDoc, error: insertErr } = await admin
      .from('portal_documents')
      .insert({
        tenant_id: audit.subject_tenant_id,
        storage_path: audit.report_pdf_path,
        file_name: fileName,
        file_type: 'application/pdf',
        direction: 'vivacity_to_client',
        is_client_visible: true,
        status: 'shared',
        source: 'generated',
        linked_audit_id: auditId,
        description: releaseNotes ?? 'Compliance audit report',
        uploaded_by: callerUserId,
        uploaded_at: new Date().toISOString(),
        shared_at: new Date().toISOString(),
        shared_by: callerUserId,
      })
      .select('id')
      .single();

    if (insertErr || !portalDoc) {
      console.error('[release-audit-report] portal_documents insert failed', {
        auditId,
        errorMessage: insertErr?.message ?? null,
        errorCode: (insertErr as { code?: string } | null)?.code ?? null,
      });
      return json(
        { error: "Couldn't release the report. Try again, or contact support." },
        500,
      );
    }

    const releasedAt = new Date().toISOString();
    const { error: updateErr } = await admin
      .from('client_audits')
      .update({
        report_client_visible: true,
        report_released_at: releasedAt,
        report_released_by: callerUserId,
        report_release_notes: releaseNotes,
      })
      .eq('id', auditId);

    if (updateErr) {
      console.error('[release-audit-report] client_audits update failed', {
        auditId,
        errorMessage: updateErr.message,
      });
      // Best-effort rollback of the portal row so we don't leave a visible
      // document without the audit flag flipped.
      const { error: rollbackErr } = await admin
        .from('portal_documents')
        .delete()
        .eq('id', (portalDoc as { id: string }).id);
      if (rollbackErr) {
        console.error('[release-audit-report] rollback failed', {
          auditId,
          portalDocumentId: (portalDoc as { id: string }).id,
          errorMessage: rollbackErr.message,
        });
      }
      return json(
        { error: "Couldn't release the report. Try again, or contact support." },
        500,
      );
    }

    return json(
      {
        success: true,
        portal_document_id: (portalDoc as { id: string }).id,
        released_at: releasedAt,
      },
      200,
    );
  } catch (err) {
    console.error('[release-audit-report] unhandled', err);
    return json(
      { error: "Couldn't release the report. Try again, or contact support." },
      500,
    );
  }
});
