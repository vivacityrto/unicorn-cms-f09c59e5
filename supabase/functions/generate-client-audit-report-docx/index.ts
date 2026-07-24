/**
 * generate-client-audit-report-docx
 *
 * Builds a Word (.docx) version of a client audit report that mirrors the PDF
 * report structure and content. Stored in the `audit-documents` bucket at
 * `{tenant_id}/{audit_id}/report-{ts}.docx`.
 *
 * Auth mirrors generate-client-audit-report / release-audit-report:
 *   1. Resolve caller from forwarded Authorization.
 *   2. Require check_permission(caller, 'audits.report', 'full').
 *   3. Load audit + findings + actions via userClient (RLS enforced).
 *   4. Build DOCX and upload via service-role client.
 *   5. Persist `report_docx_path` on client_audits, return signed URL.
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
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  PageBreak,
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

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;
const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
const PRIORITY_COLOR: Record<string, string> = {
  critical: 'C0392B',
  high: 'E67E22',
  medium: 'F1C40F',
  low: '2ECC71',
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

function h1(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, color: '44235F' })],
  });
}

function h2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text, bold: true, size: 26, color: '7130A0' })],
  });
}

function h3(text: string, color = '333333') {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, size: 22, color })],
  });
}

function para(text: string | null | undefined, opts: { bold?: boolean; italic?: boolean; color?: string } = {}) {
  const value = (text ?? '').toString().trim();
  return new Paragraph({
    spacing: { after: 100, line: 300 },
    children: [
      new TextRun({
        text: value || '—',
        bold: opts.bold,
        italics: opts.italic,
        color: opts.color,
      }),
    ],
  });
}

function multiPara(text: string | null | undefined): Paragraph[] {
  const v = (text ?? '').toString().trim();
  if (!v) return [para('—', { italic: true })];
  return v
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => para(chunk));
}

function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun(text)],
  });
}

function labelValueRow(label: string, value: string | null | undefined) {
  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: 'E2E2E2' };
  const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 3200, type: WidthType.DXA },
        borders,
        shading: { fill: 'F4F1F8', type: ShadingType.CLEAR, color: 'auto' },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 })] })],
      }),
      new TableCell({
        width: { size: 6160, type: WidthType.DXA },
        borders,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: (value ?? '').toString().trim() || '—', size: 20 })] })],
      }),
    ],
  });
}

function infoTable(rows: Array<[string, string | null | undefined]>): Table {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3200, 6160],
    rows: rows.map(([l, v]) => labelValueRow(l, v)),
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

    // 4. Load audit + findings + actions (RLS)
    const { data: auditRow, error: auditErr } = await userClient
      .from('client_audits')
      .select('*')
      .eq('id', auditId)
      .maybeSingle();

    if (auditErr || !auditRow) {
      return json({ error: "You don't have access to this audit." }, 403);
    }
    const audit = auditRow as any;

    // Use service-role for related rows so RLS on staff-only tables can't
    // silently return zero findings/sections (mirrors the PDF generator).
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const [findingsRes, actionsRes, sectionsRes] = await Promise.all([
      admin
        .from('client_audit_findings')
        .select('id, summary, detail, priority, standard_reference, regulatory_reference, impact, finding_code, section_id')
        .eq('audit_id', auditId),
      admin
        .from('client_audit_actions')
        .select('id, title, description, priority, status, due_date, extended_due_date, assigned_to, standard_reference, action_type, client_notes, finding_id, evidence_required')
        .eq('audit_id', auditId),
      admin
        .from('client_audit_sections')
        .select('id, title, standard_code, risk_level, score_total, score_max, sort_order, section_summary')
        .eq('audit_id', auditId)
        .order('sort_order', { ascending: true }),
    ]);
    const findings = (findingsRes.data ?? []) as any[];
    const actions = (actionsRes.data ?? []) as any[];
    const sections = (sectionsRes.data ?? []) as any[];

    // Resolve user names for auditors + assignees (best-effort)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const userIds = new Set<string>();
    for (const k of ['lead_auditor_id', 'assisted_by_id', 'report_prepared_by_id']) {
      if (audit[k]) userIds.add(audit[k]);
    }
    for (const a of actions) if (a.assigned_to) userIds.add(a.assigned_to);
    const userNames = new Map<string, string>();
    if (userIds.size > 0) {
      const { data: users } = await admin
        .from('users')
        .select('user_uuid, first_name, last_name, email')
        .in('user_uuid', Array.from(userIds));
      for (const u of (users ?? []) as any[]) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email || '';
        if (name) userNames.set(u.user_uuid, name);
      }
    }
    const nameOf = (id: string | null | undefined) => (id && userNames.get(id)) || '—';

    // 5. Build DOCX content
    const children: (Paragraph | Table)[] = [];

    // ─── Cover page ─────────────────────────────────────────────
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 1200, after: 200 },
        children: [
          new TextRun({
            text: AUDIT_TYPE_LABEL[audit.audit_type] || audit.audit_type || 'Audit Report',
            bold: true,
            size: 44,
            color: '44235F',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: 'Compliance Audit Report', size: 28, color: '7130A0' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [
          new TextRun({
            text: audit.snapshot_rto_name || audit.title || 'Client',
            bold: true,
            size: 32,
          }),
        ],
      }),
    );

    const coverRows: Array<[string, string | null | undefined]> = [];
    if (audit.snapshot_rto_number) coverRows.push(['RTO code', audit.snapshot_rto_number]);
    if (audit.snapshot_cricos_code) coverRows.push(['CRICOS code', audit.snapshot_cricos_code]);
    if (audit.doc_number) coverRows.push(['Document reference', audit.doc_number]);
    coverRows.push(['Conducted', fmtDate(audit.conducted_at)]);
    coverRows.push(['Report generated', fmtDate(new Date().toISOString())]);
    if (audit.lead_auditor_id) coverRows.push(['Lead auditor', nameOf(audit.lead_auditor_id)]);
    if (audit.assisted_by_id) coverRows.push(['Assisted by', nameOf(audit.assisted_by_id)]);
    if (audit.report_prepared_by_id) coverRows.push(['Report prepared by', nameOf(audit.report_prepared_by_id)]);
    if (coverRows.length > 0) children.push(infoTable(coverRows));

    children.push(new Paragraph({ children: [new PageBreak()] }));

    // ─── Overall Result ─────────────────────────────────────────
    children.push(h1('Overall Result'));
    const rating = audit.risk_rating ? String(audit.risk_rating).toUpperCase() : 'Not rated';
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: 'Risk rating: ', bold: true }),
          new TextRun({ text: rating, bold: true, color: '44235F' }),
        ],
      }),
    );
    if (audit.score_pct != null || audit.score_total != null) {
      const scoreText =
        audit.score_pct != null
          ? `${audit.score_pct}%${audit.score_total != null && audit.score_max != null ? `  (${audit.score_total} / ${audit.score_max})` : ''}`
          : `${audit.score_total} / ${audit.score_max ?? '—'}`;
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: 'Score: ', bold: true }),
            new TextRun({ text: scoreText }),
          ],
        }),
      );
    }
    if (audit.overall_finding) {
      children.push(h3('Overall finding'));
      children.push(...multiPara(audit.overall_finding));
    }
    if (audit.risk_rationale) {
      children.push(h3('Risk rationale'));
      children.push(...multiPara(audit.risk_rationale));
    }

    // ─── Executive Summary ──────────────────────────────────────
    children.push(h1('Executive Summary'));
    children.push(...multiPara(audit.executive_summary));

    // ─── Scope & Context ────────────────────────────────────────
    children.push(h1('Scope & Context'));
    const scope: Array<[string, string | null | undefined]> = [
      ['Organisation', audit.snapshot_rto_name],
      ['RTO code', audit.snapshot_rto_number],
    ];
    if (audit.is_cricos || audit.snapshot_cricos_code) scope.push(['CRICOS code', audit.snapshot_cricos_code]);
    if (audit.snapshot_site_address) scope.push(['Site address', audit.snapshot_site_address]);
    if (audit.snapshot_ceo) scope.push(['Chief Executive', audit.snapshot_ceo]);
    if (audit.snapshot_phone) scope.push(['Phone', audit.snapshot_phone]);
    if (audit.snapshot_email) scope.push(['Email', audit.snapshot_email]);
    if (audit.snapshot_website) scope.push(['Website', audit.snapshot_website]);
    if (audit.snapshot_other_contacts) scope.push(['Other contacts', audit.snapshot_other_contacts]);
    if (audit.audit_location) scope.push(['Audit location', audit.audit_location]);
    if (audit.audit_is_online != null) scope.push(['Mode', audit.audit_is_online ? 'Online' : 'On-site']);
    if (audit.is_retrospective) scope.push(['Retrospective audit', 'Yes']);
    children.push(infoTable(scope));

    if (audit.is_cricos) {
      children.push(h3('CRICOS profile'));
      const cricos: Array<[string, string | null | undefined]> = [];
      if (audit.snapshot_overseas_student_count != null)
        cricos.push(['Overseas students', String(audit.snapshot_overseas_student_count)]);
      if (audit.snapshot_education_agents) cricos.push(['Education agents', audit.snapshot_education_agents]);
      if (audit.snapshot_prisms_users) cricos.push(['PRISMS users', audit.snapshot_prisms_users]);
      if (audit.snapshot_dha_contact) cricos.push(['DHA contact', audit.snapshot_dha_contact]);
      if (cricos.length > 0) children.push(infoTable(cricos));
    }

    if (Array.isArray(audit.training_products) && audit.training_products.length > 0) {
      children.push(h3('Training products in scope'));
      for (const tp of audit.training_products) children.push(bullet(String(tp)));
    }

    // ─── Audit timeline ────────────────────────────────────────
    children.push(h1('Audit Timeline'));
    children.push(
      infoTable([
        ['Opening meeting', fmtDateTime(audit.opening_meeting_at)],
        ['Conducted', fmtDateTime(audit.conducted_at)],
        ['Document deadline', fmtDate(audit.document_deadline_at)],
        ['Closing meeting', fmtDateTime(audit.closing_meeting_at)],
        ['Closed', fmtDateTime(audit.closed_at)],
        ['Next audit due', fmtDate(audit.next_audit_due)],
      ]),
    );

    // ─── Findings ───────────────────────────────────────────────
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(h1('Findings'));
    if (findings.length === 0) {
      children.push(para('No findings recorded.', { italic: true }));
    } else {
      const counts = PRIORITY_ORDER.map((p) => ({
        p,
        n: findings.filter((f) => f.priority === p).length,
      })).filter((x) => x.n > 0);
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [
            new TextRun({ text: `Total findings: `, bold: true }),
            new TextRun({ text: `${findings.length}   ` }),
            ...counts.flatMap((c, i) => [
              new TextRun({
                text: `${PRIORITY_LABEL[c.p]} ${c.n}`,
                bold: true,
                color: PRIORITY_COLOR[c.p],
              }),
              new TextRun({ text: i < counts.length - 1 ? '   ' : '' }),
            ]),
          ],
        }),
      );
      for (const p of PRIORITY_ORDER) {
        const group = findings.filter((f) => f.priority === p);
        if (group.length === 0) continue;
        children.push(h2(`${PRIORITY_LABEL[p]} priority (${group.length})`));
        for (const f of group) {
          const heading = [f.finding_code, f.summary || 'Untitled finding'].filter(Boolean).join(' — ');
          children.push(
            new Paragraph({
              spacing: { before: 160, after: 60 },
              children: [
                new TextRun({ text: heading, bold: true, size: 22, color: PRIORITY_COLOR[p] }),
              ],
            }),
          );
          const meta: string[] = [];
          if (f.standard_reference) meta.push(`Standard: ${f.standard_reference}`);
          if (f.regulatory_reference) meta.push(`Regulatory: ${f.regulatory_reference}`);
          if (meta.length > 0) children.push(para(meta.join('   ·   '), { italic: true }));
          if (f.detail) children.push(...multiPara(f.detail));
          if (f.impact) {
            children.push(
              new Paragraph({
                spacing: { after: 100 },
                children: [
                  new TextRun({ text: 'Impact: ', bold: true }),
                  new TextRun({ text: f.impact }),
                ],
              }),
            );
          }
        }
      }
    }

    // ─── Action Plan ────────────────────────────────────────────
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(h1('Action Plan'));
    const openActions = actions.filter((a) => a.status !== 'complete' && a.status !== 'cancelled');
    if (openActions.length === 0) {
      children.push(para('No outstanding actions.', { italic: true }));
    } else {
      for (const p of PRIORITY_ORDER) {
        const group = openActions.filter((a) => a.priority === p);
        if (group.length === 0) continue;
        children.push(h2(`${PRIORITY_LABEL[p]} priority (${group.length})`));
        for (const a of group) {
          children.push(
            new Paragraph({
              spacing: { before: 140, after: 40 },
              children: [
                new TextRun({ text: a.title || 'Untitled action', bold: true, size: 22 }),
              ],
            }),
          );
          const meta: string[] = [];
          const due = a.extended_due_date || a.due_date;
          if (due) meta.push(`Due ${fmtDate(due)}${a.extended_due_date ? ' (extended)' : ''}`);
          if (a.assigned_to) meta.push(`Owner ${nameOf(a.assigned_to)}`);
          if (a.status) meta.push(`Status ${a.status}`);
          if (a.action_type) meta.push(`Type ${a.action_type}`);
          if (a.standard_reference) meta.push(`Ref ${a.standard_reference}`);
          if (meta.length > 0) children.push(para(meta.join('   ·   '), { italic: true }));
          if (a.description) children.push(...multiPara(a.description));
          if (a.client_notes) {
            children.push(
              new Paragraph({
                spacing: { after: 100 },
                children: [
                  new TextRun({ text: 'Client notes: ', bold: true }),
                  new TextRun({ text: a.client_notes }),
                ],
              }),
            );
          }
          if (a.evidence_required) {
            children.push(para('Evidence required for closure.', { italic: true, color: '7130A0' }));
          }
        }
      }
    }

    // Completed actions summary
    const doneActions = actions.filter((a) => a.status === 'complete' || a.status === 'cancelled');
    if (doneActions.length > 0) {
      children.push(h2(`Completed / closed (${doneActions.length})`));
      for (const a of doneActions) {
        children.push(bullet(`${a.title || 'Untitled action'} — ${a.status}${a.due_date ? ` (due ${fmtDate(a.due_date)})` : ''}`));
      }
    }

    // ─── Closing ────────────────────────────────────────────────
    children.push(h1('Closing'));
    children.push(
      infoTable([
        ['Closing meeting', fmtDateTime(audit.closing_meeting_at)],
        ['Report generated', fmtDateTime(audit.report_generated_at || new Date().toISOString())],
        ['Report released', fmtDateTime(audit.report_released_at)],
        ['Next audit due', fmtDate(audit.next_audit_due)],
      ]),
    );
    if (audit.report_release_notes) {
      children.push(h3('Release notes'));
      children.push(...multiPara(audit.report_release_notes));
    }

    // Build document
    const doc = new Document({
      styles: {
        default: { document: { run: { font: 'Calibri', size: 22 } } },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
            },
          },
          children,
        },
      ],
    });
    const buffer = await Packer.toBuffer(doc);

    // 6. Upload
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `${audit.subject_tenant_id}/${auditId}/report-${ts}.docx`;
    const fileName = `${(audit.snapshot_rto_name || 'audit-report').replace(/[^\w\-]+/g, '_')}-${ts}.docx`;

    const { error: upErr } = await admin.storage
      .from('audit-documents')
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
    }

    const { data: signed, error: signErr } = await admin.storage
      .from('audit-documents')
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
