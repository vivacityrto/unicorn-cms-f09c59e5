import type { ClientAudit } from '@/types/clientAudits';
import { AUDIT_TYPE_LABELS, AUDIT_RISK_LABELS } from '@/types/clientAudits';
import type { AuditFinding, AuditAction } from '@/types/auditWorkspace';

export const PRELIMINARY_DISCLAIMER_HTML = `
<div style="background:#FFF7E6;border:1px solid #F5C77E;border-radius:8px;padding:12px 14px;margin:0 0 18px;">
  <strong style="color:#8A5A00;">PRELIMINARY SUMMARY — subject to change.</strong>
  <div style="color:#5A4200;font-size:13px;margin-top:4px;">
    This document reflects the current state of an audit in progress. Findings, ratings and recommendations are provisional and may change before the final report is issued.
  </div>
</div>
`.trim();

const escapeHtml = (s: string | null | undefined) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export interface SectionCoverage {
  sectionId: string;
  title: string;
  answered: number;
  total: number;
}

export interface OutstandingEvidenceItem {
  questionText: string;
  sectionTitle: string;
  rating: string;
}

interface ActionWithExtras extends AuditAction {
  assigned_to_name?: string | null;
}

interface BuildArgs {
  audit: ClientAudit;
  findings: AuditFinding[];
  actions: ActionWithExtras[];
  clientName?: string | null;
  openingMeetingStatus?: string | null;
  closingMeetingStatus?: string | null;
  completion?: {
    answered: number;
    total: number;
  } | null;
  sectionCoverage?: SectionCoverage[];
  outstandingEvidence?: OutstandingEvidenceItem[];
}

export function buildPreliminarySummarySubject(audit: ClientAudit, clientName?: string | null) {
  const title = audit.title || AUDIT_TYPE_LABELS[audit.audit_type] || 'Audit';
  const client = clientName || audit.snapshot_rto_name || 'Client';
  return `Preliminary Audit Summary — ${client} — ${title}`;
}

export function buildPreliminarySummaryHtml({
  audit,
  findings,
  actions,
  clientName,
  openingMeetingStatus,
  closingMeetingStatus,
  completion,
  sectionCoverage,
  outstandingEvidence,
}: BuildArgs): string {
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const auditTypeLabel = AUDIT_TYPE_LABELS[audit.audit_type] || audit.audit_type;
  const client = clientName || audit.snapshot_rto_name || '—';

  const completionPct =
    completion && completion.total > 0
      ? Math.round((completion.answered / completion.total) * 100)
      : null;

  const priorityOrder: Array<AuditFinding['priority']> = ['critical', 'high', 'medium', 'low'];
  const groupedFindings = priorityOrder.map(p => ({
    priority: p,
    items: findings.filter(f => f.priority === p),
  }));

  const colourMap: Record<string, string> = {
    critical: '#B91C1C',
    high: '#C2410C',
    medium: '#B45309',
    low: '#15803D',
  };

  const findingsHtml = groupedFindings
    .filter(g => g.items.length > 0)
    .map(g => {
      const rows = g.items
        .map(f => {
          const stdRef = f.standard_reference
            ? `<span style="display:inline-block;background:#F3F4F6;color:#374151;padding:1px 8px;border-radius:10px;font-size:11px;margin-left:8px;">${escapeHtml(f.standard_reference)}</span>`
            : '';
          const detail = f.detail
            ? `<div style="color:#374151;font-size:13px;margin:4px 0 0 0;">${escapeHtml(f.detail)}</div>`
            : '';
          const impact = f.impact
            ? `<div style="color:#4B5563;font-size:13px;margin:4px 0 0 0;"><strong>Impact:</strong> ${escapeHtml(f.impact)}</div>`
            : '';
          const aiTag = f.is_auto_generated
            ? ' <em style="color:#8B5CF6;font-size:12px;">(AI draft, pending review)</em>'
            : '';
          return `
            <li style="margin:0 0 12px;">
              <div style="font-weight:500;color:#111827;">
                ${escapeHtml(f.summary)}${aiTag}${stdRef}
              </div>
              ${detail}
              ${impact}
            </li>`;
        })
        .join('');
      return `
        <div style="margin:0 0 14px;">
          <div style="font-weight:600;color:${colourMap[g.priority]};margin:0 0 8px;text-transform:uppercase;font-size:12px;letter-spacing:0.04em;">
            ${g.priority} (${g.items.length})
          </div>
          <ul style="margin:0;padding-left:20px;color:#1F2937;font-size:14px;list-style:disc;">${rows}</ul>
        </div>
      `;
    })
    .join('');

  const openActions = actions.filter(a => a.status !== 'complete' && a.status !== 'cancelled');
  const topActions = [...openActions]
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
      return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
    })
    .slice(0, 8);

  // Build a quick lookup for finding summaries to link actions back to their source
  const findingMap = new Map(findings.map(f => [f.id, f.summary]));

  const actionsHtml = topActions.length
    ? `
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 0;">
        <thead>
          <tr style="background:#F3F4F6;">
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #E5E7EB;">Action</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #E5E7EB;">Owner</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #E5E7EB;">Priority</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #E5E7EB;">Due</th>
          </tr>
        </thead>
        <tbody>
          ${topActions
            .map(a => {
              const linkedFinding = a.finding_id ? findingMap.get(a.finding_id) : null;
              const linkedLine = linkedFinding
                ? `<div style="font-size:12px;color:#6B7280;margin-top:2px;">— linked to: ${escapeHtml(truncate(linkedFinding, 60))}</div>`
                : '';
              const owner = a.assigned_to_name?.trim() || 'Unassigned';
              return `
                <tr>
                  <td style="padding:6px 8px;border-bottom:1px solid #F3F4F6;vertical-align:top;">
                    <div>${escapeHtml(a.title)}</div>
                    ${linkedLine}
                  </td>
                  <td style="padding:6px 8px;border-bottom:1px solid #F3F4F6;vertical-align:top;color:${owner === 'Unassigned' ? '#9CA3AF' : '#1F2937'};">${escapeHtml(owner)}</td>
                  <td style="padding:6px 8px;border-bottom:1px solid #F3F4F6;text-transform:capitalize;vertical-align:top;">${a.priority}</td>
                  <td style="padding:6px 8px;border-bottom:1px solid #F3F4F6;vertical-align:top;">${formatDate(a.extended_due_date || a.due_date)}</td>
                </tr>`;
            })
            .join('')}
        </tbody>
      </table>
      ${openActions.length > topActions.length
        ? `<p style="font-size:12px;color:#6B7280;margin:6px 0 0;">…and ${openActions.length - topActions.length} more open action${openActions.length - topActions.length === 1 ? '' : 's'}.</p>`
        : ''}
    `
    : '<p style="color:#6B7280;font-size:13px;margin:6px 0 0;">No open action items recorded yet.</p>';

  // Risk + score narrative
  const criticalCount = findings.filter(f => f.priority === 'critical').length;
  const highCount = findings.filter(f => f.priority === 'high').length;
  const riskLine = audit.risk_rating
    ? `<strong>${escapeHtml(AUDIT_RISK_LABELS[audit.risk_rating])}</strong>`
    : '<em style="color:#6B7280;">Not yet rated</em>';

  const scoreNarrative = (() => {
    if (audit.score_pct === null && findings.length === 0) return '';
    const parts: string[] = [];
    if (audit.score_pct !== null) {
      parts.push(`Indicative score <strong>${audit.score_pct}%</strong>`);
    }
    if (completion && completion.total > 0) {
      parts.push(`${completion.answered} of ${completion.total} questions rated`);
    }
    if (findings.length > 0) {
      const breakdownBits: string[] = [];
      if (criticalCount > 0) breakdownBits.push(`${criticalCount} critical`);
      if (highCount > 0) breakdownBits.push(`${highCount} high`);
      const breakdown = breakdownBits.length ? ` (${breakdownBits.join(', ')})` : '';
      parts.push(`${findings.length} finding${findings.length === 1 ? '' : 's'} raised${breakdown}`);
    }
    if (!parts.length) return '';
    return `<p style="font-size:13px;color:#4B5563;margin:6px 0 0;font-style:italic;">${parts.join(' — ')}.</p>`;
  })();

  const meetingLine = (label: string, status?: string | null) => {
    const done = status === 'completed';
    return `<li>${label}: <strong style="color:${done ? '#15803D' : '#B45309'};">${done ? 'Completed' : status ? status.replace(/_/g, ' ') : 'Pending'}</strong></li>`;
  };

  const execSummary = audit.executive_summary
    ? `
      <h3 style="font-size:15px;color:#111827;margin:18px 0 6px;">Auditor's interim notes</h3>
      <div style="font-size:14px;color:#1F2937;white-space:pre-wrap;">${escapeHtml(audit.executive_summary)}</div>
    `
    : '';

  return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:14px;line-height:1.5;">
  ${PRELIMINARY_DISCLAIMER_HTML}

  <h2 style="font-size:18px;margin:0 0 4px;color:#111827;">${escapeHtml(audit.title || auditTypeLabel)}</h2>
  <div style="color:#6B7280;font-size:13px;margin:0 0 16px;">
    ${escapeHtml(auditTypeLabel)} · ${escapeHtml(client)} · Prepared ${today}
  </div>

  <h3 style="font-size:15px;color:#111827;margin:18px 0 6px;">Coverage so far</h3>
  <ul style="margin:0;padding-left:20px;font-size:14px;color:#1F2937;">
    ${
      completionPct !== null
        ? `<li>Audit completion: <strong>${completionPct}%</strong> <span style="color:#6B7280;">(${completion!.answered} of ${completion!.total} questions answered)</span></li>`
        : ''
    }
    ${meetingLine('Opening meeting', openingMeetingStatus)}
    ${meetingLine('Closing meeting', closingMeetingStatus)}
    <li>Conducted on: <strong>${formatDate(audit.conducted_at)}</strong></li>
    <li>Current risk rating: ${riskLine}</li>
  </ul>
  ${scoreNarrative}

  <h3 style="font-size:15px;color:#111827;margin:18px 0 6px;">Findings to date (${findings.length})</h3>
  ${findings.length ? findingsHtml : '<p style="color:#6B7280;font-size:13px;margin:0;">No findings recorded yet.</p>'}

  <h3 style="font-size:15px;color:#111827;margin:18px 0 6px;">Open action items (${openActions.length})</h3>
  ${actionsHtml}

  ${execSummary}

  <hr style="border:none;border-top:1px solid #E5E7EB;margin:22px 0 12px;" />
  <p style="font-size:12px;color:#6B7280;margin:0;">
    This is a preliminary, information-only summary and is <strong>not</strong> the final audit report. Content may change as the audit progresses.
  </p>
</div>
  `.trim();
}
