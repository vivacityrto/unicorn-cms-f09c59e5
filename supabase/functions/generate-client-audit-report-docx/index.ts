/**
 * generate-client-audit-report-docx
 *
 * Builds a Word (.docx) version of a client audit report and stores it in the
 * `audit-reports` bucket at `{tenant_id}/{audit_id}/report-{ts}.docx`.
 *
 * Mirrors the auth/permission gate used by generate-client-audit-report /
 * release-audit-report:
 *   1. Resolve caller from forwarded Authorization.
 *   2. Require check_permission(caller, 'audits.report', 'full').
 *   3. Load audit + findings + actions via userClient (RLS enforced).
 *   4. Build DOCX with `docx` (npm) and upload via service-role client.
 *   5. Persist `report_docx_path` on client_audits, return a short-lived
 *      signed URL.
 *
 * verify_jwt: false — handled in-function.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'npm:docx@8.5.0';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;
const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const AUDIT_TYPE_LABEL: Record<string, string> = {
  compliance_health_check: 'Compliance Health Check',
  cricos_chc: 'CRICOS Compliance Health Check',
  rto_cricos_chc: 'RTO & CRICOS Compliance Health Check',
  mock_audit: 'Mock Audit',
  cricos_mock_audit: 'CRICOS Mock Audit',
  due_diligence: 'Due Diligence',
  due_diligence_combined: 'Due Diligence (Combined)',
};

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true })],
  });
}

function para(text: string, opts: { bold?: boolean; italic?: boolean } = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: text || '—', bold: opts.bold, italics: opts.italic })],
  });
}

function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun(text)],
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorisation header' }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: 'Not authenticated' }, 401);
    const callerUserId = userRes.user.id;

    // 2. Permission gate
    const { data: allowed, error: permErr } = await userClient.rpc('check_permission', {
      p_user_id: callerUserId,
      p_feature_key: 'audits.report',
      p_min_level: 'full',
    });
    if (permErr) {
      console.error('[generate-docx] check_permission failed', permErr.message);
      return json({ error: 'Forbidden' }, 403);
    }
    if (!allowed) return json({ error: 'Forbidden' }, 403);

    // 3. Body
    let body: { audit_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    const auditId = typeof body.audit_id === 'string' ? body.audit_id.trim() : '';
    if (!auditId || !UUID_RE.test(auditId)) {
      return json({ error: 'audit_id must be a valid UUID' }, 400);
    }

    // 4. Load audit (RLS)
    const { data: auditRow, error: auditErr } = await userClient
      .from('client_audits')
      .select('*')
      .eq('id', auditId)
      .maybeSingle();

    if (auditErr || !auditRow) {
      return json({ error: "You don't have access to this audit." }, 403);
    }
    const audit = auditRow as any;

    const [findingsRes, actionsRes] = await Promise.all([
      userClient
        .from('client_audit_findings')
        .select('id, title, description, priority, standard_clause, evidence_summary')
        .eq('audit_id', auditId),
      userClient
        .from('client_audit_actions')
        .select('id, summary, description, priority, status, due_date, assigned_to_name')
        .eq('audit_id', auditId),
    ]);
    const findings = (findingsRes.data ?? []) as any[];
    const actions = (actionsRes.data ?? []) as any[];

    // 5. Build DOCX content
    const children: Paragraph[] = [];

    // Cover
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: AUDIT_TYPE_LABEL[audit.audit_type] || audit.audit_type || 'Audit Report',
            bold: true,
            size: 36,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: audit.snapshot_rto_name || audit.title || 'Client Audit Report',
            size: 28,
          }),
        ],
      }),
    );
    if (audit.snapshot_rto_number) children.push(para(`RTO Code: ${audit.snapshot_rto_number}`));
    if (audit.snapshot_cricos_code) children.push(para(`CRICOS Code: ${audit.snapshot_cricos_code}`));
    children.push(para(`Conducted: ${fmtDate(audit.conducted_at)}`));
    children.push(para(`Report generated: ${fmtDate(new Date().toISOString())}`));
    if (audit.doc_number) children.push(para(`Document reference: ${audit.doc_number}`));

    // Overall rating
    children.push(heading('Overall Result', HeadingLevel.HEADING_1));
    children.push(para(`Risk rating: ${audit.risk_rating ? String(audit.risk_rating).toUpperCase() : 'Not rated'}`));
    if (audit.score_pct !== null && audit.score_pct !== undefined) {
      children.push(para(`Score: ${audit.score_pct}%`));
    }
    if (audit.overall_finding) {
      children.push(para(audit.overall_finding));
    }

    // Executive summary
    children.push(heading('Executive Summary', HeadingLevel.HEADING_1));
    const execSummary = (audit.executive_summary || '').toString().trim();
    if (execSummary) {
      for (const line of execSummary.split(/\n\s*\n/)) {
        children.push(para(line.trim()));
      }
    } else {
      children.push(para('No executive summary recorded.', { italic: true }));
    }

    // Scope
    children.push(heading('Scope & Context', HeadingLevel.HEADING_1));
    if (audit.snapshot_site_address) children.push(para(`Site address: ${audit.snapshot_site_address}`));
    if (audit.snapshot_ceo) children.push(para(`Chief Executive: ${audit.snapshot_ceo}`));
    if (audit.snapshot_phone) children.push(para(`Phone: ${audit.snapshot_phone}`));
    if (audit.snapshot_email) children.push(para(`Email: ${audit.snapshot_email}`));
    if (audit.snapshot_website) children.push(para(`Website: ${audit.snapshot_website}`));
    if (Array.isArray(audit.training_products) && audit.training_products.length > 0) {
      children.push(para('Training products in scope:', { bold: true }));
      for (const tp of audit.training_products) children.push(bullet(String(tp)));
    }

    // Findings by priority
    children.push(heading('Findings', HeadingLevel.HEADING_1));
    if (findings.length === 0) {
      children.push(para('No findings recorded.', { italic: true }));
    } else {
      for (const p of PRIORITY_ORDER) {
        const group = findings.filter((f) => f.priority === p);
        if (group.length === 0) continue;
        children.push(heading(`${PRIORITY_LABEL[p]} (${group.length})`, HeadingLevel.HEADING_2));
        for (const f of group) {
          children.push(
            new Paragraph({
              spacing: { before: 120, after: 40 },
              children: [
                new TextRun({ text: f.title || 'Untitled finding', bold: true }),
                ...(f.standard_clause
                  ? [new TextRun({ text: `  —  ${f.standard_clause}`, italics: true })]
                  : []),
              ],
            }),
          );
          if (f.description) children.push(para(f.description));
          if (f.evidence_summary) children.push(para(`Evidence: ${f.evidence_summary}`, { italic: true }));
        }
      }
    }

    // Action plan
    children.push(heading('Action Plan', HeadingLevel.HEADING_1));
    const openActions = actions.filter((a) => a.status !== 'complete' && a.status !== 'cancelled');
    if (openActions.length === 0) {
      children.push(para('No outstanding actions.', { italic: true }));
    } else {
      for (const p of PRIORITY_ORDER) {
        const group = openActions.filter((a) => a.priority === p);
        if (group.length === 0) continue;
        children.push(heading(`${PRIORITY_LABEL[p]} priority`, HeadingLevel.HEADING_2));
        for (const a of group) {
          const meta: string[] = [];
          if (a.due_date) meta.push(`due ${fmtDate(a.due_date)}`);
          if (a.assigned_to_name) meta.push(`owner ${a.assigned_to_name}`);
          if (a.status) meta.push(`status ${a.status}`);
          children.push(bullet(`${a.summary || 'Untitled action'}${meta.length ? ` (${meta.join(', ')})` : ''}`));
          if (a.description) children.push(para(a.description));
        }
      }
    }

    // Closing
    children.push(heading('Closing', HeadingLevel.HEADING_1));
    if (audit.closing_meeting_at) {
      children.push(para(`Closing meeting: ${fmtDate(audit.closing_meeting_at)}`));
    } else {
      children.push(para('Closing meeting not yet completed.', { italic: true }));
    }
    if (audit.next_audit_due) {
      children.push(para(`Next audit due: ${fmtDate(audit.next_audit_due)}`));
    }

    const doc = new Document({ sections: [{ properties: {}, children }] });
    const buffer = await Packer.toBuffer(doc);

    // 6. Upload
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `${audit.subject_tenant_id}/${auditId}/report-${ts}.docx`;
    const fileName = `${(audit.snapshot_rto_name || 'audit-report').replace(/[^\w\-]+/g, '_')}-${ts}.docx`;

    const { error: upErr } = await admin.storage
      .from('audit-reports')
      .upload(path, buffer, {
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });
    if (upErr) {
      console.error('[generate-docx] upload failed', upErr.message);
      return json({ error: 'Failed to store Word document', details: upErr.message }, 500);
    }

    const patch: Record<string, unknown> = { report_docx_path: path };
    if (!audit.report_generated_at) patch.report_generated_at = new Date().toISOString();
    const { error: updErr } = await admin
      .from('client_audits')
      .update(patch)
      .eq('id', auditId);
    if (updErr) {
      console.error('[generate-docx] audit update failed', updErr.message);
      // non-fatal — file is uploaded; still return URL
    }

    const { data: signed, error: signErr } = await admin.storage
      .from('audit-reports')
      .createSignedUrl(path, 60 * 10);
    if (signErr || !signed?.signedUrl) {
      return json({ error: 'Failed to sign URL', details: signErr?.message }, 500);
    }

    return json(
      {
        success: true,
        download_url: signed.signedUrl,
        file_name: fileName,
        path,
      },
      200,
    );
  } catch (err) {
    console.error('[generate-docx] fatal', err);
    return json({ error: (err as Error).message || 'Unexpected error' }, 500);
  }
});
