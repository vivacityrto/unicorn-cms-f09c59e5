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
  Header,
  Footer,
  PageNumber,
  TabStopType,
  TabStopPosition,
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

/**
 * Highest-priority finding raised against a section, or null if none.
 * client_audit_sections.score_total/score_max/risk_level are never
 * populated anywhere in the app (only an audit-wide score exists), so
 * the Section Rollup derives Risk from findings instead of those columns.
 */
const SECTION_RISK_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
function sectionRiskFromFindings(sectionId: string, findings: any[]): string | null {
  let best: string | null = null;
  let bestRank = 0;
  for (const f of findings) {
    if (f.section_id !== sectionId) continue;
    const p = (f.priority || '').toLowerCase();
    const rank = SECTION_RISK_RANK[p] ?? 0;
    if (rank > bestRank) { bestRank = rank; best = p; }
  }
  return best;
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
    const [findingsRes, actionsRes, sectionsRes, responsesRes] = await Promise.all([
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
        .select('id, template_section_id, title, standard_code, audit_phase, risk_level, score_total, score_max, sort_order, section_summary')
        .eq('audit_id', auditId)
        .order('sort_order', { ascending: true }),
      admin
        .from('client_audit_responses')
        .select('id, section_id, question_id, question_text, rating, notes, score, is_flagged, evidence_urls, responded_by, responded_at')
        .eq('audit_id', auditId),
    ]);
    const findings = (findingsRes.data ?? []) as any[];
    const actions = (actionsRes.data ?? []) as any[];
    const sections = (sectionsRes.data ?? []) as any[];
    const responses = (responsesRes.data ?? []) as any[];

    // Load template questions for these sections so we can render each
    // question's text + clause even when the response row doesn't cache it.
    const templateSectionIds = sections.map((s) => s.template_section_id).filter(Boolean) as string[];
    let templateQuestions: any[] = [];
    if (templateSectionIds.length > 0) {
      const { data: tq, error: tqError } = await admin
        .from('compliance_template_questions')
        .select('id, section_id, clause, audit_statement, sort_order')
        .in('section_id', templateSectionIds)
        .order('sort_order', { ascending: true });
      if (tqError) {
        console.error('[generate-client-audit-report-docx] Failed to load compliance_template_questions:', tqError);
      }
      templateQuestions = tq ?? [];
    }

    // Resolve user names for auditors + assignees (best-effort)
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

    // ─── Cover page (Vivacity brand) ────────────────────────────
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 40 },
        shading: { type: ShadingType.CLEAR, fill: '7130A0', color: 'auto' },
        children: [
          new TextRun({ text: 'VIVACITY', bold: true, size: 56, color: 'FFFFFF', font: 'Calibri' }),
          new TextRun({ text: '   Coaching & Consulting', italics: true, size: 24, color: 'FFFFFF' }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 200 },
        shading: { type: ShadingType.CLEAR, fill: '7130A0', color: 'auto' },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 12, color: 'ED1878', space: 4 },
        },
        children: [
          new TextRun({ text: 'We make Compliance Simple!', size: 20, color: 'DFD8E8' }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 600, after: 120 },
        children: [
          new TextRun({
            text: AUDIT_TYPE_LABEL[audit.audit_type] || audit.audit_type || 'Audit Report',
            bold: true,
            size: 48,
            color: '44235F',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 200 },
        children: [new TextRun({ text: 'Compliance Audit Report', size: 28, color: '7130A0' })],
      }),
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 500 },
        children: [
          new TextRun({
            text: audit.snapshot_rto_name || audit.title || 'Client',
            bold: true,
            size: 36,
            color: '44235F',
          }),
        ],
      }),
    );

    const coverRows: Array<[string, string | null | undefined]> = [];
    if (audit.snapshot_rto_number) coverRows.push(['RTO code', audit.snapshot_rto_number]);
    if (audit.snapshot_cricos_code) coverRows.push(['CRICOS code', audit.snapshot_cricos_code]);
    if (audit.doc_number) coverRows.push(['Document reference', audit.doc_number]);
    coverRows.push(['Audit type', AUDIT_TYPE_LABEL[audit.audit_type] || audit.audit_type || '—']);
    coverRows.push(['Conducted', fmtDate(audit.conducted_at)]);
    coverRows.push(['Report generated', fmtDate(new Date().toISOString())]);
    if (audit.lead_auditor_id) coverRows.push(['Lead auditor', nameOf(audit.lead_auditor_id)]);
    if (audit.assisted_by_id) coverRows.push(['Assisted by', nameOf(audit.assisted_by_id)]);
    if (audit.report_prepared_by_id) coverRows.push(['Report prepared by', nameOf(audit.report_prepared_by_id)]);
    if (coverRows.length > 0) children.push(infoTable(coverRows));

    // Score + risk highlight strip (with finding-count breakdown, matches PDF)
    if (audit.risk_rating || audit.score_pct != null || findings.length > 0) {
      const scoreText = audit.score_pct != null
        ? `${audit.score_pct}%`
        : '—';
      const scoreSub = audit.score_total != null && audit.score_max != null
        ? `${audit.score_total} of ${audit.score_max} points`
        : '';
      const ratingText = audit.risk_rating ? String(audit.risk_rating).toUpperCase() : '—';
      const critN = findings.filter((f) => f.priority === 'critical').length;
      const highN = findings.filter((f) => f.priority === 'high').length;
      const medN = findings.filter((f) => f.priority === 'medium').length;
      const ratingSub = `${critN} critical · ${highN} high · ${medN} medium`;
      children.push(
        new Paragraph({ spacing: { before: 400 }, children: [new TextRun('')] }),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [4680, 4680],
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 4680, type: WidthType.DXA },
                  shading: { fill: '7130A0', type: ShadingType.CLEAR, color: 'auto' },
                  margins: { top: 200, bottom: 200, left: 200, right: 200 },
                  children: [
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'OVERALL SCORE', bold: true, size: 18, color: 'FFFFFF' })] }),
                    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [new TextRun({ text: scoreText, bold: true, size: 40, color: 'FFFFFF' })] }),
                    ...(scoreSub ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [new TextRun({ text: scoreSub, size: 18, color: 'FFFFFF' })] })] : []),
                  ],
                }),
                new TableCell({
                  width: { size: 4680, type: WidthType.DXA },
                  shading: { fill: 'ED1878', type: ShadingType.CLEAR, color: 'auto' },
                  margins: { top: 200, bottom: 200, left: 200, right: 200 },
                  children: [
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'RISK RATING', bold: true, size: 18, color: 'FFFFFF' })] }),
                    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [new TextRun({ text: ratingText, bold: true, size: 40, color: 'FFFFFF' })] }),
                    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [new TextRun({ text: ratingSub, size: 18, color: 'FFFFFF' })] }),
                  ],
                }),
              ],
            }),
          ],
        }),
      );
    }

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600, after: 40 },
        children: [new TextRun({ text: `Report generated ${fmtDate(new Date().toISOString())}`, size: 18, color: '44235F' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 40 },
        children: [new TextRun({ text: 'CONFIDENTIAL — distribute only to the named provider above.', italics: true, size: 18, color: '44235F' })],
      }),
      new Paragraph({ children: [new PageBreak()] }),
    );

    // ─── Executive Summary ──────────────────────────────────────
    children.push(h1('Executive Summary'));
    children.push(...multiPara(audit.executive_summary));

    // ─── Overall Finding ────────────────────────────────────────
    if (audit.overall_finding) {
      children.push(h1('Overall Finding'));
      children.push(...multiPara(audit.overall_finding));
    }

    // ─── Risk Rating Rationale ──────────────────────────────────
    if (audit.risk_rationale) {
      children.push(h1('Risk Rating Rationale'));
      children.push(...multiPara(audit.risk_rationale));
    }

    // ─── Section Rollup ────────────────────────────────────────
    if (sections.length > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(h1('Section Rollup'));
      const riskColor: Record<string, string> = {
        low: '2ECC71',
        medium: 'F1C40F',
        high: 'E67E22',
        critical: 'C0392B',
        extreme: '7B1E1E',
      };
      const headerBorder = { style: BorderStyle.SINGLE, size: 6, color: '7130A0' };
      const rowBorder = { style: BorderStyle.SINGLE, size: 4, color: 'E2E2E2' };
      // v2 fix: dropped the Score column (score_total/score_max are never
      // populated on client_audit_sections anywhere in the app, so it
      // always read "Not scored"). Risk is now derived from findings
      // instead of the always-null risk_level column.
      const headerCells = ['Section', 'Risk', 'Findings'].map((t, i) =>
        new TableCell({
          width: { size: i === 0 ? 5560 : 1900, type: WidthType.DXA },
          borders: { top: headerBorder, bottom: headerBorder, left: headerBorder, right: headerBorder },
          shading: { fill: '44235F', type: ShadingType.CLEAR, color: 'auto' },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 20, color: 'FFFFFF' })] })],
        }),
      );
      const rollupRows = [new TableRow({ tableHeader: true, children: headerCells })];
      for (const s of sections) {
        const findingCount = findings.filter((f) => f.section_id === s.id).length;
        const risk = sectionRiskFromFindings(s.id, findings);
        const rowCells = [
          new TableCell({
            width: { size: 5560, type: WidthType.DXA },
            borders: { top: rowBorder, bottom: rowBorder, left: rowBorder, right: rowBorder },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: s.title || s.standard_code || '—', size: 20 })] })],
          }),
          new TableCell({
            width: { size: 1900, type: WidthType.DXA },
            borders: { top: rowBorder, bottom: rowBorder, left: rowBorder, right: rowBorder },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ children: [risk
              ? new TextRun({ text: risk.toUpperCase(), bold: true, size: 20, color: riskColor[risk] || '333333' })
              : new TextRun({ text: '—', size: 20, color: '999999' })] })],
          }),
          new TableCell({
            width: { size: 1900, type: WidthType.DXA },
            borders: { top: rowBorder, bottom: rowBorder, left: rowBorder, right: rowBorder },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: String(findingCount), size: 20 })] })],
          }),
        ];
        rollupRows.push(new TableRow({ children: rowCells }));
      }
      children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [5560, 1900, 1900],
        rows: rollupRows,
      }));
    }

    // ─── Findings ───────────────────────────────────────────────
    // Match PDF: each finding shows the standard/reg reference, the detail body,
    // then a "Suggested corrective action:" (pulled from the linked action's
    // description) and an "Impact:" block.
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(h1(`Findings (${findings.length})`));
    if (findings.length === 0) {
      children.push(para('No findings recorded.', { italic: true }));
    } else {
      const actionsByFinding = new Map<string, any[]>();
      for (const a of actions) {
        if (!a.finding_id) continue;
        const arr = actionsByFinding.get(a.finding_id) ?? [];
        arr.push(a);
        actionsByFinding.set(a.finding_id, arr);
      }

      for (const p of PRIORITY_ORDER) {
        const group = findings.filter((f) => f.priority === p);
        if (group.length === 0) continue;
        children.push(h2(`${PRIORITY_LABEL[p]} priority (${group.length})`));
        for (const f of group) {
          const heading = [f.finding_code, f.summary || 'Untitled finding'].filter(Boolean).join(' — ');
          children.push(
            new Paragraph({
              spacing: { before: 200, after: 60 },
              children: [
                new TextRun({ text: heading, bold: true, size: 22, color: PRIORITY_COLOR[p] }),
              ],
            }),
          );
          const meta: string[] = [];
          if (f.standard_reference) meta.push(f.standard_reference);
          if (f.regulatory_reference) meta.push(f.regulatory_reference);
          if (meta.length > 0) children.push(para(meta.join(' · '), { italic: true }));
          if (f.detail) children.push(...multiPara(f.detail));

          const linked = actionsByFinding.get(f.id) ?? [];
          if (linked.length > 0) {
            children.push(
              new Paragraph({
                spacing: { before: 120, after: 40 },
                children: [new TextRun({ text: 'Suggested corrective action:', bold: true, size: 22, color: '44235F' })],
              }),
            );
            for (const a of linked) {
              if (a.description) {
                children.push(...multiPara(a.description));
              } else if (a.title) {
                children.push(para(a.title));
              }
            }
          }

          if (f.impact) {
            children.push(
              new Paragraph({
                spacing: { before: 120, after: 40 },
                children: [new TextRun({ text: 'Impact:', bold: true, size: 22, color: '44235F' })],
              }),
            );
            children.push(...multiPara(f.impact));
          }
        }
      }
    }

    // ─── Action Plan ────────────────────────────────────────────
    children.push(new Paragraph({ children: [new PageBreak()] }));
    const openActions = actions.filter((a) => a.status !== 'complete' && a.status !== 'cancelled');
    children.push(h1(`Action Plan (${openActions.length})`));
    if (openActions.length === 0) {
      children.push(para('No outstanding actions.', { italic: true }));
    } else {
      for (const a of openActions) {
        const priorityKey = (a.priority || 'low').toString();
        children.push(
          new Paragraph({
            spacing: { before: 200, after: 40 },
            children: [
              new TextRun({ text: `${a.title || 'Untitled action'}   `, bold: true, size: 22 }),
              new TextRun({
                text: (PRIORITY_LABEL[priorityKey] || priorityKey).toUpperCase(),
                bold: true,
                size: 18,
                color: PRIORITY_COLOR[priorityKey] || '333333',
              }),
            ],
          }),
        );
        const meta: string[] = [];
        meta.push(`Owner: ${a.assigned_to ? nameOf(a.assigned_to) : 'TBC'}`);
        const due = a.extended_due_date || a.due_date;
        if (due) meta.push(`Due: ${fmtDate(due)}${a.extended_due_date ? ' (extended)' : ''}`);
        meta.push(`Status: ${(a.status || 'open').toString().toUpperCase()}`);
        children.push(para(meta.join(' · '), { italic: true }));
        if (a.description) children.push(...multiPara(a.description));
      }
    }

    const doneActions = actions.filter((a) => a.status === 'complete' || a.status === 'cancelled');
    if (doneActions.length > 0) {
      children.push(h2(`Completed / closed (${doneActions.length})`));
      for (const a of doneActions) {
        children.push(bullet(`${a.title || 'Untitled action'} — ${a.status}${a.due_date ? ` (due ${fmtDate(a.due_date)})` : ''}`));
      }
    }

    // ─── Detailed Responses ─────────────────────────────────────
    {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(h1('Detailed Responses'));

      if (responses.length === 0 && templateQuestions.length === 0) {
        children.push(para('No responses recorded.', { italic: true }));
      } else {
        const RATING_LABEL: Record<string, string> = {
          compliant: 'COMPLIANT',
          at_risk: 'AT RISK',
          non_compliant: 'NON-COMPLIANT',
          not_applicable: 'N/A',
          not_sighted: 'NOT SIGHTED',
        };
        const RATING_COLOR: Record<string, string> = {
          compliant: '2ECC71',
          at_risk: 'F1C40F',
          non_compliant: 'C0392B',
          not_applicable: '888888',
          not_sighted: '888888',
        };

        const responsesByQuestion = new Map<string, any>();
        const responsesBySection = new Map<string, any[]>();
        for (const r of responses) {
          if (r.question_id) responsesByQuestion.set(r.question_id, r);
          if (r.section_id) {
            const arr = responsesBySection.get(r.section_id) ?? [];
            arr.push(r);
            responsesBySection.set(r.section_id, arr);
          }
        }
        const questionsBySection = new Map<string, any[]>();
        for (const q of templateQuestions) {
          const arr = questionsBySection.get(q.section_id) ?? [];
          arr.push(q);
          questionsBySection.set(q.section_id, arr);
        }

        for (const s of sections) {
          const tqs = (s.template_section_id && questionsBySection.get(s.template_section_id)) || [];
          const sectionResps = responsesBySection.get(s.id) ?? [];
          if (tqs.length === 0 && sectionResps.length === 0) continue;

          children.push(h2(s.title || s.standard_code || 'Section'));

          const seenResponseIds = new Set<string>();
          const renderResponse = (
            r: any | undefined,
            fallbackText: string | null,
            clause: string | null,
          ) => {
            // v2 fix: [clause] is a real Standards clause elsewhere, but for
            // Opening Meeting questions it holds an internal categorisation
            // hint ("Context", "Changes", ...), not meant for the
            // client-facing report.
            const label = (clause && s.audit_phase !== 'opening_meeting') ? `[${clause}] ` : '';
            const heading = `${label}${fallbackText || r?.question_text || 'Question'}`;
            children.push(
              new Paragraph({
                spacing: { before: 160, after: 40 },
                children: [new TextRun({ text: heading, bold: true, size: 22 })],
              }),
            );
            if (r?.rating) {
              const ratingLabel = RATING_LABEL[r.rating] || r.rating.toUpperCase();
              children.push(
                new Paragraph({
                  spacing: { after: 60 },
                  children: [
                    new TextRun({
                      text: ratingLabel,
                      bold: true,
                      size: 20,
                      color: RATING_COLOR[r.rating] || '333333',
                    }),
                    ...(r.is_flagged
                      ? [new TextRun({ text: '   FLAGGED', bold: true, size: 20, color: 'C0392B' })]
                      : []),
                    ...(r.score != null ? [new TextRun({ text: `   ·   Score ${r.score}`, size: 20 })] : []),
                  ],
                }),
              );
            } else {
              children.push(para('Not rated', { italic: true }));
            }
            if (r?.notes) {
              children.push(...multiPara(r.notes));
            }
            if (Array.isArray(r?.evidence_urls) && r.evidence_urls.length > 0) {
              children.push(para(`Evidence: ${r.evidence_urls.length} attachment${r.evidence_urls.length === 1 ? '' : 's'}`, { italic: true }));
            }
          };

          for (const q of tqs) {
            const r = responsesByQuestion.get(q.id);
            if (r) seenResponseIds.add(r.id);
            renderResponse(r, q.audit_statement, q.clause);
          }
          for (const r of sectionResps) {
            if (seenResponseIds.has(r.id)) continue;
            renderResponse(r, r.question_text, null);
          }
        }

        const orphans = responses.filter((r) => !r.section_id);
        if (orphans.length > 0) {
          children.push(h2('Other Responses'));
          for (const r of orphans) {
            const heading = r.question_text || 'Question';
            children.push(
              new Paragraph({
                spacing: { before: 160, after: 40 },
                children: [new TextRun({ text: heading, bold: true, size: 22 })],
              }),
            );
            if (r.rating) {
              children.push(para(`${(RATING_LABEL[r.rating] || r.rating).toUpperCase()}${r.is_flagged ? '   FLAGGED' : ''}`, { bold: true, color: RATING_COLOR[r.rating] || '333333' }));
            }
            if (r.notes) children.push(...multiPara(r.notes));
          }
        }
      }
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
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  shading: { type: ShadingType.CLEAR, fill: '44235F', color: 'auto' },
                  spacing: { before: 60, after: 60 },
                  tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                  children: [
                    new TextRun({ text: 'VIVACITY', bold: true, color: 'FFFFFF', size: 28 }),
                    new TextRun({ text: '   Coaching & Consulting', color: 'FFFFFF', size: 20 }),
                    new TextRun({ text: '\t', color: 'FFFFFF' }),
                    new TextRun({ text: 'AUDIT REPORT', bold: true, color: 'FFFFFF', size: 22 }),
                  ],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  border: {
                    top: { style: BorderStyle.SINGLE, size: 6, color: '44235F', space: 6 },
                  },
                  tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                  children: [
                    new TextRun({ text: `${audit.snapshot_rto_name || 'Client'}  |  Generated ${fmtDate(new Date().toISOString())}  |  CONFIDENTIAL`, size: 18, color: '666666' }),
                    new TextRun({ text: '\t', size: 18 }),
                    new TextRun({ text: 'Page ', size: 18, color: '666666' }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '666666' }),
                  ],
                }),
              ],
            }),
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
