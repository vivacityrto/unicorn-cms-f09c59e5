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
    console.error('[addin-email-capture] Token verification failed:', error);
    return null;
  }
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
    const body: CaptureRequest = await req.json();
    
    console.log('[addin-email-capture] Request:', {
      user: tokenPayload.email,
      external_message_id: body.external_message_id?.substring(0, 20) + '...',
      client_id: body.link?.client_id,
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

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    // Insert/update email record
    const emailData = {
      user_uuid: tokenPayload.user_uuid,
      tenant_id: tenantId,
      provider: body.provider || 'microsoft',
      external_message_id: body.external_message_id,
      subject: body.subject,
      sender_email: body.sender.email,
      sender_name: body.sender.name || null,
      received_at: body.received_at,
      body_preview: body.body_preview || null,
      has_attachments: body.has_attachments || false,
      client_id: parseInt(body.link.client_id, 10),
      package_id: body.link.package_id ? parseInt(body.link.package_id, 10) : null,
      task_id: body.link.task_id || null,
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: emailRecord, error: insertError } = await supabaseAdmin
      .from('email_messages')
      .upsert(emailData, {
        onConflict: 'user_uuid,external_message_id',
        ignoreDuplicates: false,
      })
      .select('id, external_message_id, subject, sender_email, sender_name, received_at, has_attachments, client_id, package_id, task_id')
      .single();

    if (insertError) {
      console.error('[addin-email-capture] Insert error:', insertError);
      return errorResponse(500, 'DATABASE_ERROR', 'Failed to save email record', { 
        detail: insertError.message 
      });
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
        },
      })
      .select('id')
      .single();

    if (auditError) {
      console.warn('[addin-email-capture] Audit log failed:', auditError);
    }

    console.log('[addin-email-capture] Email captured successfully:', emailRecord.id);

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
        },
        status: isUpdate ? 'updated' : 'upserted',
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