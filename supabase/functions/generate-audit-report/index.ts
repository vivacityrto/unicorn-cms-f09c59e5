import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { audit_id } = body;

    if (!audit_id) {
      return new Response(JSON.stringify({ error: 'audit_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Generating audit report PDF for audit ${audit_id}`);

    // Verify user access
    const { data: userRecord } = await supabase
      .from('users')
      .select('tenant_id, global_role, is_vivacity_internal')
      .eq('user_uuid', user.id)
      .single();

    // Load audit + tenant + template
    const { data: audit, error: auditError } = await supabase
      .from('compliance_audits')
      .select(`
        *,
        tenants:tenant_id ( id, name ),
        compliance_templates:template_id ( name, framework )
      `)
      .eq('id', audit_id)
      .single();

    if (auditError || !audit) {
      return new Response(JSON.stringify({ error: 'Audit not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Access check
    const isInternal = userRecord?.is_vivacity_internal || userRecord?.global_role === 'superadmin' || userRecord?.global_role === 'admin';
    if (!isInternal && userRecord?.tenant_id !== audit.tenant_id) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Load auditor name
    const { data: auditorUser } = audit.auditor_user_id ? await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('user_uuid', audit.auditor_user_id)
      .single() : { data: null };

    const auditorName = auditorUser
      ? `${auditorUser.first_name} ${auditorUser.last_name}`
      : 'Unknown';

    // Load sections with questions and responses
    const { data: sections, error: sectionsError } = await supabase
      .from('compliance_template_sections')
      .select(`
        id, title, sort_order,
        compliance_template_questions (
          id, clause, audit_statement, response_set, sort_order,
          compliance_audit_responses!inner (
            response, score, is_flagged, notes
          )
        )
      `)
      .eq('template_id', audit.template_id)
      .eq('compliance_template_questions.compliance_audit_responses.audit_id', audit_id)
      .order('sort_order');

    if (sectionsError) {
      console.error('Sections error:', sectionsError);
      return new Response(JSON.stringify({ error: 'Failed to load audit data' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Load CAAs
    const { data: caas } = await supabase
      .from('compliance_corrective_actions')
      .select(`
        id, description, responsible_person, due_date, status,
        compliance_audit_responses (
          response,
          compliance_template_questions (
            clause, audit_statement,
            compliance_template_sections ( title, sort_order )
          )
        )
      `)
      .eq('audit_id', audit_id)
      .order('created_at');

    // Generate the PDF
    const pdfBase64 = generateAuditReportPDF({
      audit,
      auditorName,
      sections: sections || [],
      caas: caas || [],
    });

    // Store in Supabase storage
    const fileName = `audit-report-${audit_id}-${Date.now()}.pdf`;
    const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('compliance-evidence')
      .upload(fileName, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    let downloadUrl: string | null = null;
    if (!uploadError && uploadData) {
      const { data: urlData } = await supabase.storage
        .from('compliance-evidence')
        .createSignedUrl(fileName, 3600); // 1 hour expiry
      downloadUrl = urlData?.signedUrl || null;
    }

    return new Response(JSON.stringify({
      pdf: pdfBase64,
      download_url: downloadUrl,
      file_name: fileName,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('generate-audit-report error:', error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─────────────────────────────────────────────────────────────
// PDF GENERATOR
// ─────────────────────────────────────────────────────────────

function esc(text: string): string {
  return (text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ')
    .substring(0, 300);
}

function fmtDate(d: string | null): string {
  if (!d) return 'Not set';
  try {
    return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

function scoreColour(pct: number | null): string {
  if (pct === null) return '0.5 0.5 0.5';
  if (pct >= 80) return '0.09 0.63 0.52'; // teal
  if (pct >= 60) return '0.85 0.55 0.10'; // amber
  return '0.8 0.2 0.2'; // red
}

function responseLabel(r: string | null): string {
  if (!r) return 'Not answered';
  return r;
}

interface AuditData {
  audit: any;
  auditorName: string;
  sections: any[];
  caas: any[];
}

function generateAuditReportPDF({ audit, auditorName, sections, caas }: AuditData): string {
  const pageW = 595;
  const pageH = 842;
  const margin = 50;
  const lh = 14; // line height

  let stream = '';
  let y = pageH - margin;

  const line = (s: string) => { stream += s + '\n'; };

  const text = (x: number, yy: number, font: string, size: number, content: string) => {
    line(`BT /${font} ${size} Tf ${x} ${yy} Td (${esc(content)}) Tj ET`);
  };

  const hRule = (yy: number, r = 0, g = 0, b = 0, w = 0.5) => {
    line(`${r} ${g} ${b} RG ${w} w ${margin} ${yy} m ${pageW - margin} ${yy} l S`);
  };

  const colorRect = (x: number, yy: number, w: number, h: number, r: number, g: number, bb: number) => {
    line(`${r} ${g} ${bb} rg ${x} ${yy} ${w} ${h} re f 0 0 0 rg`);
  };

  // ── COVER HEADER BAND ──────────────────────────────────────
  colorRect(0, pageH - 80, pageW, 80, 0.25, 0.18, 0.47); // Vivacity purple
  line(`1 1 1 rg`); // white text
  text(margin, pageH - 35, 'F1', 16, 'CRICOS Compliance Audit Report');
  text(margin, pageH - 55, 'F2', 10, `Vivacity Coaching & Consulting  |  Unicorn 2.0`);
  line('0 0 0 rg'); // back to black
  y = pageH - 95;

  // ── AUDIT META ─────────────────────────────────────────────
  const tenantName = audit.tenants?.name || 'Unknown Provider';
  const templateName = audit.compliance_templates?.name || 'Unknown Template';
  const auditDate = fmtDate(audit.audit_date);
  const scorePct = audit.score_pct !== null ? `${Number(audit.score_pct).toFixed(1)}%` : 'Incomplete';
  const scoreTotal = audit.score_total ?? '—';
  const scoreMax = audit.score_max ?? '—';

  y -= 10;
  text(margin, y, 'F1', 13, tenantName);
  y -= 18;
  text(margin, y, 'F2', 10, `Template: ${templateName}`);
  y -= 14;
  text(margin, y, 'F2', 10, `Audit date: ${auditDate}   |   Auditor: ${auditorName}   |   Status: ${(audit.status || '').toUpperCase()}`);
  y -= 14;

  // Score badge
  const pctNum = Number(audit.score_pct) || 0;
  const [sr, sg, sb] = scoreColour(pctNum).split(' ').map(Number);
  colorRect(margin, y - 22, 120, 26, sr, sg, sb);
  line('1 1 1 rg');
  text(margin + 6, y - 14, 'F1', 12, `Overall Score: ${scorePct}`);
  line('0 0 0 rg');
  text(margin + 130, y - 14, 'F2', 9, `${scoreTotal} / ${scoreMax} points`);
  y -= 36;

  hRule(y + 5, 0.25, 0.18, 0.47);
  y -= 14;

  // ── SECTION SUMMARY TABLE ──────────────────────────────────
  text(margin, y, 'F1', 11, 'Score by Section');
  y -= 16;

  // Table header
  colorRect(margin, y - 3, pageW - margin * 2, 16, 0.93, 0.93, 0.95);
  text(margin + 2, y + 1, 'F1', 8, 'Section');
  text(360, y + 1, 'F1', 8, 'Compliant');
  text(404, y + 1, 'F1', 8, 'At Risk');
  text(440, y + 1, 'F1', 8, 'Non-Compl.');
  text(490, y + 1, 'F1', 8, 'N/A');
  text(520, y + 1, 'F1', 8, 'Flagged');
  y -= 16;

  for (const section of sections) {
    const questions = section.compliance_template_questions || [];
    let comp = 0, atRisk = 0, nc = 0, na = 0, flagged = 0;
    for (const q of questions) {
      const r = q.compliance_audit_responses?.[0];
      if (!r) continue;
      if (r.response === 'Safe' || r.response === 'Compliant') comp++;
      else if (r.response === 'At Risk') atRisk++;
      else if (r.response === 'Non-Compliant') nc++;
      else if (r.response === 'N/A') na++;
      if (r.is_flagged) flagged++;
    }

    if (y < 80) { y = pageH - margin - 10; } // simple page break protection

    const shortTitle = section.title.replace(/Standard \d+ – /, 'S').replace('Opening Meeting Questions – ', 'Opening: ');
    text(margin + 2, y, 'F2', 8, shortTitle.substring(0, 55));
    text(360, y, 'F2', 8, String(comp));
    text(408, y, 'F2', 8, String(atRisk));
    text(450, y, 'F2', 8, String(nc));
    text(494, y, 'F2', 8, String(na));
    if (flagged > 0) {
      line(`0.8 0.2 0.2 rg`);
      text(524, y, 'F1', 8, String(flagged));
      line('0 0 0 rg');
    } else {
      text(524, y, 'F2', 8, '0');
    }
    hRule(y - 3, 0.88, 0.88, 0.88, 0.3);
    y -= 13;
  }

  y -= 10;
  hRule(y + 5, 0.25, 0.18, 0.47);
  y -= 14;

  // ── FINDINGS BY SECTION ────────────────────────────────────
  text(margin, y, 'F1', 11, 'Detailed Findings');
  y -= 16;

  for (const section of sections) {
    if (y < 120) { y = pageH - margin - 10; }

    // Section heading band
    colorRect(margin, y - 4, pageW - margin * 2, 16, 0.92, 0.90, 0.97);
    text(margin + 4, y + 1, 'F1', 9, section.title);
    y -= 18;

    const questions = (section.compliance_template_questions || [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order);

    for (const q of questions) {
      if (y < 80) { y = pageH - margin - 10; }

      const resp = q.compliance_audit_responses?.[0];
      const response = resp?.response || 'Not answered';
      const isFlagged = resp?.is_flagged || false;

      // Response colour
      let rr = 0.2, rg = 0.2, rb = 0.2;
      if (response === 'Compliant' || response === 'Safe') { rr = 0.09; rg = 0.63; rb = 0.52; }
      else if (response === 'At Risk') { rr = 0.85; rg = 0.55; rb = 0.10; }
      else if (response === 'Non-Compliant') { rr = 0.8; rg = 0.2; rb = 0.2; }

      // Clause + statement
      const clauseLabel = q.clause ? `[${q.clause}] ` : '';
      const statement = (q.audit_statement || '').substring(0, 90);
      text(margin + 4, y, 'F2', 8, `${clauseLabel}${statement}${statement.length === 90 ? '...' : ''}`);

      // Response badge (inline)
      line(`${rr} ${rg} ${rb} rg`);
      text(margin + 4, y - 10, 'F1', 7, responseLabel(response));
      line('0 0 0 rg');

      // Flagged indicator
      if (isFlagged) {
        line('0.8 0.2 0.2 rg');
        text(margin + 80, y - 10, 'F2', 7, '⚑ Corrective action required');
        line('0 0 0 rg');
      }

      y -= 22;
    }
    y -= 6;
  }

  // ── CORRECTIVE ACTIONS ─────────────────────────────────────
  if (caas.length > 0) {
    if (y < 150) { y = pageH - margin - 10; }

    hRule(y + 5, 0.25, 0.18, 0.47);
    y -= 14;
    text(margin, y, 'F1', 11, `Corrective Actions (${caas.length} total)`);
    y -= 16;

    // Table header
    colorRect(margin, y - 3, pageW - margin * 2, 16, 0.93, 0.93, 0.95);
    text(margin + 2, y + 1, 'F1', 8, 'Clause');
    text(margin + 42, y + 1, 'F1', 8, 'Corrective Action');
    text(350, y + 1, 'F1', 8, 'Responsible');
    text(430, y + 1, 'F1', 8, 'Due Date');
    text(490, y + 1, 'F1', 8, 'Status');
    y -= 16;

    for (const caa of caas) {
      if (y < 60) { y = pageH - margin - 10; }

      const q = caa.compliance_audit_responses?.compliance_template_questions;
      const clause = q?.clause || '—';
      const desc = (caa.description || '').substring(0, 60);
      const resp = (caa.responsible_person || 'TBC').substring(0, 20);
      const due = fmtDate(caa.due_date);
      const status = (caa.status || 'open').toUpperCase();

      // Status colour
      if (status === 'CLOSED') { line('0.09 0.63 0.52 rg'); }
      else if (status === 'IN_PROGRESS') { line('0.85 0.55 0.10 rg'); }
      else { line('0.8 0.2 0.2 rg'); }

      text(margin + 2, y, 'F2', 7, clause);
      line('0 0 0 rg');
      text(margin + 42, y, 'F2', 7, `${desc}${desc.length === 60 ? '...' : ''}`);
      text(350, y, 'F2', 7, resp);
      text(430, y, 'F2', 7, due);

      if (status === 'CLOSED') line('0.09 0.63 0.52 rg');
      else if (status === 'IN_PROGRESS') line('0.85 0.55 0.10 rg');
      else line('0.8 0.2 0.2 rg');
      text(490, y, 'F1', 7, status);
      line('0 0 0 rg');

      hRule(y - 3, 0.88, 0.88, 0.88, 0.3);
      y -= 12;
    }
  }

  // ── FOOTER ─────────────────────────────────────────────────
  const footerY = 30;
  hRule(footerY + 10, 0.25, 0.18, 0.47, 0.5);
  line('0.4 0.4 0.4 rg');
  text(margin, footerY, 'F2', 7, `Generated ${fmtDate(new Date().toISOString())}  |  Unicorn 2.0  |  Vivacity Coaching & Consulting  |  CONFIDENTIAL`);
  line('0 0 0 rg');

  // ── ASSEMBLE PDF ───────────────────────────────────────────
  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`);
  objects.push(`4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`);
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');
  objects.push('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefOffset = pdf.length;
  pdf += 'xref\n';
  pdf += `0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += 'trailer\n';
  pdf += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += 'startxref\n';
  pdf += `${xrefOffset}\n`;
  pdf += '%%EOF\n';

  const encoder = new TextEncoder();
  const bytes = encoder.encode(pdf);
  return btoa(String.fromCharCode(...bytes));
}
