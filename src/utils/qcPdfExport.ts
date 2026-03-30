/**
 * QC PDF Export — Generates a printable report for a Quarterly Conversation
 * by rendering all section data into a new window for Save-as-PDF / Print.
 */
import type { QCSection, QCAnswer, QCFit, QCSignoff } from '@/types/qc';
import { format } from 'date-fns';

interface QCPdfExportData {
  revieweeName: string;
  managerNames: string[];
  scheduledAt: string | null;
  templateName: string;
  quarterStart: string;
  quarterEnd: string;
  sections: QCSection[];
  answers: QCAnswer[];
  fit: QCFit[];
  signoffs: QCSignoff[];
  summaryText: string;
  coreValues?: string[];
}

const ALIGNMENT_LABELS: Record<string, { label: string; color: string }> = {
  rarely: { label: 'Rarely', color: '#dc2626' },
  sometimes: { label: 'Sometimes', color: '#ca8a04' },
  consistently: { label: 'Consistently', color: '#16a34a' },
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAlignmentBadge(value: string | undefined): string {
  if (!value) return '<span style="color:#999;font-style:italic">Not rated</span>';
  const opt = ALIGNMENT_LABELS[value.toLowerCase()];
  if (!opt) return escapeHtml(value);
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;color:#fff;background:${opt.color}">${opt.label}</span>`;
}

function parseGwcNotes(raw: string | null): Record<string, string> {
  const empty = { gets_it: '', wants_it: '', capacity: '', general: '' };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return { ...empty, ...parsed };
  } catch {
    return { ...empty, general: raw };
  }
  return empty;
}

function getAnswerValue(answers: QCAnswer[], sectionKey: string, promptKey: string, role: string): string {
  const a = answers.find(
    ans => ans.section_key === sectionKey && ans.prompt_key === promptKey && ans.respondent_role === role
  );
  return a?.value_json?.value ?? '';
}

function renderSectionHtml(
  section: QCSection,
  answers: QCAnswer[],
  coreValues?: string[]
): string {
  const hasCoreValues = section.key === 'core_values' && coreValues && coreValues.length > 0;

  let html = `<div class="section">
    <h2>${escapeHtml(section.title)}</h2>`;

  // Core values assessment
  if (hasCoreValues) {
    html += `<table class="data-table"><thead><tr>
      <th>Core Value</th><th>Reviewee</th><th>Manager</th><th>Reviewee Notes</th><th>Manager Notes</th>
    </tr></thead><tbody>`;

    coreValues!.forEach((valueName, idx) => {
      const revieweeVal = getAnswerValue(answers, section.key, `cv_alignment_${idx}`, 'reviewee');
      const managerVal = getAnswerValue(answers, section.key, `cv_alignment_${idx}`, 'manager');
      const revieweeNotes = getAnswerValue(answers, section.key, `cv_notes_${idx}`, 'reviewee');
      const managerNotes = getAnswerValue(answers, section.key, `cv_notes_${idx}`, 'manager');

      html += `<tr>
        <td><strong>${escapeHtml(valueName)}</strong></td>
        <td>${renderAlignmentBadge(revieweeVal)}</td>
        <td>${renderAlignmentBadge(managerVal)}</td>
        <td>${revieweeNotes ? escapeHtml(revieweeNotes) : '<em style="color:#999">—</em>'}</td>
        <td>${managerNotes ? escapeHtml(managerNotes) : '<em style="color:#999">—</em>'}</td>
      </tr>`;
    });

    html += `</tbody></table>`;
  }

  // Filter out value_alignment when we have per-value assessments
  const prompts = hasCoreValues
    ? section.prompts.filter(p => p.key !== 'value_alignment')
    : section.prompts;

  if (prompts.length > 0) {
    html += `<table class="data-table"><thead><tr>
      <th style="width:30%">Question</th><th style="width:35%">Reviewee</th><th style="width:35%">Manager</th>
    </tr></thead><tbody>`;

    prompts.forEach(prompt => {
      const revieweeVal = getAnswerValue(answers, section.key, prompt.key, 'reviewee');
      const managerVal = getAnswerValue(answers, section.key, prompt.key, 'manager');

      const formatVal = (val: string) => {
        if (!val) return '<em style="color:#999">—</em>';
        if (val === 'true') return '✓ Yes';
        if (val === 'false') return '✗ No';
        return escapeHtml(val).replace(/\n/g, '<br/>');
      };

      html += `<tr>
        <td><strong>${escapeHtml(prompt.label)}</strong></td>
        <td>${formatVal(revieweeVal)}</td>
        <td>${formatVal(managerVal)}</td>
      </tr>`;
    });

    html += `</tbody></table>`;
  }

  html += `</div>`;
  return html;
}

function renderGwcHtml(fit: QCFit[]): string {
  const revieweeFit = fit.find(f => f.respondent_role === 'reviewee');
  const managerFit = fit.find(f => f.respondent_role === 'manager');

  const revieweeNotes = parseGwcNotes(revieweeFit?.notes || null);
  const managerNotes = parseGwcNotes(managerFit?.notes || null);

  const items = [
    { key: 'gets_it', label: 'Gets It', desc: 'Understands the role, responsibilities, and what success looks like' },
    { key: 'wants_it', label: 'Wants It', desc: 'Passionate about the work, motivated, and engaged' },
    { key: 'capacity', label: 'Capacity', desc: 'Has the time, capability, and resources to succeed' },
  ];

  const yesNo = (val: boolean | null) =>
    val === true
      ? '<span style="color:#16a34a;font-weight:600">✓ Yes</span>'
      : val === false
      ? '<span style="color:#dc2626;font-weight:600">✗ No</span>'
      : '<em style="color:#999">—</em>';

  let html = `<div class="section">
    <h2>GWC (Get it, Want it, Capacity)</h2>
    <table class="data-table"><thead><tr>
      <th>Criterion</th><th>Reviewee</th><th>Manager</th><th>Reviewee Notes</th><th>Manager Notes</th>
    </tr></thead><tbody>`;

  items.forEach(item => {
    const rVal = revieweeFit?.[item.key as keyof QCFit] as boolean | null;
    const mVal = managerFit?.[item.key as keyof QCFit] as boolean | null;
    const rNotes = revieweeNotes[item.key] || '';
    const mNotes = managerNotes[item.key] || '';

    html += `<tr>
      <td><strong>${item.label}</strong><br/><small style="color:#666">${item.desc}</small></td>
      <td>${yesNo(rVal)}</td>
      <td>${yesNo(mVal)}</td>
      <td>${rNotes ? escapeHtml(rNotes) : '<em style="color:#999">—</em>'}</td>
      <td>${mNotes ? escapeHtml(mNotes) : '<em style="color:#999">—</em>'}</td>
    </tr>`;
  });

  html += `</tbody></table>`;

  // General notes
  if (revieweeNotes.general || managerNotes.general) {
    html += `<div style="margin-top:12px">
      <strong>General GWC Notes</strong>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px">
        <div><em style="font-size:11px;color:#666">Reviewee:</em><p style="white-space:pre-wrap;margin:4px 0">${revieweeNotes.general ? escapeHtml(revieweeNotes.general) : '—'}</p></div>
        <div><em style="font-size:11px;color:#666">Manager:</em><p style="white-space:pre-wrap;margin:4px 0">${managerNotes.general ? escapeHtml(managerNotes.general) : '—'}</p></div>
      </div>
    </div>`;
  }

  html += `</div>`;
  return html;
}

export function exportQCPdf(data: QCPdfExportData) {
  const {
    revieweeName, managerNames, scheduledAt, templateName,
    quarterStart, quarterEnd, sections, answers, fit, signoffs, summaryText, coreValues
  } = data;

  const quarterLabel = `${format(new Date(quarterStart), 'MMM yyyy')} – ${format(new Date(quarterEnd), 'MMM yyyy')}`;
  const scheduledLabel = scheduledAt ? format(new Date(scheduledAt), 'PPP') : 'Not scheduled';
  const managerSigned = signoffs.some(s => s.role === 'manager');
  const revieweeSigned = signoffs.some(s => s.role === 'reviewee');

  // Build sections HTML
  let sectionsHtml = '';
  for (const section of sections) {
    if (section.key === 'gwc') {
      sectionsHtml += renderGwcHtml(fit);
    } else {
      sectionsHtml += renderSectionHtml(section, answers, section.key === 'core_values' ? coreValues : undefined);
    }
  }

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Quarterly Conversation Report – ${escapeHtml(revieweeName)}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
      .section { break-inside: avoid; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: #1a1a1a;
      padding: 32px;
      max-width: 1000px;
      margin: 0 auto;
    }
    h1 { font-size: 22px; margin: 0 0 4px; color: #4c1d95; }
    .subtitle { font-size: 13px; color: #7c3aed; margin-bottom: 24px; }
    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 32px;
      padding: 16px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .details-grid .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 600; margin-bottom: 2px; }
    .details-grid .value { font-size: 13px; font-weight: 500; }
    .section { margin-bottom: 28px; page-break-inside: avoid; }
    .section h2 {
      font-size: 16px;
      color: #4c1d95;
      border-bottom: 2px solid #ede9fe;
      padding-bottom: 6px;
      margin: 0 0 12px;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 8px;
    }
    .data-table th {
      background: #f3f0ff;
      text-align: left;
      padding: 8px 10px;
      font-weight: 600;
      color: #4c1d95;
      border-bottom: 2px solid #ddd6fe;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .data-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }
    .data-table tr:nth-child(even) td { background: #fafafa; }
    .summary-box {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .summary-box h2 { margin-top: 0; }
    .signoff-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 12px;
    }
    .signoff-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .signoff-card .icon { font-size: 20px; }
    .signoff-card .role { font-weight: 600; font-size: 13px; }
    .signoff-card .status { font-size: 12px; color: #6b7280; }
    .signed { border-color: #bbf7d0; background: #f0fdf4; }
    .print-btn {
      display: block;
      margin: 20px auto;
      padding: 10px 32px;
      background: #7c3aed;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    .print-btn:hover { background: #6d28d9; }
    .completed-banner {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .completed-banner .icon { font-size: 20px; color: #16a34a; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨 Print / Save as PDF</button>

  <h1>Quarterly Conversation</h1>
  <div class="subtitle">${escapeHtml(quarterLabel)}</div>

  <div class="details-grid">
    <div><div class="label">Reviewee</div><div class="value">${escapeHtml(revieweeName)}</div></div>
    <div><div class="label">Manager${managerNames.length > 1 ? 's' : ''}</div><div class="value">${managerNames.map(n => escapeHtml(n)).join(', ')}</div></div>
    <div><div class="label">Scheduled</div><div class="value">${escapeHtml(scheduledLabel)}</div></div>
    <div><div class="label">Template</div><div class="value">${escapeHtml(templateName)}</div></div>
  </div>

  ${(managerSigned && revieweeSigned) ? `
  <div class="completed-banner">
    <span class="icon">✅</span>
    <div>
      <strong>This conversation is completed and locked</strong><br/>
      <span style="font-size:12px;color:#666">Both parties have signed off. Content cannot be edited.</span>
    </div>
  </div>` : ''}

  ${sectionsHtml}

  <div class="summary-box">
    <h2>Summary & Sign-off</h2>
    <h3 style="margin:0 0 4px;font-size:14px">Conversation Summary</h3>
    <p style="white-space:pre-wrap;margin:0 0 16px;min-height:40px">${summaryText ? escapeHtml(summaryText) : '<em style="color:#999">No summary provided</em>'}</p>

    <strong>Sign-off Status</strong>
    <div class="signoff-grid">
      <div class="signoff-card ${managerSigned ? 'signed' : ''}">
        <span class="icon">${managerSigned ? '✅' : '⬜'}</span>
        <div>
          <div class="role">Manager</div>
          <div class="status">${managerSigned ? 'Signed' : 'Pending'}</div>
        </div>
      </div>
      <div class="signoff-card ${revieweeSigned ? 'signed' : ''}">
        <span class="icon">${revieweeSigned ? '✅' : '⬜'}</span>
        <div>
          <div class="role">Team Member</div>
          <div class="status">${revieweeSigned ? 'Signed' : 'Pending'}</div>
        </div>
      </div>
    </div>
  </div>

  <p style="text-align:center;font-size:11px;color:#999;margin-top:32px">
    Generated ${format(new Date(), 'PPP')} • Quarterly Conversation Report
  </p>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(fullHtml);
    printWindow.document.close();
  }
}
