// Edge Function: delete-incomplete-audit
// Deletes an incomplete audit (status draft/in_progress, not closed, no report)
// after the caller provides a written reason. Uses the caller's JWT so RLS
// applies via the can_delete_incomplete_audit() gate. Never uses the service
// role key. Records a full snapshot in client_audit_log BEFORE deleting so
// the deletion is permanently auditable.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/cors.ts';

interface DeleteAuditRequest {
  audit_id?: string;
  reason?: string;
}

function json(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json(req, { error: 'Missing authorisation header' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return json(req, { error: 'Not authenticated' }, 401);
    }
    const user = userData.user;

    let body: DeleteAuditRequest;
    try {
      body = await req.json();
    } catch {
      return json(req, { error: 'Invalid JSON body.' }, 400);
    }

    const auditId = body.audit_id?.trim();
    const reason = (body.reason ?? '').trim();

    if (!auditId) {
      return json(req, { error: 'audit_id is required.' }, 400);
    }
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(auditId)) {
      return json(req, { error: 'audit_id must be a valid UUID.' }, 400);
    }
    if (reason.length < 10) {
      return json(req, 
        { error: 'A reason of at least 10 characters is required.' },
        400,
      );
    }
    if (reason.length > 1000) {
      return json(req, { error: 'Reason must be 1000 characters or fewer.' }, 400);
    }

    // 1. Gate: confirm caller can delete this audit.
    const { data: gate, error: gateErr } = await supabase.rpc(
      'can_delete_incomplete_audit',
      { p_audit_id: auditId },
    );
    if (gateErr) {
      return json(req, 
        { error: 'Permission check failed.', detail: gateErr.message },
        500,
      );
    }
    if (gate !== true) {
      return json(req, 
        {
          error:
            'This audit cannot be deleted. Only audits that are still in draft or in progress can be removed. Audits that have been closed or had a report generated must be retained.',
        },
        403,
      );
    }

    // 2. Snapshot the row for the audit log (RLS-scoped read).
    const { data: snapshot, error: snapErr } = await supabase
      .from('client_audits')
      .select('*')
      .eq('id', auditId)
      .maybeSingle();

    if (snapErr) {
      return json(req, 
        { error: 'Failed to read audit for snapshot.', detail: snapErr.message },
        500,
      );
    }
    if (!snapshot) {
      return json(req, { error: 'Audit not found or not accessible.' }, 404);
    }

    // 3. Write the audit log BEFORE deletion so we have a permanent record.
    const { error: logErr } = await supabase
      .from('client_audit_log')
      .insert({
        tenant_id: snapshot.subject_tenant_id,
        actor_user_id: user.id,
        action: 'audit.deleted_incomplete',
        entity_type: 'client_audits',
        entity_id: auditId,
        details: {
          reason,
          audit_type: snapshot.audit_type,
          title: snapshot.title,
          status_at_deletion: snapshot.status,
          deleted_at: new Date().toISOString(),
        },
        before_data: snapshot,
      });

    if (logErr) {
      return json(req, 
        {
          error: 'Failed to record audit log; deletion aborted.',
          detail: logErr.message,
        },
        500,
      );
    }

    // 4. Delete the audit. Cascades handle the child tables.
    const { error: delErr } = await supabase
      .from('client_audits')
      .delete()
      .eq('id', auditId);

    if (delErr) {
      return json(req, { error: 'Deletion failed.', detail: delErr.message }, 500);
    }

    return json(req, 
      { ok: true, audit_id: auditId, message: 'Audit deleted successfully.' },
      200,
    );
  } catch (err) {
    return json(req, { error: 'Unexpected error', detail: String(err) }, 500);
  }
});
