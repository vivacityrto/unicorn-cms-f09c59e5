import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emitPublishEvents } from "../_shared/emit-timeline-event.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ActionItem {
  action: string;
  owner: string;
  due_date: string;
  status?: string;
}

interface MinutesContent {
  meeting_title: string;
  meeting_date: string;
  meeting_time: string;
  meeting_type: string;
  duration_minutes: number;
  facilitator: string;
  minute_taker: string;
  attendees: string[];
  apologies: string[];
  agenda_items: string[];
  discussion_notes: string;
  decisions: string[];
  actions: ActionItem[];
  next_meeting: string;
}

function escapeHtml(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sectionOrPlaceholder(items: string[] | undefined, placeholder = 'Not discussed'): string {
  if (!items || items.length === 0) return `<p style="font-size:13px;color:#9ca3af;font-style:italic;">${placeholder}</p>`;
  return `<ul style="padding-left:20px;margin:4px 0;">${items.map(i => `<li style="font-size:13px;margin-bottom:3px;">${escapeHtml(i)}</li>`).join('')}</ul>`;
}

function generateBrandedHtml(content: MinutesContent, tenantName: string, publisherName: string): string {
  const actionsTable = content.actions?.length > 0
    ? `<table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <thead>
          <tr style="background:#5b2d8e;color:#fff;">
            <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;">Action</th>
            <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;width:130px;">Owner</th>
            <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;width:100px;">Due Date</th>
            <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;width:90px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${content.actions.map((a, i) => `
            <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#fff'};">
              <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">${escapeHtml(a.action)}</td>
              <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">${escapeHtml(a.owner)}</td>
              <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">${escapeHtml(a.due_date)}</td>
              <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">${escapeHtml(a.status || 'Open')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    : `<p style="font-size:13px;color:#9ca3af;font-style:italic;">No action items recorded</p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 0; }
    body {
      font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
      margin: 0; padding: 0; color: #1f2937; line-height: 1.5;
    }
    .header {
      background: linear-gradient(135deg, #5b2d8e 0%, #7c3aed 50%, #06b6d4 100%);
      padding: 24px 40px 18px;
      color: #fff;
      position: relative;
    }
    .header-top {
      display: flex; justify-content: space-between; align-items: flex-start;
    }
    .header-contact {
      font-size: 11px; line-height: 1.6; opacity: 0.9;
    }
    .header-brand {
      text-align: right;
    }
    .header-brand .brand-name {
      font-size: 28px; font-weight: 700; letter-spacing: -0.5px;
    }
    .header-brand .brand-tagline {
      font-size: 11px; opacity: 0.85; margin-top: 2px;
    }
    .header-brand .brand-sub {
      font-size: 10px; font-weight: 600; letter-spacing: 0.1em; margin-top: 4px;
      color: #f472b6;
    }
    .accent-bar {
      height: 4px;
      background: linear-gradient(90deg, #f472b6, #06b6d4);
    }
    .content { padding: 30px 40px 20px; }
    .doc-title {
      font-size: 20px; font-weight: 700; color: #5b2d8e;
      margin-bottom: 4px; border-bottom: 2px solid #5b2d8e;
      padding-bottom: 8px;
    }
    .meta-grid {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 6px 20px; margin: 12px 0 20px;
      font-size: 12px;
    }
    .meta-label { color: #6b7280; font-weight: 600; }
    .meta-value { color: #1f2937; }
    .section-title {
      font-size: 13px; font-weight: 700; color: #5b2d8e;
      text-transform: uppercase; letter-spacing: 0.06em;
      border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;
      margin-top: 22px; margin-bottom: 8px;
    }
    .notes-block {
      font-size: 13px; white-space: pre-wrap;
      background: #f9fafb; padding: 12px; border-radius: 4px;
      border-left: 3px solid #5b2d8e;
    }
    .footer {
      margin-top: 40px; padding: 16px 40px;
      border-top: 2px solid #5b2d8e;
      font-size: 10px; color: #9ca3af;
      display: flex; justify-content: space-between; align-items: center;
    }
    .footer-brand { font-weight: 600; color: #5b2d8e; }
    .footer-tagline {
      font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <div class="header-contact">
        1300 729 455<br>
        vivacity.com.au<br>
        ABN 40 140 059 016<br>
        hello@vivacity.com.au
      </div>
      <div class="header-brand">
        <div class="brand-name">vivacity</div>
        <div class="brand-tagline">above+beyond</div>
        <div class="brand-sub">RTO + CRICOS SUPERHERO</div>
      </div>
    </div>
  </div>
  <div class="accent-bar"></div>

  <div class="content">
    <div class="doc-title">MEETING MINUTES</div>

    <div class="meta-grid">
      <div><span class="meta-label">Client:</span> <span class="meta-value">${escapeHtml(tenantName)}</span></div>
      <div><span class="meta-label">Date:</span> <span class="meta-value">${escapeHtml(content.meeting_date || '')}${content.meeting_time ? ' at ' + escapeHtml(content.meeting_time) : ''}</span></div>
      <div><span class="meta-label">Meeting:</span> <span class="meta-value">${escapeHtml(content.meeting_title || '')}</span></div>
      <div><span class="meta-label">Duration:</span> <span class="meta-value">${content.duration_minutes > 0 ? content.duration_minutes + ' minutes' : '—'}</span></div>
      ${content.meeting_type ? `<div><span class="meta-label">Type:</span> <span class="meta-value">${escapeHtml(content.meeting_type)}</span></div>` : ''}
      ${content.facilitator ? `<div><span class="meta-label">Facilitator:</span> <span class="meta-value">${escapeHtml(content.facilitator)}</span></div>` : ''}
      ${content.minute_taker ? `<div><span class="meta-label">Minute Taker:</span> <span class="meta-value">${escapeHtml(content.minute_taker)}</span></div>` : ''}
    </div>

    <div class="section-title">Attendees</div>
    ${content.attendees?.length > 0
      ? `<p style="font-size:13px;">${content.attendees.map(escapeHtml).join(', ')}</p>`
      : `<p style="font-size:13px;color:#9ca3af;font-style:italic;">No attendees recorded</p>`}

    ${content.apologies?.length > 0 ? `
      <div class="section-title">Apologies</div>
      <p style="font-size:13px;">${content.apologies.map(escapeHtml).join(', ')}</p>
    ` : ''}

    <div class="section-title">Agenda</div>
    ${sectionOrPlaceholder(content.agenda_items)}

    <div class="section-title">Discussion Notes</div>
    ${content.discussion_notes?.trim()
      ? `<div class="notes-block">${escapeHtml(content.discussion_notes)}</div>`
      : `<p style="font-size:13px;color:#9ca3af;font-style:italic;">Not discussed</p>`}

    <div class="section-title">Decisions</div>
    ${sectionOrPlaceholder(content.decisions)}

    <div class="section-title">Action Items</div>
    ${actionsTable}

    ${content.next_meeting ? `
      <div class="section-title">Next Meeting</div>
      <p style="font-size:13px;">${escapeHtml(content.next_meeting)}</p>
    ` : ''}
  </div>

  <div class="footer">
    <div>
      <span class="footer-brand">Vivacity Coaching & Consulting</span>
      <span style="margin-left:8px;" class="footer-tagline">Empowering RTOs for Excellence</span>
    </div>
    <div>
      Generated by ${escapeHtml(publisherName)} · ${new Date().toISOString().split('T')[0]}
    </div>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const minutesId: string = body?.minutes_id;

    if (!minutesId) {
      return new Response(
        JSON.stringify({ error: 'minutes_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify Vivacity team
    const { data: userRecord } = await supabaseAdmin
      .from('users')
      .select('is_vivacity_internal, first_name, last_name')
      .eq('user_uuid', user.id)
      .single();

    if (!userRecord?.is_vivacity_internal) {
      return new Response(
        JSON.stringify({ error: 'Only Vivacity team can publish minutes' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the minutes record
    const { data: minutes, error: minutesError } = await supabaseAdmin
      .from('meeting_minutes')
      .select('*')
      .eq('id', minutesId)
      .single();

    if (minutesError || !minutes) {
      return new Response(
        JSON.stringify({ error: 'Minutes not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const content = minutes.content as MinutesContent;
    const isRegenerate = minutes.status === 'published';

    // Validate minimum fields
    if (!content.attendees?.length || (!content.decisions?.length && !content.actions?.length && !content.discussion_notes)) {
      return new Response(
        JSON.stringify({ error: 'Minutes must have attendees and at least one of: decisions, actions, or discussion notes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get tenant name
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('name')
      .eq('id', minutes.tenant_id)
      .single();

    const tenantName = tenant?.name || 'Client';
    const publisherName = [userRecord.first_name, userRecord.last_name].filter(Boolean).join(' ') || 'Vivacity Team';

    // Generate branded HTML
    const htmlContent = generateBrandedHtml(content, tenantName, publisherName);

    // Determine version
    const newVersion = isRegenerate ? (minutes.version || 1) + 1 : (minutes.version || 1);

    // Store HTML in storage
    const fileName = `${minutes.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-')}-v${newVersion}.html`;
    const storagePath = `meeting-minutes/${minutes.tenant_id}/${minutes.meeting_id}/${fileName}`;

    const { error: storageError } = await supabaseAdmin.storage
      .from('documents')
      .upload(storagePath, new TextEncoder().encode(htmlContent), {
        contentType: 'text/html',
        upsert: true,
      });

    if (storageError) {
      console.error('[publish-minutes] Storage upload failed:', storageError);
    }

    // Create or update portal document
    const portalDocData = {
      tenant_id: minutes.tenant_id,
      file_name: fileName,
      file_type: 'text/html',
      file_size: new TextEncoder().encode(htmlContent).length,
      description: `Meeting minutes published by ${publisherName}`,
      uploaded_by: user.id,
      direction: 'outbound',
      is_client_visible: true,
      storage_path: storageError ? null : storagePath,
    };

    let portalDocId: string;

    if (isRegenerate && minutes.pdf_document_id) {
      // Update existing portal doc
      await supabaseAdmin
        .from('portal_documents')
        .update({
          ...portalDocData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', minutes.pdf_document_id);
      portalDocId = minutes.pdf_document_id;
    } else {
      // Create new portal doc
      const { data: portalDoc, error: portalError } = await supabaseAdmin
        .from('portal_documents')
        .insert(portalDocData)
        .select('id')
        .single();

      if (portalError) {
        console.error('[publish-minutes] Portal doc creation failed:', portalError);
        return new Response(
          JSON.stringify({ error: 'Failed to create portal document' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      portalDocId = portalDoc.id;
    }

    // Update minutes record
    const now = new Date().toISOString();
    await supabaseAdmin.from('meeting_minutes').update({
      status: 'published',
      version: newVersion,
      published_at: now,
      published_by: user.id,
      pdf_document_id: portalDocId,
      pdf_storage_path: storageError ? null : storagePath,
      updated_at: now,
    }).eq('id', minutesId);

    // Audit log
    const auditAction = isRegenerate ? 'meeting_minutes_regenerated' : 'meeting_minutes_published';
    await supabaseAdmin.from('audit_events').insert({
      entity: 'meeting_minutes',
      entity_id: minutesId,
      action: auditAction,
      user_id: user.id,
      details: {
        meeting_id: minutes.meeting_id,
        portal_document_id: portalDocId,
        tenant_id: minutes.tenant_id,
        title: minutes.title,
        tenant_name: tenantName,
        version: newVersion,
      },
    });

    console.log(`[publish-minutes] ${auditAction}:`, { minutesId, portalDocId, version: newVersion });

    // Emit dual timeline events (internal + client-visible)
    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await emitPublishEvents(
      supabaseService,
      {
        tenant_id: minutes.tenant_id,
        client_id: String(minutes.tenant_id),
        event_type: "minutes_published_pdf",
        title: `Minutes published: ${minutes.title}`,
        body: isRegenerate ? `Regenerated as v${newVersion}` : `Published as v${newVersion}`,
        source: "unicorn",
        entity_type: "meeting_minutes",
        entity_id: minutesId,
        metadata: {
          minutes_id: minutesId,
          meeting_id: minutes.meeting_id,
          version: newVersion,
          regenerated: isRegenerate,
          portal_document_id: portalDocId,
        },
        created_by: user.id,
        dedupe_key: `minutes_pub:${minutesId}:v${newVersion}`,
      },
      `Meeting minutes published: ${minutes.title}`, // client title
      `Version ${newVersion} is now available`, // client body
    );

    return new Response(
      JSON.stringify({
        success: true,
        minutes_id: minutesId,
        portal_document_id: portalDocId,
        version: newVersion,
        regenerated: isRegenerate,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[publish-minutes] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
