import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://deno.land/x/jose@v5.2.2/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADDIN_JWT_SECRET = Deno.env.get('ADDIN_JWT_SECRET') || Deno.env.get('JWT_SECRET') || SUPABASE_SERVICE_ROLE_KEY;

interface CreateTaskRequest {
  external_message_id: string;
  client_id: number;
  title: string;
  assigned_to: string; // user_uuid
  due_at?: string;
  description?: string;
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
    console.error('[addin-email-create-task] Token verification failed:', error);
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

    const body: CreateTaskRequest = await req.json();
    console.log('[addin-email-create-task] Request:', {
      user: tokenPayload.email,
      external_message_id: body.external_message_id?.substring(0, 20) + '...',
      client_id: body.client_id,
      title: body.title,
    });

    // Validate required fields
    if (!body.external_message_id) {
      return errorResponse(400, 'VALIDATION_ERROR', 'external_message_id is required');
    }
    if (!body.client_id) {
      return errorResponse(400, 'VALIDATION_ERROR', 'client_id is required');
    }
    if (!body.title) {
      return errorResponse(400, 'VALIDATION_ERROR', 'title is required');
    }
    if (!body.assigned_to) {
      return errorResponse(400, 'VALIDATION_ERROR', 'assigned_to is required');
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user's tenant_id
    const tenantId = tokenPayload.tenant_id;
    if (!tenantId) {
      return errorResponse(403, 'NO_TENANT', 'User is not associated with any tenant');
    }

    // Verify client exists
    const { data: client, error: clientError } = await supabaseAdmin
      .from('tenants')
      .select('id, name')
      .eq('id', body.client_id)
      .single();

    if (clientError || !client) {
      return errorResponse(404, 'CLIENT_NOT_FOUND', 'Client not found', { client_id: body.client_id });
    }

    // Verify assigned user exists
    const { data: assignee, error: assigneeError } = await supabaseAdmin
      .from('users')
      .select('user_uuid, email, first_name, last_name')
      .eq('user_uuid', body.assigned_to)
      .single();

    if (assigneeError || !assignee) {
      return errorResponse(404, 'USER_NOT_FOUND', 'Assigned user not found', { assigned_to: body.assigned_to });
    }

    // Check if email record already exists
    let emailRecordId: string | null = null;
    const { data: existingEmail } = await supabaseAdmin
      .from('email_messages')
      .select('id')
      .eq('user_uuid', tokenPayload.user_uuid)
      .eq('external_message_id', body.external_message_id)
      .single();

    if (existingEmail) {
      emailRecordId = existingEmail.id;
    }

    // Create the task
    const { data: task, error: taskError } = await supabaseAdmin
      .from('tasks')
      .insert({
        title: body.title,
        description: body.description || `Created from email`,
        status: 'open',
        priority: 'medium',
        tenant_id: tenantId,
        client_id: body.client_id,
        assigned_to: body.assigned_to,
        created_by: tokenPayload.user_uuid,
        due_date: body.due_at || null,
        source: 'addin_email',
      })
      .select('id, title, status, priority, assigned_to, due_date, created_at')
      .single();

    if (taskError) {
      console.error('[addin-email-create-task] Task creation error:', taskError);
      return errorResponse(500, 'DATABASE_ERROR', 'Failed to create task', { 
        detail: taskError.message 
      });
    }

    // If we have an email record, link it to the task
    if (emailRecordId) {
      await supabaseAdmin
        .from('email_messages')
        .update({ 
          task_id: task.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', emailRecordId);
    }

    // Log audit event for email linking
    await supabaseAdmin
      .from('email_link_audit')
      .insert({
        email_id: emailRecordId,
        user_id: tokenPayload.user_uuid,
        action: 'task_created_from_email',
        entity_type: 'task',
        entity_id: task.id,
        metadata: {
          task_title: body.title,
          client_id: body.client_id,
          assigned_to: body.assigned_to,
          external_message_id: body.external_message_id,
        },
      })
      .catch(err => console.warn('[addin-email-create-task] Audit log failed:', err));

    console.log('[addin-email-create-task] Task created successfully:', task.id);

    // Return success with deep link
    return new Response(
      JSON.stringify({
        success: true,
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          assigned_to: {
            user_uuid: assignee.user_uuid,
            email: assignee.email,
            first_name: assignee.first_name,
            last_name: assignee.last_name,
          },
          due_date: task.due_date,
          created_at: task.created_at,
        },
        email_record_id: emailRecordId,
        deep_link: `/tasks/${task.id}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[addin-email-create-task] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(500, 'INTERNAL_ERROR', message, {});
  }
});
