import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://deno.land/x/jose@v5.2.2/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADDIN_JWT_SECRET = Deno.env.get('ADDIN_JWT_SECRET') || Deno.env.get('JWT_SECRET') || SUPABASE_SERVICE_ROLE_KEY;

interface Attachment {
  file_name: string;
  mime_type?: string;
  size?: number;
  source_url?: string;
  provider_item_id?: string;
}

interface LinkAttachmentsRequest {
  external_message_id: string;
  client_id: string;
  package_id?: string;
  attachments: Attachment[];
}

interface AddinTokenPayload {
  user_uuid: string;
  email: string;
  role: string;
  tenant_id: number | null;
  purpose: string;
}

function errorResponse(status: number, code: string, message: string, details: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({ error: { code, message, details } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function verifyAddinToken(authHeader: string | null): Promise<AddinTokenPayload | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const secret = new TextEncoder().encode(ADDIN_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'unicorn-addin',
    });
    
    if (payload.purpose !== 'addin') {
      return null;
    }
    
    return payload as unknown as AddinTokenPayload;
  } catch (error) {
    console.error('[addin-email-link-attachments] Token verification failed:', error);
    return null;
  }
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
    const tokenPayload = await verifyAddinToken(req.headers.get('Authorization'));
    if (!tokenPayload) {
      return errorResponse(401, 'UNAUTHORIZED', 'Invalid or missing add-in token');
    }

    const idempotencyKey = req.headers.get('Idempotency-Key');
    const body: LinkAttachmentsRequest = await req.json();
    
    console.log('[addin-email-link-attachments] Request:', {
      user: tokenPayload.email,
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
      return errorResponse(400, 'VALIDATION_ERROR', 'attachments array is required and must not be empty');
    }

    // Validate each attachment has file_name
    for (let i = 0; i < body.attachments.length; i++) {
      if (!body.attachments[i].file_name) {
        return errorResponse(400, 'VALIDATION_ERROR', `attachments[${i}].file_name is required`);
      }
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    const clientId = parseInt(body.client_id, 10);
    const packageId = body.package_id ? parseInt(body.package_id, 10) : null;

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
      file_size: attachment.size || null,
      web_url: attachment.source_url || `#email-attachment:${emailMessage.id}`,
      client_id: clientId,
      package_id: packageId,
      source_type: 'outlook_email',
      source_email_id: emailMessage.id,
      notes: `Attached to email: ${emailMessage.subject}`,
    }));

    // Insert document links
    const { data: insertedLinks, error: insertError } = await supabaseAdmin
      .from('document_links')
      .insert(documentLinksToInsert)
      .select('id, file_name, file_extension, mime_type, file_size, web_url');

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

    // Build response
    const links: Record<string, string> = {
      open_client_documents: `/clients/${clientId}?tab=documents`,
    };

    return new Response(
      JSON.stringify({
        document_links: insertedLinks?.map(link => ({
          id: link.id,
          file_name: link.file_name,
          file_extension: link.file_extension,
          mime_type: link.mime_type,
          size_bytes: link.file_size,
          web_url: link.web_url,
        })) || [],
        email: {
          id: emailMessage.id,
          subject: emailMessage.subject,
        },
        attachments_linked: insertedLinks?.length || 0,
        audit_event_id: auditEvent?.id || null,
        links,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[addin-email-link-attachments] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(500, 'INTERNAL_ERROR', message, {});
  }
});
