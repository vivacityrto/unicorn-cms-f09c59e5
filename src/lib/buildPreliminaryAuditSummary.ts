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

interface BuildArgs {
  audit: ClientAudit;
  findings: AuditFinding[];
  actions: AuditAction[];
  clientName?: string | null;
  openingMeetingStatus?: string | null;
  closingMeetingStatus?: string | null;
  completion?: {
    answered: number;
    total: number;
  } | null;
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

  const findingsHtml = groupedFindings
    .filter(g => g.items.length > 0)
    .map(g => {
      const rows = g.items
        .map(
          f => `
            <li style="margin:0 0 6px;">
              ${escapeHtml(f.summary)}
              ${f.is_auto_generated ? ' <em style="color:#8B5CF6;font-size:12px;">(AI draft, pending review)</em>' : ''}
            </li>`,
        )
        .join('');
      const colourMap: Record<string, string> = {
        critical: '#B91C1C',
        high: '#C2410C',
        medium: '#B45309',
        low: '#15803D',
      };
      return `
        <div style="margin:0 0 12px;">
          <div style="font-weight:600;color:${colourMap[g.priority]};margin:0 0 6px;text-transform:uppercase;font-size:12px;letter-spacing:0.04em;">
            ${g.priority} (${g.items.length})
          </div>
          <ul style="margin:0;padding-left:20px;color:#1F2937;font-size:14px;">${rows}</ul>
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

  const actionsHtml = topActions.length
    ? `
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 0;">
        <thead>
          <tr style="background:#F3F4F6;">
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #E5E7EB;">Action</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #E5E7EB;">Priority</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #E5E7EB;">Due</th>
          </tr>
        </thead>
        <tbody>
          ${topActions
            .map(
              a => `
                <tr>
                  <td style="padding:6px 8px;border-bottom:1px solid #F3F4F6;">${escapeHtml(a.title)}</td>
                  <td style="padding:6px 8px;border-bottom:1px solid #F3F4F6;text-transform:capitalize;">${a.priority}</td>
                  <td style="padding:6px 8px;border-bottom:1px solid #F3F4F6;">${formatDate(a.extended_due_date || a.due_date)}</td>
                </tr>`,
            )
            .join('')}
        </tbody>
      </table>
      ${openActions.length > topActions.length
        ? `<p style="font-size:12px;color:#6B7280;margin:6px 0 0;">…and ${openActions.length - topActions.length} more open action${openActions.length - topActions.length === 1 ? '' : 's'}.</p>`
        : ''}
    `
    : '<p style="color:#6B7280;font-size:13px;margin:6px 0 0;">No open action items recorded yet.</p>';

  const riskLine = audit.risk_rating
    ? `<strong>${escapeHtml(AUDIT_RISK_LABELS[audit.risk_rating])}</strong>`
    : '<em style="color:#6B7280;">Not yet rated</em>';

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
    ${meetingLine('Opening meeting', openingMeetingStatus)}
    ${meetingLine('Closing meeting', closingMeetingStatus)}
    <li>Conducted on: <strong>${formatDate(audit.conducted_at)}</strong></li>
    <li>Current risk rating: ${riskLine}</li>
    ${audit.score_pct !== null ? `<li>Indicative score: <strong>${audit.score_pct}%</strong></li>` : ''}
  </ul>

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
