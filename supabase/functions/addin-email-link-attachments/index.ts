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

const FUNCTION_NAME = 'addin-email-link-attachments';

interface Attachment {
  file_name: string;
  mime_type?: string;
  file_size?: number;
  source_url?: string;
  provider_item_id?: string;
}

interface LinkAttachmentsRequest {
  external_message_id: string;
  client_id: string;
  package_id?: string;
  evidence_type?: string;
  attachments: Attachment[];
}

function getFileExtension(fileName: string): string | null {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === fileName.length - 1) return null;
  return fileName.substring(lastDot + 1).toLowerCase();
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
      await logFailedAction(FUNCTION_NAME, 'link_attachments', null, authResult.error!.code, authResult.error!.message);
      return errorResponse(authResult.error!.status, authResult.error!.code, authResult.error!.message);
    }
    const tokenPayload = authResult.payload;

    // RBAC: Enforce Vivacity Team role
    const rbacResult = enforceVivacityTeamRole(tokenPayload);
    if (!rbacResult.success) {
      await logFailedAction(FUNCTION_NAME, 'link_attachments', tokenPayload.user_uuid, rbacResult.error!.code, rbacResult.error!.message);
      return errorResponse(rbacResult.error!.status, rbacResult.error!.code, rbacResult.error!.message, rbacResult.error!.details || {});
    }

    const idempotencyKey = req.headers.get('Idempotency-Key');
    const body: LinkAttachmentsRequest = await req.json();
    
    console.log('[addin-email-link-attachments] Request:', {
      user: tokenPayload.email,
      role: tokenPayload.role,
      external_message_id: body.external_message_id?.substring(0, 20) + '...',
      client_id: body.client_id,
      attachments_count: body.attachments?.length || 0,
      idempotency_key: idempotencyKey,
    });

    // Validate required fields
    if (!body.external_message_id) {
      return errorResponse(400, 'VALIDATION_ERROR', 'external_message_id is required');
    }
    if (!body.client_id) {
      return errorResponse(400, 'VALIDATION_ERROR', 'client_id is required');
    }
    if (!body.attachments || body.attachments.length === 0) {
      return errorResponse(400, 'ATTACHMENTS_REQUIRED', 'At least one attachment is required.');
    }

    // Validate each attachment has file_name
    for (let i = 0; i < body.attachments.length; i++) {
      if (!body.attachments[i].file_name) {
        return errorResponse(400, 'VALIDATION_ERROR', `attachments[${i}].file_name is required`);
      }
    }

    // RBAC: Verify user has access to the client
    const clientAccessResult = await verifyClientAccess(tokenPayload.user_uuid, body.client_id, FUNCTION_NAME);
    if (!clientAccessResult.success) {
      await logFailedAction(FUNCTION_NAME, 'link_attachments', tokenPayload.user_uuid, clientAccessResult.error!.code, clientAccessResult.error!.message, { client_id: body.client_id });
      return errorResponse(clientAccessResult.error!.status, clientAccessResult.error!.code, clientAccessResult.error!.message, clientAccessResult.error!.details || {});
    }

    const evidenceType = body.evidence_type || 'record';

    const supabaseAdmin = createAdminClient();

    // Get user's tenant_id
    const tenantId = tokenPayload.tenant_id;
    if (!tenantId) {
      return errorResponse(403, 'NO_TENANT', 'User is not associated with any tenant');
    }

    // Find the email message (must be captured first)
    const { data: emailMessage, error: emailError } = await supabaseAdmin
      .from('email_messages')
      .select('id, subject')
      .eq('external_message_id', body.external_message_id)
      .eq('user_uuid', tokenPayload.user_uuid)
      .maybeSingle();

    if (emailError) {
      console.error('[addin-email-link-attachments] Email lookup error:', emailError);
      return errorResponse(500, 'DATABASE_ERROR', 'Failed to lookup email', { detail: emailError.message });
    }

    if (!emailMessage) {
      return errorResponse(404, 'EMAIL_NOT_FOUND', 'Email not found. Capture the email first.', {});
    }

    const clientId = body.client_id;
    const packageId = body.package_id || null;

    // Prepare document links for insertion
    const documentLinksToInsert = body.attachments.map((attachment) => ({
      tenant_id: tenantId,
      user_uuid: tokenPayload.user_uuid,
      provider: 'outlook_attachment',
      drive_id: 'outlook', // Required field - use 'outlook' as identifier
      item_id: attachment.provider_item_id || `attachment_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      file_name: attachment.file_name,
      file_extension: getFileExtension(attachment.file_name),
      mime_type: attachment.mime_type || null,
      file_size: attachment.file_size || null,
      web_url: attachment.source_url || `#email-attachment:${emailMessage.id}`,
      client_id: clientId,
      package_id: packageId,
      source_type: 'outlook_email',
      source_email_id: emailMessage.id,
      evidence_type: evidenceType,
      notes: `Attached to email: ${emailMessage.subject}`,
    }));

    // Insert document links
    const { data: insertedLinks, error: insertError } = await supabaseAdmin
      .from('document_links')
      .insert(documentLinksToInsert)
      .select('id, file_name, web_url, client_id, package_id, evidence_type');

    if (insertError) {
      console.error('[addin-email-link-attachments] Insert error:', insertError);
      
      // Check for duplicate key violation
      if (insertError.code === '23505') {
        return errorResponse(409, 'ATTACHMENTS_ALREADY_LINKED', 'Some attachments are already linked', {
          detail: insertError.message,
        });
      }
      
      return errorResponse(500, 'DATABASE_ERROR', 'Failed to create document links', { detail: insertError.message });
    }

    // Log audit event
    const { data: auditEvent, error: auditError } = await supabaseAdmin
      .from('audit_events')
      .insert({
        action: 'document_linked_from_email',
        entity: 'document_links',
        entity_id: emailMessage.id,
        user_id: tokenPayload.user_uuid,
        details: {
          email_id: emailMessage.id,
          email_subject: emailMessage.subject,
          client_id: clientId,
          package_id: packageId,
          attachments_count: insertedLinks?.length || 0,
          file_names: body.attachments.map(a => a.file_name),
          idempotency_key: idempotencyKey,
        },
      })
      .select('id')
      .single();

    if (auditError) {
      console.warn('[addin-email-link-attachments] Audit log failed:', auditError);
    }

    console.log('[addin-email-link-attachments] Document links created:', insertedLinks?.length || 0);

    // Build response matching API contract
    const linked = insertedLinks?.map(link => ({
      document_link_id: link.id,
      file_name: link.file_name,
      web_url: link.web_url,
      client_id: link.client_id,
      package_id: link.package_id,
      evidence_type: link.evidence_type,
    })) || [];

    return new Response(
      JSON.stringify({
        linked,
        skipped: [],
        audit_event_id: auditEvent?.id || null,
        links: {
          open_client_documents: `/clients/${clientId}?tab=documents`,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[addin-email-link-attachments] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(500, 'INTERNAL_ERROR', message, {});
  }
});
