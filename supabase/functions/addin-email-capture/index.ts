import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  corsHeaders, 
  errorResponse, 
  verifyAddinToken, 
  enforceVivacityTeamRole,
  verifyClientAccess,
  createAdminClient,
  logFailedAction,
  type AddinTokenPayload 
} from "../_shared/addin-auth.ts";
import {
  getUserGraphToken,
  fetchEmailFromGraph,
  type GraphEmailDetails,
} from "../_shared/graph-client.ts";

const FUNCTION_NAME = 'addin-email-capture';

interface CaptureRequest {
  provider: string;
  external_message_id: string;
  subject: string;
  sender: {
    email: string;
    name?: string;
  };
  received_at: string;
  body_preview?: string;
  has_attachments?: boolean;
  link: {
    client_id: string;
    package_id?: string | null;
    task_id?: string | null;
  };
  // Optional: request Graph enrichment
  enrich_via_graph?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }

  try {
    // Verify add-in JWT token
    const authResult = await verifyAddinToken(req.headers.get('Authorization'), FUNCTION_NAME);
    if (!authResult.success || !authResult.payload) {
      await logFailedAction(FUNCTION_NAME, 'email_capture', null, authResult.error!.code, authResult.error!.message);
      return errorResponse(authResult.error!.status, authResult.error!.code, authResult.error!.message);
    }
    const tokenPayload = authResult.payload;

    // RBAC: Enforce Vivacity Team role
    const rbacResult = enforceVivacityTeamRole(tokenPayload);
    if (!rbacResult.success) {
      await logFailedAction(FUNCTION_NAME, 'email_capture', tokenPayload.user_uuid, rbacResult.error!.code, rbacResult.error!.message);
      return errorResponse(rbacResult.error!.status, rbacResult.error!.code, rbacResult.error!.message, rbacResult.error!.details || {});
    }

    const idempotencyKey = req.headers.get('Idempotency-Key');
    const body: CaptureRequest = await req.json();
    
    console.log('[addin-email-capture] Request:', {
      user: tokenPayload.email,
      role: tokenPayload.role,
      external_message_id: body.external_message_id?.substring(0, 20) + '...',
      client_id: body.link?.client_id,
      enrich_via_graph: body.enrich_via_graph ?? false,
      idempotency_key: idempotencyKey,
    });

    // Validate required fields
    if (!body.external_message_id) {
      return errorResponse(400, 'VALIDATION_ERROR', 'external_message_id is required');
    }
    if (!body.link?.client_id) {
      return errorResponse(400, 'VALIDATION_ERROR', 'link.client_id is required');
    }
    if (!body.subject) {
      return errorResponse(400, 'VALIDATION_ERROR', 'subject is required');
    }
    if (!body.sender?.email) {
      return errorResponse(400, 'VALIDATION_ERROR', 'sender.email is required');
    }
    if (!body.received_at) {
      return errorResponse(400, 'VALIDATION_ERROR', 'received_at is required');
    }

    // RBAC: Verify user has access to the client
    const clientAccessResult = await verifyClientAccess(tokenPayload.user_uuid, body.link.client_id, FUNCTION_NAME);
    if (!clientAccessResult.success) {
      await logFailedAction(FUNCTION_NAME, 'email_capture', tokenPayload.user_uuid, clientAccessResult.error!.code, clientAccessResult.error!.message, { client_id: body.link.client_id });
      return errorResponse(clientAccessResult.error!.status, clientAccessResult.error!.code, clientAccessResult.error!.message, clientAccessResult.error!.details || {});
    }

    const supabaseAdmin = createAdminClient();

    // Get user's tenant_id
    const tenantId = tokenPayload.tenant_id;
    if (!tenantId) {
      return errorResponse(403, 'NO_TENANT', 'User is not associated with any tenant');
    }

    // Check if email already exists with a different owner
    const { data: existingEmail, error: checkError } = await supabaseAdmin
      .from('email_messages')
      .select('id, user_uuid')
      .eq('external_message_id', body.external_message_id)
      .maybeSingle();

    if (checkError) {
      console.error('[addin-email-capture] Check error:', checkError);
      return errorResponse(500, 'DATABASE_ERROR', 'Failed to check existing email', { detail: checkError.message });
    }

    if (existingEmail && existingEmail.user_uuid !== tokenPayload.user_uuid) {
      return errorResponse(409, 'EMAIL_ALREADY_LINKED_BY_ANOTHER_USER', 'This email has already been captured by another user.', {});
    }

    // Verify client exists
    const { data: client, error: clientError } = await supabaseAdmin
      .from('tenants')
      .select('id, name')
      .eq('id', body.link.client_id)
      .single();

    if (clientError || !client) {
      return errorResponse(404, 'CLIENT_NOT_FOUND', 'Client not found', { client_id: body.link.client_id });
    }

    // Determine if this is an insert or update
    const isUpdate = !!existingEmail;

    // ========== GRAPH ENRICHMENT (Phase 8.1) ==========
    let graphEnrichment: GraphEmailDetails | null = null;
    let graphEnriched = false;

    if (body.enrich_via_graph !== false) {
      // Attempt Graph enrichment when token exists
      const graphToken = await getUserGraphToken(tokenPayload.user_uuid);
      
      if (graphToken) {
        console.log('[addin-email-capture] Attempting Graph enrichment...');
        graphEnrichment = await fetchEmailFromGraph(graphToken.access_token, body.external_message_id);
        
        if (graphEnrichment) {
          graphEnriched = true;
          console.log('[addin-email-capture] Graph enrichment successful');
        } else {
          console.log('[addin-email-capture] Graph enrichment failed, falling back to metadata');
        }
      } else {
        console.log('[addin-email-capture] No Graph token available, using metadata only');
      }
    }

    // Build email data, enriching with Graph data when available
    const emailData = {
      user_uuid: tokenPayload.user_uuid,
      tenant_id: tenantId,
      provider: body.provider || 'microsoft',
      external_message_id: body.external_message_id,
      subject: body.subject,
      sender_email: body.sender.email,
      sender_name: body.sender.name || null,
      received_at: graphEnrichment?.receivedDateTime || body.received_at,
      body_preview: graphEnrichment?.bodyPreview || body.body_preview || null,
      body_content: graphEnrichment?.body?.content || null,
      body_content_type: graphEnrichment?.body?.contentType || null,
      has_attachments: graphEnrichment?.hasAttachments ?? body.has_attachments ?? false,
      client_id: parseInt(body.link.client_id, 10),
      package_id: body.link.package_id ? parseInt(body.link.package_id, 10) : null,
      task_id: body.link.task_id || null,
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Graph-enriched fields
      importance: graphEnrichment?.importance || null,
      is_read: graphEnrichment?.isRead ?? null,
      web_link: graphEnrichment?.webLink || null,
      categories: graphEnrichment?.categories || null,
      graph_enriched: graphEnriched,
      graph_enriched_at: graphEnriched ? new Date().toISOString() : null,
    };

    const { data: emailRecord, error: insertError } = await supabaseAdmin
      .from('email_messages')
      .upsert(emailData, {
        onConflict: 'user_uuid,external_message_id',
        ignoreDuplicates: false,
      })
      .select('id, external_message_id, subject, sender_email, sender_name, received_at, has_attachments, client_id, package_id, task_id, body_preview, web_link, graph_enriched')
      .single();

    if (insertError) {
      console.error('[addin-email-capture] Insert error:', insertError);
      return errorResponse(500, 'DATABASE_ERROR', 'Failed to save email record', { 
        detail: insertError.message 
      });
    }

    // If Graph returned attachments, store them
    if (graphEnriched && graphEnrichment?.attachments && graphEnrichment.attachments.length > 0) {
      const attachmentRecords = graphEnrichment.attachments.map(att => ({
        email_message_id: emailRecord.id,
        provider_attachment_id: att.id,
        file_name: att.name,
        content_type: att.contentType,
        size: att.size,
        is_inline: att.isInline ?? false,
      }));

      const { error: attError } = await supabaseAdmin
        .from('email_attachments')
        .upsert(attachmentRecords, {
          onConflict: 'email_message_id,provider_attachment_id',
          ignoreDuplicates: false,
        });

      if (attError) {
        console.warn('[addin-email-capture] Failed to store attachments:', attError);
      } else {
        console.log(`[addin-email-capture] Stored ${attachmentRecords.length} attachments`);
      }
    }

    // Log audit event
    const { data: auditEvent, error: auditError } = await supabaseAdmin
      .from('email_link_audit')
      .insert({
        email_id: emailRecord.id,
        user_id: tokenPayload.user_uuid,
        action: 'email_linked',
        entity_type: 'client',
        entity_id: body.link.client_id,
        metadata: {
          package_id: body.link.package_id || null,
          task_id: body.link.task_id || null,
          subject: body.subject,
          idempotency_key: idempotencyKey,
          graph_enriched: graphEnriched,
        },
      })
      .select('id')
      .single();

    if (auditError) {
      console.warn('[addin-email-capture] Audit log failed:', auditError);
    }

    console.log('[addin-email-capture] Email captured successfully:', emailRecord.id, { graph_enriched: graphEnriched });

    // Return success with new format
    return new Response(
      JSON.stringify({
        email_record: {
          id: emailRecord.id,
          external_message_id: emailRecord.external_message_id,
          subject: emailRecord.subject,
          sender_email: emailRecord.sender_email,
          sender_name: emailRecord.sender_name,
          received_at: emailRecord.received_at,
          has_attachments: emailRecord.has_attachments,
          client_id: emailRecord.client_id,
          package_id: emailRecord.package_id,
          task_id: emailRecord.task_id,
          body_preview: emailRecord.body_preview,
          web_link: emailRecord.web_link,
        },
        status: isUpdate ? 'updated' : 'upserted',
        graph_enriched: graphEnriched,
        audit_event_id: auditEvent?.id || null,
        links: {
          open_in_unicorn: `/clients/${body.link.client_id}?tab=emails`,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[addin-email-capture] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(500, 'INTERNAL_ERROR', message, {});
  }
});
