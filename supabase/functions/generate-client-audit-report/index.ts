/**
 * generate-client-audit-report
 *
 * Wave 4 PDF generator for the client_audits family.
 *
 * v2 polish:
 *   - Tagline matches brand ("We make Compliance Simple!")
 *   - Bullet separators render as middle dot (·) via sanitise() mapping
 *     instead of asterisk (*) — cleaner visual hierarchy in WinAnsi.
 *   - Action plan: "Owner: TBC" when no assignee, instead of "Unassigned"
 *   - Section rollup score: "Not scored" when score_max is null, instead
 *     of an em dash (which read as "data missing" rather than "by design")
 *
 * v3 fix:
 *   - Finding heading, finding section/reference line, and action title
 *     were drawn with a single non-wrapping drawText() call (only a
 *     character-count .slice(200), not width-aware), so long text ran
 *     off the right edge of the page instead of wrapping. Now wrapped via
 *     wrapLines(), with the coloured accent bar and following content's
 *     y-offset sized to the actual wrapped line count instead of an
 *     assumed single line.
 *
 * v4 fix (checked into git for the first time — this function was
 * previously live-only, deployed via MCP with no corresponding file in
 * the repo; see docs/audit-log/entries/2026-08-10-audit-report-client-facing-fixes.md):
 *   - ratingLabel/ratingColour checked for the key 'na', but the actual
 *     stored rating value is 'not_applicable' (and 'not_sighted' was never
 *     handled at all) — both silently fell through to the 'NOT ANSWERED'
 *     default even though the response's notes/answer text renders fine
 *     right below the badge. Added both real keys, matching the sibling
 *     DOCX generator's RATING_LABEL map.
 *   - Section Rollup showed "Not scored" / "—" for every section because
 *     no code anywhere in the app has ever written score_total/score_max/
 *     risk_level onto a client_audit_sections row (only an audit-wide
 *     total exists). Removed the always-empty Score column, and derive
 *     the Risk badge from the highest-priority finding actually raised
 *     against that section instead of the always-null risk_level column.
 *   - Detailed Responses prefixed every question with a "[clause]" label
 *     sourced from compliance_template_questions.clause — for Opening
 *     Meeting questions that column holds an internal categorisation hint
 *     ("Context", "Changes", ...), not a real Standards clause, and isn't
 *     meant for the client-facing report. Suppressed for sections with
 *     audit_phase = 'opening_meeting' specifically (per Carl, other
 *     sections' clause labels are legitimate and unchanged).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  RGB,
} from 'npm:pdf-lib@1.17.1';
import { corsHeaders } from '../_shared/cors.ts';

const BUCKET = 'audit-reports';

const PURPLE = rgb(0x71 / 255, 0x30 / 255, 0xa0 / 255);
const FUCHSIA = rgb(0xed / 255, 0x18 / 255, 0x78 / 255);
const ACAI = rgb(0x44 / 255, 0x23 / 255, 0x5f / 255);
const LIGHT_PURPLE = rgb(0xdf / 255, 0xd8 / 255, 0xe8 / 255);
const CYAN = rgb(0x23 / 255, 0xc0 / 255, 0xdd / 255);
const TEAL = rgb(0.09, 0.63, 0.52);
const AMBER = rgb(0.85, 0.55, 0.1);
const RED = rgb(0.8, 0.2, 0.2);
const BLUE = rgb(0.2, 0.5, 0.85);
const GREY = rgb(0.45, 0.45, 0.45);
const LIGHT_GREY = rgb(0.88, 0.88, 0.88);
const PALE = rgb(0.96, 0.96, 0.97);
const DARK = rgb(0.1, 0.1, 0.15);
const WHITE = rgb(1, 1, 1);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 50;
const MARGIN_TOP = 95;
const MARGIN_BOTTOM = 55;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;

const FS_TITLE = 24;
const FS_H1 = 16;
const FS_H2 = 12;
const FS_H3 = 10;
const FS_BODY = 9.5;
const FS_SMALL = 8.5;
const FS_TINY = 7.5;

const LH_BODY = 13;

function json(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(iso);
  }
}

function auditTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case 'compliance_health_check': return 'Compliance Health Check';
    case 'mock_audit': return 'Mock Audit';
    case 'cricos': return 'CRICOS Audit';
    case 'due_diligence': return 'Due Diligence Review';
    case 'due_diligence_combined': return 'Due Diligence Review (Combined RTO + CRICOS)';
    default:
      return (t || 'Audit').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function ratingLabel(rating: string | null | undefined): string {
  switch ((rating || '').toLowerCase()) {
    case 'compliant': return 'COMPLIANT';
    case 'at_risk': return 'AT RISK';
    case 'non_compliant': return 'NON-COMPLIANT';
    case 'not_applicable': return 'N/A';
    case 'not_sighted': return 'NOT SIGHTED';
    case 'safe': return 'SAFE';
    default: return 'NOT ANSWERED';
  }
}

function ratingColour(rating: string | null | undefined): RGB {
  switch ((rating || '').toLowerCase()) {
    case 'compliant': case 'safe': return TEAL;
    case 'at_risk': return AMBER;
    case 'non_compliant': return RED;
    case 'not_applicable': case 'not_sighted': return GREY;
    default: return GREY;
  }
}

function priorityColour(p: string | null | undefined): RGB {
  switch ((p || '').toLowerCase()) {
    case 'critical': return RED;
    case 'high': return AMBER;
    case 'medium': return BLUE;
    case 'low': return TEAL;
    default: return GREY;
  }
}

function riskRatingColour(rr: string | null | undefined): RGB {
  switch ((rr || '').toLowerCase()) {
    case 'low': return TEAL;
    case 'moderate': case 'medium': return rgb(0.85, 0.65, 0.2);
    case 'high': return AMBER;
    case 'critical': case 'extreme': return RED;
    default: return GREY;
  }
}

/** Highest-priority finding raised against a section, or null if none. */
const PRIORITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
function sectionRiskFromFindings(sectionId: string, findings: any[]): string | null {
  let best: string | null = null;
  let bestRank = 0;
  for (const f of findings) {
    if (f.section_id !== sectionId) continue;
    const p = (f.priority || '').toLowerCase();
    const rank = PRIORITY_RANK[p] ?? 0;
    if (rank > bestRank) { bestRank = rank; best = p; }
  }
  return best;
}

/**
 * Strip Unicode characters that pdf-lib's WinAnsi-encoded standard fonts
 * cannot render. v2: bullets map to middle dot (·) which is native
 * WinAnsi and renders cleanly. Previously mapped to asterisk which read
 * as a typo.
 */
function sanitise(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[ ]/g, ' ')
    .replace(/[•●◦]/g, '·')
    .replace(/[→←↔]/g, '->')
    .replace(/[☑✓✔]/g, 'v')
    .replace(/[✗✘]/g, 'x')
    .replace(/[⚑⚐]/g, '!')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

interface PageCtx { page: PDFPage; y: number; }
interface RenderCtx {
  doc: PDFDocument; helv: PDFFont; helvBold: PDFFont;
  current: PageCtx; pageNum: number;
  totalLabel: string; generatedLabel: string; drawHeader: boolean;
}

function newPage(ctx: RenderCtx, drawHeader = true): PageCtx {
  const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pageNum += 1;
  if (drawHeader) drawPageHeader(page, ctx);
  drawPageFooter(page, ctx);
  const c: PageCtx = { page, y: PAGE_H - MARGIN_TOP };
  ctx.current = c;
  return c;
}

function drawPageHeader(page: PDFPage, ctx: RenderCtx) {
  page.drawRectangle({ x: 0, y: PAGE_H - 50, width: PAGE_W, height: 50, color: PURPLE });
  page.drawText('VIVACITY', { x: MARGIN_X, y: PAGE_H - 30, size: 14, font: ctx.helvBold, color: WHITE });
  page.drawText('Coaching & Consulting', { x: MARGIN_X + 84, y: PAGE_H - 30, size: 10, font: ctx.helv, color: WHITE });
  const rightLabel = 'AUDIT REPORT';
  const w = ctx.helvBold.widthOfTextAtSize(rightLabel, 10);
  page.drawText(rightLabel, { x: PAGE_W - MARGIN_X - w, y: PAGE_H - 30, size: 10, font: ctx.helvBold, color: WHITE });
}

function drawPageFooter(page: PDFPage, ctx: RenderCtx) {
  page.drawLine({
    start: { x: MARGIN_X, y: 38 }, end: { x: PAGE_W - MARGIN_X, y: 38 },
    thickness: 0.5, color: PURPLE,
  });
  const footer = `${sanitise(ctx.totalLabel)}  |  ${ctx.generatedLabel}  |  CONFIDENTIAL`;
  page.drawText(footer, { x: MARGIN_X, y: 24, size: FS_TINY, font: ctx.helv, color: GREY });
  const pageNumLabel = `Page ${ctx.pageNum}`;
  const w = ctx.helv.widthOfTextAtSize(pageNumLabel, FS_TINY);
  page.drawText(pageNumLabel, { x: PAGE_W - MARGIN_X - w, y: 24, size: FS_TINY, font: ctx.helv, color: GREY });
}

function ensureSpace(ctx: RenderCtx, needed: number) {
  if (ctx.current.y - needed < MARGIN_BOTTOM) newPage(ctx);
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  if (!text) return lines;
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) { lines.push(''); continue; }
    const words = para.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      const w = font.widthOfTextAtSize(candidate, size);
      if (w > maxWidth && line) { lines.push(line); line = word; }
      else { line = candidate; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawWrapped(
  ctx: RenderCtx, text: string, font: PDFFont, size: number,
  color = DARK, lineHeight = LH_BODY, indent = 0,
) {
  const safe = sanitise(text);
  const lines = wrapLines(safe, font, size, CONTENT_W - indent);
  for (const line of lines) {
    ensureSpace(ctx, lineHeight);
    if (line) {
      ctx.current.page.drawText(line, {
        x: MARGIN_X + indent, y: ctx.current.y - size,
        size, font, color,
      });
    }
    ctx.current.y -= lineHeight;
  }
}

function drawHeading(
  ctx: RenderCtx, text: string, size = FS_H1, color = ACAI,
  paddingTop = 12, paddingBottom = 6,
) {
  ensureSpace(ctx, size + paddingTop + paddingBottom + 2);
  ctx.current.y -= paddingTop;
  ctx.current.page.drawText(sanitise(text), {
    x: MARGIN_X, y: ctx.current.y - size, size,
    font: ctx.helvBold, color,
  });
  ctx.current.y -= size + paddingBottom;
}

function drawHRule(ctx: RenderCtx, color = LIGHT_GREY, thickness = 0.5) {
  ensureSpace(ctx, 8);
  ctx.current.y -= 4;
  ctx.current.page.drawLine({
    start: { x: MARGIN_X, y: ctx.current.y },
    end: { x: PAGE_W - MARGIN_X, y: ctx.current.y },
    thickness, color,
  });
  ctx.current.y -= 4;
}

function drawColouredBadge(
  ctx: RenderCtx, x: number, y: number, text: string,
  bg: RGB, fg = WHITE, size = FS_SMALL, paddingX = 6, paddingY = 3,
) {
  const w = ctx.helvBold.widthOfTextAtSize(text, size) + paddingX * 2;
  const h = size + paddingY * 2;
  ctx.current.page.drawRectangle({ x, y: y - h + paddingY, width: w, height: h, color: bg });
  ctx.current.page.drawText(text, {
    x: x + paddingX, y: y - size + paddingY, size,
    font: ctx.helvBold, color: fg,
  });
  return w;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  const t0 = Date.now();
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

  let body: { audit_id?: unknown };
  try { body = await req.json(); } catch { return json(req, { error: 'Invalid JSON body' }, 400); }
  const auditId = typeof body.audit_id === 'string' ? body.audit_id : '';
  if (!auditId) return json(req, { error: 'audit_id is required' }, 400);

  const { data: auditRow, error: auditErr } = await userClient
    .from('client_audits' as any)
    .select(
      'id, audit_type, title, doc_number, status, ' +
      'subject_tenant_id, snapshot_rto_name, snapshot_rto_number, ' +
      'snapshot_cricos_code, snapshot_site_address, snapshot_website, ' +
      'snapshot_phone, snapshot_email, snapshot_ceo, snapshot_other_contacts, ' +
      'snapshot_overseas_student_count, ' +
      'lead_auditor_id, assisted_by_id, report_prepared_by_id, ' +
      'training_products, is_cricos, is_rto, ' +
      'risk_rating, score_total, score_max, score_pct, ' +
      'executive_summary, overall_finding, risk_rationale, ' +
      'conducted_at, opening_meeting_at, closing_meeting_at, ' +
      'document_deadline_at, audit_location, audit_is_online, ' +
      'template_id, report_pdf_path',
    )
    .eq('id', auditId)
    .maybeSingle();
  if (auditErr || !auditRow) return json(req, { error: "You don't have access to this audit." }, 403);
  const audit = auditRow as Record<string, any>;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let templateName = 'Audit';
  if (audit.template_id) {
    const { data: tpl } = await admin
      .from('compliance_templates').select('name, framework')
      .eq('id', audit.template_id).maybeSingle();
    if (tpl) templateName = (tpl as any).name || templateName;
  }

  let leadAuditorName = '—';
  if (audit.lead_auditor_id) {
    const { data: la } = await admin
      .from('users').select('first_name, last_name')
      .eq('user_uuid', audit.lead_auditor_id).maybeSingle();
    if (la) leadAuditorName = `${(la as any).first_name ?? ''} ${(la as any).last_name ?? ''}`.trim() || '—';
  }

  let tenantName = audit.snapshot_rto_name || 'Unknown Provider';
  if (!audit.snapshot_rto_name) {
    const { data: tn } = await admin
      .from('tenants').select('name').eq('id', audit.subject_tenant_id).maybeSingle();
    if (tn) tenantName = (tn as any).name || tenantName;
  }

  const { data: sectionsRaw } = await admin
    .from('client_audit_sections')
    .select('id, title, standard_code, code_prefix, sort_order, audit_phase, score_total, score_max, risk_level, section_summary')
    .eq('audit_id', auditId).order('sort_order');
  const sections = (sectionsRaw ?? []) as any[];

  const { data: responsesRaw } = await admin
    .from('client_audit_responses')
    .select('id, audit_id, section_id, question_id, question_text, rating, notes, is_flagged, score, compliance_template_questions:question_id (clause, audit_statement, sort_order)')
    .eq('audit_id', auditId);
  const responses = (responsesRaw ?? []) as any[];

  const { data: findingsRaw } = await admin
    .from('client_audit_findings')
    .select('id, summary, detail, regulatory_reference, standard_reference, impact, priority, finding_code, section_id, response_id, client_audit_sections:section_id (title, code_prefix, standard_code)')
    .eq('audit_id', auditId);
  const findings = (findingsRaw ?? []) as any[];

  const { data: actionsRaw } = await admin
    .from('client_audit_actions')
    .select('id, finding_id, title, description, status, priority, action_type, delivery_model, standard_reference, due_date, assigned_to, evidence_required, client_audit_findings:finding_id (summary, priority)')
    .eq('audit_id', auditId);
  const actions = (actionsRaw ?? []) as any[];

  const assigneeIds = Array.from(new Set(actions.map((a) => a.assigned_to).filter(Boolean))) as string[];
  const assigneeNames: Record<string, string> = {};
  if (assigneeIds.length) {
    const { data: assignees } = await admin
      .from('users').select('user_uuid, first_name, last_name').in('user_uuid', assigneeIds);
    for (const a of (assignees ?? []) as any[]) {
      assigneeNames[a.user_uuid] = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim();
    }
  }

  const doc = await PDFDocument.create();
  doc.setTitle(`${auditTypeLabel(audit.audit_type)} — ${tenantName}`);
  doc.setAuthor('Vivacity Coaching & Consulting');
  doc.setSubject('Compliance Audit Report');
  doc.setProducer('Unicorn 2.0');
  doc.setCreator('Vivacity Unicorn 2.0');
  doc.setCreationDate(new Date());

  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const generatedDate = fmtDate(new Date().toISOString());
  const ctx: RenderCtx = {
    doc, helv, helvBold, pageNum: 0, current: null as any,
    totalLabel: tenantName,
    generatedLabel: `Generated ${generatedDate}`,
    drawHeader: false,
  };

  // ===== COVER =====
  const cover = doc.addPage([PAGE_W, PAGE_H]);
  ctx.pageNum = 1;
  ctx.current = { page: cover, y: PAGE_H - MARGIN_TOP };
  drawPageFooter(cover, ctx);

  cover.drawRectangle({ x: 0, y: PAGE_H - 110, width: PAGE_W, height: 110, color: PURPLE });
  cover.drawRectangle({ x: 0, y: PAGE_H - 115, width: PAGE_W, height: 5, color: FUCHSIA });
  cover.drawText('VIVACITY', { x: MARGIN_X, y: PAGE_H - 50, size: 28, font: helvBold, color: WHITE });
  cover.drawText('Coaching & Consulting', { x: MARGIN_X, y: PAGE_H - 75, size: 14, font: helv, color: WHITE });
  cover.drawText('We make Compliance Simple!', { x: MARGIN_X, y: PAGE_H - 95, size: 10, font: helv, color: LIGHT_PURPLE });

  let coverY = PAGE_H - 170;
  cover.drawText(sanitise(auditTypeLabel(audit.audit_type)), {
    x: MARGIN_X, y: coverY, size: FS_TITLE, font: helvBold, color: ACAI,
  });
  coverY -= 28;
  cover.drawText(sanitise(templateName), {
    x: MARGIN_X, y: coverY, size: FS_H2, font: helv, color: GREY,
  });
  coverY -= 30;

  cover.drawRectangle({ x: MARGIN_X - 4, y: coverY - 130, width: CONTENT_W + 8, height: 130, color: PALE });
  cover.drawRectangle({ x: MARGIN_X - 4, y: coverY - 4, width: 4, height: 130, color: PURPLE });
  cover.drawText(sanitise(tenantName), {
    x: MARGIN_X + 8, y: coverY - 22, size: FS_H1, font: helvBold, color: ACAI,
  });
  let infoY = coverY - 44;
  const infoLine = (label: string, value: string) => {
    cover.drawText(sanitise(label), { x: MARGIN_X + 8, y: infoY, size: FS_SMALL, font: helvBold, color: GREY });
    cover.drawText(sanitise(value), { x: MARGIN_X + 110, y: infoY, size: FS_SMALL, font: helv, color: DARK });
    infoY -= 16;
  };
  infoLine('RTO Code', audit.snapshot_rto_number || '—');
  if (audit.is_cricos) infoLine('CRICOS Code', audit.snapshot_cricos_code || '—');
  infoLine('Audit Type', auditTypeLabel(audit.audit_type));
  infoLine('Conducted', fmtDate(audit.conducted_at));
  infoLine('Lead Auditor', leadAuditorName);

  coverY -= 150;

  const scorePct = audit.score_pct !== null && audit.score_pct !== undefined
    ? Number(audit.score_pct).toFixed(1) + '%' : 'Incomplete';
  const scoreFraction = `${audit.score_total ?? '—'} of ${audit.score_max ?? '—'}`;
  const riskRating = (audit.risk_rating || 'unknown').toUpperCase();

  const scoreBoxW = (CONTENT_W - 16) / 2;
  cover.drawRectangle({
    x: MARGIN_X, y: coverY - 100, width: scoreBoxW, height: 100,
    color: WHITE, borderColor: PURPLE, borderWidth: 1.5,
  });
  cover.drawText('OVERALL SCORE', { x: MARGIN_X + 12, y: coverY - 22, size: FS_SMALL, font: helvBold, color: GREY });
  cover.drawText(scorePct, { x: MARGIN_X + 12, y: coverY - 60, size: 32, font: helvBold, color: ACAI });
  cover.drawText(scoreFraction + ' points', { x: MARGIN_X + 12, y: coverY - 82, size: FS_SMALL, font: helv, color: GREY });

  const riskBoxX = MARGIN_X + scoreBoxW + 16;
  const riskColor = riskRatingColour(audit.risk_rating);
  cover.drawRectangle({ x: riskBoxX, y: coverY - 100, width: scoreBoxW, height: 100, color: riskColor });
  cover.drawText('RISK RATING', { x: riskBoxX + 12, y: coverY - 22, size: FS_SMALL, font: helvBold, color: WHITE });
  cover.drawText(riskRating, { x: riskBoxX + 12, y: coverY - 60, size: 28, font: helvBold, color: WHITE });
  const riskCount = `${findings.filter((f) => f.priority === 'critical').length} critical • ${
    findings.filter((f) => f.priority === 'high').length} high • ${
    findings.filter((f) => f.priority === 'medium').length} medium`;
  cover.drawText(sanitise(riskCount), { x: riskBoxX + 12, y: coverY - 82, size: FS_SMALL, font: helv, color: WHITE });

  coverY -= 120;

  cover.drawLine({
    start: { x: MARGIN_X, y: coverY }, end: { x: PAGE_W - MARGIN_X, y: coverY },
    thickness: 0.5, color: LIGHT_GREY,
  });
  cover.drawText(`Report generated ${generatedDate}`, { x: MARGIN_X, y: coverY - 18, size: FS_SMALL, font: helv, color: GREY });
  cover.drawText('CONFIDENTIAL — distribute only to the named provider above.', { x: MARGIN_X, y: coverY - 32, size: FS_TINY, font: helv, color: GREY });

  // ===== EXEC SUMMARY =====
  newPage(ctx);
  drawHeading(ctx, 'Executive Summary', FS_H1, ACAI, 0, 8);
  if (audit.executive_summary) {
    drawWrapped(ctx, audit.executive_summary, helv, FS_BODY);
  } else {
    drawWrapped(ctx, 'The executive summary has not yet been finalised for this audit.', helv, FS_BODY, GREY);
  }
  drawHRule(ctx);
  drawHeading(ctx, 'Overall Finding', FS_H2, PURPLE, 6, 4);
  if (audit.overall_finding) {
    drawWrapped(ctx, audit.overall_finding, helvBold, FS_BODY, ACAI);
  } else {
    drawWrapped(ctx, '(not provided)', helv, FS_BODY, GREY);
  }
  drawHRule(ctx);
  drawHeading(ctx, 'Risk Rating Rationale', FS_H2, PURPLE, 6, 4);
  if (audit.risk_rationale) {
    drawWrapped(ctx, audit.risk_rationale, helv, FS_BODY);
  } else {
    drawWrapped(ctx, 'No rationale recorded.', helv, FS_BODY, GREY);
  }

  // ===== SECTION ROLLUP =====
  newPage(ctx);
  drawHeading(ctx, 'Section Rollup', FS_H1, ACAI, 0, 8);

  // v4: dropped the Score column (client_audit_sections.score_total/
  // score_max are never populated anywhere in the app — only an
  // audit-wide total exists — so it always read "Not scored"). Risk is
  // now derived from the highest-priority finding raised against the
  // section instead of the always-null risk_level column.
  const colX = {
    section: MARGIN_X + 4,
    risk: MARGIN_X + 340,
    findings: MARGIN_X + 430,
  };
  ensureSpace(ctx, 24);
  ctx.current.page.drawRectangle({
    x: MARGIN_X, y: ctx.current.y - 18, width: CONTENT_W, height: 18, color: LIGHT_PURPLE,
  });
  ctx.current.page.drawText('Section', { x: colX.section, y: ctx.current.y - 13, size: FS_SMALL, font: helvBold, color: ACAI });
  ctx.current.page.drawText('Risk', { x: colX.risk, y: ctx.current.y - 13, size: FS_SMALL, font: helvBold, color: ACAI });
  ctx.current.page.drawText('Findings', { x: colX.findings, y: ctx.current.y - 13, size: FS_SMALL, font: helvBold, color: ACAI });
  ctx.current.y -= 22;

  for (const s of sections) {
    ensureSpace(ctx, 32);
    const titleLines = wrapLines(
      sanitise(s.title || 'Untitled section'), helv, FS_SMALL,
      colX.risk - colX.section - 4,
    );
    const rowH = Math.max(18, titleLines.length * 12 + 4);
    let ty = ctx.current.y - 11;
    for (const tl of titleLines) {
      ctx.current.page.drawText(tl, { x: colX.section, y: ty, size: FS_SMALL, font: helv, color: DARK });
      ty -= 12;
    }
    const derivedRisk = sectionRiskFromFindings(s.id, findings);
    if (derivedRisk) {
      drawColouredBadge(
        ctx, colX.risk, ctx.current.y - 4,
        derivedRisk.toUpperCase(),
        riskRatingColour(derivedRisk), WHITE, FS_TINY, 5, 2,
      );
    } else {
      ctx.current.page.drawText('—', {
        x: colX.risk, y: ctx.current.y - 11, size: FS_SMALL, font: helv, color: GREY,
      });
    }
    const sectionFindingsCount = findings.filter((f) => f.section_id === s.id).length;
    ctx.current.page.drawText(String(sectionFindingsCount), {
      x: colX.findings, y: ctx.current.y - 11, size: FS_SMALL,
      font: sectionFindingsCount > 0 ? helvBold : helv,
      color: sectionFindingsCount > 0 ? RED : GREY,
    });
    ctx.current.y -= rowH;
    ctx.current.page.drawLine({
      start: { x: MARGIN_X, y: ctx.current.y },
      end: { x: PAGE_W - MARGIN_X, y: ctx.current.y },
      thickness: 0.3, color: LIGHT_GREY,
    });
    ctx.current.y -= 4;
  }

  // ===== FINDINGS =====
  if (findings.length > 0) {
    newPage(ctx);
    drawHeading(ctx, `Findings (${findings.length})`, FS_H1, ACAI, 0, 8);

    const groups: Array<{ key: string; label: string; color: RGB }> = [
      { key: 'critical', label: 'Critical', color: RED },
      { key: 'high', label: 'High', color: AMBER },
      { key: 'medium', label: 'Medium', color: BLUE },
      { key: 'low', label: 'Low', color: TEAL },
    ];

    for (const g of groups) {
      const inGroup = findings.filter((f) => (f.priority || '').toLowerCase() === g.key);
      if (inGroup.length === 0) continue;
      drawHeading(ctx, `${g.label} priority (${inGroup.length})`, FS_H2, g.color, 14, 6);

      for (const f of inGroup) {
        const code = f.finding_code || '';
        const summaryText = (code ? `[${code}] ` : '') + (f.summary || '');
        const secTitle = f.client_audit_sections?.title || 'Section';
        const refLine = `${secTitle}${
          f.regulatory_reference || f.standard_reference
            ? '  •  ' + (f.regulatory_reference || f.standard_reference)
            : ''
        }`;

        // v3: wrap heading + reference line instead of a single drawText()
        // call, which let long text run off the right edge of the page.
        const HEADING_LH = 13;
        const REF_LH = 11;
        const headingLines = wrapLines(sanitise(summaryText), helvBold, FS_H3, CONTENT_W - 4);
        const refLines = wrapLines(sanitise(refLine), helv, FS_TINY, CONTENT_W - 4);
        const cardHeaderH = Math.max(headingLines.length, 1) * HEADING_LH
          + Math.max(refLines.length, 1) * REF_LH;

        ensureSpace(ctx, cardHeaderH + 40);
        const cardTop = ctx.current.y;
        ctx.current.page.drawRectangle({
          x: MARGIN_X - 4, y: cardTop - cardHeaderH, width: 4, height: cardHeaderH, color: g.color,
        });

        let lineY = cardTop;
        for (const hl of (headingLines.length ? headingLines : [''])) {
          if (hl) {
            ctx.current.page.drawText(hl, {
              x: MARGIN_X + 4, y: lineY - FS_H3, size: FS_H3, font: helvBold, color: ACAI,
            });
          }
          lineY -= HEADING_LH;
        }
        for (const rl of (refLines.length ? refLines : [''])) {
          if (rl) {
            ctx.current.page.drawText(rl, {
              x: MARGIN_X + 4, y: lineY - FS_TINY, size: FS_TINY, font: helv, color: GREY,
            });
          }
          lineY -= REF_LH;
        }
        ctx.current.y = lineY - 6;

        if (f.detail) drawWrapped(ctx, f.detail, helv, FS_BODY, DARK, LH_BODY, 4);
        if (f.impact) {
          ctx.current.y -= 4;
          drawWrapped(ctx, 'Impact:', helvBold, FS_SMALL, PURPLE, 12, 4);
          drawWrapped(ctx, f.impact, helv, FS_BODY, DARK, LH_BODY, 4);
        }
        ctx.current.y -= 6;
        drawHRule(ctx, LIGHT_GREY, 0.3);
      }
    }
  }

  // ===== ACTION PLAN =====
  if (actions.length > 0) {
    newPage(ctx);
    drawHeading(ctx, `Action Plan (${actions.length})`, FS_H1, ACAI, 0, 8);
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const sortedActions = [...actions].sort((a, b) => {
      const ap = order[(a.priority || 'medium').toLowerCase()] ?? 9;
      const bp = order[(b.priority || 'medium').toLowerCase()] ?? 9;
      if (ap !== bp) return ap - bp;
      return (a.due_date || '').localeCompare(b.due_date || '');
    });

    for (const a of sortedActions) {
      // v3: wrap the action title instead of a single drawText() call,
      // which let long titles run off the right edge of the page.
      const TITLE_LH = 13;
      const titleLines = wrapLines(sanitise(a.title || '(no title)'), helvBold, FS_H3, CONTENT_W - 4);
      const titleH = Math.max(titleLines.length, 1) * TITLE_LH;

      ensureSpace(ctx, titleH + 40);
      const cardTop = ctx.current.y;
      ctx.current.page.drawRectangle({
        x: MARGIN_X - 4, y: cardTop - titleH, width: 4, height: titleH,
        color: priorityColour(a.priority),
      });

      let lineY = cardTop;
      for (const tl of (titleLines.length ? titleLines : [''])) {
        if (tl) {
          ctx.current.page.drawText(tl, {
            x: MARGIN_X + 4, y: lineY - FS_H3, size: FS_H3, font: helvBold, color: ACAI,
          });
        }
        lineY -= TITLE_LH;
      }

      const prioLabel = (a.priority || 'medium').toUpperCase();
      const badgeW = helvBold.widthOfTextAtSize(prioLabel, FS_TINY) + 10;
      drawColouredBadge(
        ctx, PAGE_W - MARGIN_X - badgeW, cardTop - 4, prioLabel,
        priorityColour(a.priority), WHITE, FS_TINY, 5, 2,
      );
      ctx.current.y = lineY - 4;
      // v2: "TBC" instead of "Unassigned" reads as a friendly placeholder
      // rather than a system error state.
      const assignee = (a.assigned_to && assigneeNames[a.assigned_to])
        ? assigneeNames[a.assigned_to] : 'TBC';
      const due = fmtDate(a.due_date);
      const status = (a.status || 'open').toUpperCase().replace(/_/g, ' ');
      const meta = `Owner: ${assignee}  •  Due: ${due}  •  Status: ${status}`;
      ctx.current.page.drawText(sanitise(meta), {
        x: MARGIN_X + 4, y: ctx.current.y - 9, size: FS_TINY, font: helv, color: GREY,
      });
      ctx.current.y -= 14;
      if (a.description) drawWrapped(ctx, a.description, helv, FS_BODY, DARK, LH_BODY, 4);
      ctx.current.y -= 4;
      drawHRule(ctx, LIGHT_GREY, 0.3);
    }
  }

  // ===== DETAILED RESPONSES =====
  if (sections.length > 0) {
    newPage(ctx);
    drawHeading(ctx, 'Detailed Responses', FS_H1, ACAI, 0, 8);
    const responsesBySection = new Map<string, any[]>();
    for (const r of responses) {
      const sid = r.section_id || '_orphan';
      if (!responsesBySection.has(sid)) responsesBySection.set(sid, []);
      responsesBySection.get(sid)!.push(r);
    }
    for (const arr of responsesBySection.values()) {
      arr.sort((a, b) =>
        (a.compliance_template_questions?.sort_order ?? 0) -
        (b.compliance_template_questions?.sort_order ?? 0));
    }
    for (const s of sections) {
      const sectionResponses = responsesBySection.get(s.id) || [];
      if (sectionResponses.length === 0) continue;
      drawHeading(ctx, s.title || 'Section', FS_H2, PURPLE, 14, 6);
      // v4: the "[clause]" prefix is a real Standards clause reference for
      // assessment sections, but for Opening Meeting questions that column
      // holds an internal categorisation hint ("Context", "Changes", ...)
      // that isn't meant for the client-facing report.
      const showClauseLabel = s.audit_phase !== 'opening_meeting';
      for (const r of sectionResponses) {
        ensureSpace(ctx, 36);
        const q = r.compliance_template_questions || {};
        const clause = (q.clause && showClauseLabel) ? `[${q.clause}] ` : '';
        const stmt = q.audit_statement || r.question_text || '(no statement)';
        const qText = sanitise(clause + stmt);
        const qLines = wrapLines(qText, helvBold, FS_SMALL, CONTENT_W - 4);
        for (const ql of qLines) {
          ensureSpace(ctx, 12);
          ctx.current.page.drawText(ql, {
            x: MARGIN_X + 4, y: ctx.current.y - FS_SMALL,
            size: FS_SMALL, font: helvBold, color: DARK,
          });
          ctx.current.y -= 11;
        }
        ensureSpace(ctx, 18);
        ctx.current.y -= 2;
        drawColouredBadge(
          ctx, MARGIN_X + 4, ctx.current.y - 2,
          ratingLabel(r.rating), ratingColour(r.rating), WHITE, FS_TINY, 5, 2,
        );
        if (r.is_flagged) {
          drawColouredBadge(
            ctx, MARGIN_X + 4 + 110, ctx.current.y - 2,
            'FLAGGED', RED, WHITE, FS_TINY, 5, 2,
          );
        }
        ctx.current.y -= 14;
        if (r.notes) drawWrapped(ctx, r.notes, helv, FS_TINY, DARK, 10, 4);
        ctx.current.y -= 4;
      }
    }
  }

  const pdfBytes = await doc.save();
  const ts = Date.now();
  const safeRtoCode = (audit.snapshot_rto_number || 'audit').replace(/[^0-9A-Za-z]/g, '');
  const fileName = `audit-report-${safeRtoCode}-${ts}.pdf`;
  const storagePath = `${audit.subject_tenant_id}/${auditId}/${fileName}`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET).upload(storagePath, pdfBytes, {
      contentType: 'application/pdf', upsert: true,
    });
  if (uploadErr) {
    console.error('generate-client-audit-report upload failed:', uploadErr.message);
    return json(req, { error: 'Failed to upload generated PDF', detail: uploadErr.message }, 500);
  }

  const generatedAt = new Date().toISOString();
  const { error: updErr } = await admin
    .from('client_audits' as any)
    .update({
      report_pdf_path: storagePath,
      report_generated_at: generatedAt,
      report_prepared_by_id: callerUserId,
    })
    .eq('id', auditId);
  if (updErr) {
    console.error('generate-client-audit-report update failed:', updErr.message);
    return json(req, {
      error: 'PDF generated but failed to record path on audit',
      detail: updErr.message, storage_path: storagePath,
    }, 500);
  }

  const { data: signedData } = await admin.storage
    .from(BUCKET).createSignedUrl(storagePath, 3600);

  await admin.from('client_audit_log' as any).insert({
    tenant_id: Number(audit.subject_tenant_id),
    actor_user_id: callerUserId,
    action: 'audit.report_generated',
    entity_type: 'client_audits',
    entity_id: auditId,
    details: {
      audit_type: audit.audit_type,
      snapshot_rto_name: audit.snapshot_rto_name,
      score_pct: audit.score_pct,
      risk_rating: audit.risk_rating,
      bucket: BUCKET,
      storage_path: storagePath,
      file_name: fileName,
      bytes: pdfBytes.byteLength,
      sections_count: sections.length,
      responses_count: responses.length,
      findings_count: findings.length,
      actions_count: actions.length,
      page_count: ctx.pageNum,
      elapsed_ms: Date.now() - t0,
    },
  });

  return json(req, {
    ok: true,
    audit_id: auditId,
    bucket: BUCKET,
    storage_path: storagePath,
    file_name: fileName,
    bytes: pdfBytes.byteLength,
    pages: ctx.pageNum,
    generated_at: generatedAt,
    download_url: signedData?.signedUrl ?? null,
    stats: {
      sections: sections.length,
      responses: responses.length,
      findings: findings.length,
      actions: actions.length,
    },
  }, 200);
});
