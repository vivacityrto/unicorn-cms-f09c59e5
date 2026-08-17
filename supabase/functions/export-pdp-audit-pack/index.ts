import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  tenant_id: number;
  user_id?: string | null; // optional: single staff member. Omit/null = every staff member with PDP activity in this tenant.
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: RequestBody = await req.json();
    const { tenant_id, user_id } = body;

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: 'tenant_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Exporting PDP audit pack for tenant ${tenant_id}${user_id ? `, staff ${user_id}` : ' (all staff)'}`);

    // --- Authorization: tenant primary/secondary contact with full access scope, OR internal Vivacity admin/SuperAdmin ---
    const { data: tuRows } = await supabase
      .from('tenant_users')
      .select('access_scope, relationship_role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant_id);

    const isTenantAdmin = (tuRows || []).some(
      (r: any) => r.access_scope === 'full' && ['primary_contact', 'secondary_contact'].includes(r.relationship_role)
    );

    let isInternal = false;
    if (!isTenantAdmin) {
      const { data: u } = await supabase
        .from('users')
        .select('global_role, is_vivacity_internal')
        .eq('user_uuid', user.id)
        .maybeSingle();
      isInternal = !!u && (['superadmin', 'admin'].includes((u.global_role || '').toLowerCase()) || u.is_vivacity_internal === true);
    }

    if (!isTenantAdmin && !isInternal) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Tenant name ---
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('rto_name, legal_name, name')
      .eq('id', tenant_id)
      .maybeSingle();
    const tenantName = tenantRow?.rto_name || tenantRow?.legal_name || tenantRow?.name || `Tenant ${tenant_id}`;

    // --- Which staff to include ---
    let staffUserIds: string[];
    if (user_id) {
      staffUserIds = [user_id];
    } else {
      const { data: cycleUsers, error: cycleUsersErr } = await supabase
        .from('pdp_cycles')
        .select('user_id')
        .eq('tenant_id', tenant_id);
      if (cycleUsersErr) {
        console.error('cycleUsers error', cycleUsersErr);
      }
      staffUserIds = Array.from(new Set((cycleUsers || []).map((r: any) => r.user_id)));
    }

    // --- Assemble per-staff data ---
    const staffPacks: any[] = [];

    for (const uid of staffUserIds) {
      const { data: userRow } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('user_uuid', uid)
        .maybeSingle();

      const { data: currencyRows } = await supabase
        .from('v_pdp_user_currency')
        .select('audience_code, cycle_year, cycle_end_date, status, percent_complete, actual_pd_hours, target_pd_hours, currency_status')
        .eq('user_id', uid)
        .eq('tenant_id', tenant_id)
        .order('cycle_year', { ascending: false });

      const { data: cycleRows } = await supabase
        .from('pdp_cycles')
        .select('id, audience_code, cycle_year, cycle_start_date, cycle_end_date, target_pd_hours, status, notes')
        .eq('user_id', uid)
        .eq('tenant_id', tenant_id)
        .order('cycle_year', { ascending: false });

      const cycleIds = (cycleRows || []).map((c: any) => c.id);

      let evidenceRows: any[] = [];
      let goalRows: any[] = [];
      let reviewRows: any[] = [];
      if (cycleIds.length > 0) {
        const [{ data: ev }, { data: goals }, { data: reviews }] = await Promise.all([
          supabase
            .from('pdp_evidence_items')
            .select('cycle_id, evidence_type, title, occurred_on, duration_minutes, is_formal, is_industry_currency, status, external_provider')
            .in('cycle_id', cycleIds)
            .order('occurred_on', { ascending: false }),
          supabase
            .from('pdp_goals')
            .select('cycle_id, title, target_hours, priority, status')
            .in('cycle_id', cycleIds),
          supabase
            .from('pdp_reviews')
            .select('cycle_id, review_type, review_date, outcome, signed_off_at')
            .in('cycle_id', cycleIds)
            .order('review_date', { ascending: false }),
        ]);
        evidenceRows = ev || [];
        goalRows = goals || [];
        reviewRows = reviews || [];
      }

      // Audience labels
      const audienceCodes = Array.from(new Set((cycleRows || []).map((c: any) => c.audience_code).filter(Boolean)));
      let audienceLabels: Record<string, string> = {};
      if (audienceCodes.length > 0) {
        const { data: auds } = await supabase.from('pdp_audiences').select('code, label').in('code', audienceCodes);
        (auds || []).forEach((a: any) => (audienceLabels[a.code] = a.label));
      }

      staffPacks.push({
        userId: uid,
        fullName: userRow?.full_name || 'Unknown staff member',
        email: userRow?.email || '',
        currency: currencyRows || [],
        cycles: (cycleRows || []).map((c: any) => ({
          ...c,
          audienceLabel: audienceLabels[c.audience_code] || c.audience_code,
          evidence: evidenceRows.filter((e: any) => e.cycle_id === c.id),
          goals: goalRows.filter((g: any) => g.cycle_id === c.id),
          reviews: reviewRows.filter((r: any) => r.cycle_id === c.id),
        })),
      });
    }

    // Sort staff alphabetically for a predictable pack order
    staffPacks.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

    const { data: generatorUser } = await supabase.from('users').select('full_name').eq('user_uuid', user.id).maybeSingle();
    const generatedBy = generatorUser?.full_name || user.email || 'Unknown';

    const pdfContent = generatePDF({
      tenantName,
      generatedAt: new Date().toISOString(),
      generatedBy,
      staffPacks,
    });

    return new Response(JSON.stringify({ pdf: pdfContent, staff_count: staffPacks.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Export error:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

interface PDFData {
  tenantName: string;
  generatedAt: string;
  generatedBy: string;
  staffPacks: any[];
}

function generatePDF(data: PDFData): string {
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const titleCase = (s?: string | null) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const escapeText = (text: any) => {
    return String(text ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[\r\n]+/g, ' ')
      .substring(0, 220);
  };

  let yPos = 780;
  const margin = 50;
  const pageWidth = 595;
  const lineHeight = 13;

  let stream = '';

  const line = (text: string, font = '/F2', size = 10, indent = 0) => {
    if (yPos < 60) yPos = 780; // simplified pagination, consistent with the export-client-timeline-pdf convention
    stream += `BT ${font} ${size} Tf ${margin + indent} ${yPos} Td (${text}) Tj ET\n`;
    yPos -= lineHeight;
  };

  const rule = () => {
    stream += `${margin} ${yPos + 8} m ${pageWidth - margin} ${yPos + 8} l S\n`;
    yPos -= 8;
  };

  line('Professional Development Plan (PDP) Audit Pack', '/F1', 18);
  yPos -= 6;
  line(`Client: ${escapeText(data.tenantName)}`, '/F1', 13);
  line(`Generated: ${formatDateTime(data.generatedAt)} by ${escapeText(data.generatedBy)}`, '/F2', 10);
  line(`Staff members included: ${data.staffPacks.length}`, '/F2', 10);
  yPos -= 6;
  rule();

  if (data.staffPacks.length === 0) {
    yPos -= 10;
    line('No Academy-derived PDP activity has been recorded for this client yet.', '/F2', 11);
    line('PDP cycles and evidence auto-create the first time a staff member completes an Academy course.', '/F2', 9);
  }

  for (const staff of data.staffPacks) {
    yPos -= 12;
    line(`${escapeText(staff.fullName)}  (${escapeText(staff.email)})`, '/F1', 13);

    if (staff.cycles.length === 0) {
      line('No PDP cycle has opened for this staff member yet.', '/F2', 9, 10);
      continue;
    }

    for (const cycle of staff.cycles) {
      const currency = data.staffPacks
        ? staff.currency.find((c: any) => c.cycle_year === cycle.cycle_year && c.audience_code === cycle.audience_code)
        : null;

      line(
        `${cycle.cycle_year} cycle — ${titleCase(cycle.audienceLabel)} — ${formatDate(cycle.cycle_start_date)} to ${formatDate(cycle.cycle_end_date)} — status: ${titleCase(cycle.status)}`,
        '/F1',
        10,
        10
      );

      if (currency) {
        line(
          `PD hours: ${currency.actual_pd_hours ?? 0} of ${currency.target_pd_hours ?? cycle.target_pd_hours ?? 0} target (${currency.percent_complete ?? 0}% complete) — currency status: ${titleCase(currency.currency_status)}`,
          '/F2',
          9,
          14
        );
      } else {
        line(`Target PD hours: ${cycle.target_pd_hours ?? 0}`, '/F2', 9, 14);
      }

      if (cycle.goals?.length) {
        line(`Goals (${cycle.goals.length}):`, '/F2', 9, 14);
        for (const g of cycle.goals.slice(0, 10)) {
          line(`- ${escapeText(g.title)} (target ${g.target_hours ?? 0}h, ${titleCase(g.status)})`, '/F2', 9, 20);
        }
      }

      if (cycle.evidence?.length) {
        line(`Evidence items (${cycle.evidence.length}):`, '/F2', 9, 14);
        for (const e of cycle.evidence.slice(0, 25)) {
          const hours = e.duration_minutes ? (e.duration_minutes / 60).toFixed(1) : '0.0';
          line(
            `- ${formatDate(e.occurred_on)} | ${titleCase(e.evidence_type)} | ${escapeText(e.title)} | ${hours}h | ${titleCase(e.status)}`,
            '/F2',
            8,
            20
          );
        }
        if (cycle.evidence.length > 25) {
          line(`... and ${cycle.evidence.length - 25} more evidence items`, '/F2', 8, 20);
        }
      } else {
        line('No evidence recorded for this cycle.', '/F2', 9, 14);
      }

      if (cycle.reviews?.length) {
        line(`Reviews (${cycle.reviews.length}):`, '/F2', 9, 14);
        for (const r of cycle.reviews) {
          line(
            `- ${formatDate(r.review_date)} | ${titleCase(r.review_type)} | outcome: ${titleCase(r.outcome)} | signed off: ${r.signed_off_at ? formatDate(r.signed_off_at) : 'not yet'}`,
            '/F2',
            8,
            20
          );
        }
      }

      yPos -= 6;
    }
  }

  if (yPos > 50) {
    yPos = 40;
    line('Unicorn 2.0 - Vivacity Coaching & Consulting - Confidential', '/F2', 8);
  }

  // --- Build minimal PDF structure ---
  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`
  );
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
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64;
}
