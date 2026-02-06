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

const FUNCTION_NAME = 'addin-email-create-task';

interface CreateTaskRequest {
  external_message_id: string;
  client_id: string;
  task: {
    title: string;
    description?: string;
    assigned_to_user_uuid: string;
    due_at?: string;
    priority?: string;
  };
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
      await logFailedAction(FUNCTION_NAME, 'task_create', null, authResult.error!.code, authResult.error!.message);
      return errorResponse(authResult.error!.status, authResult.error!.code, authResult.error!.message);
    }
    const tokenPayload = authResult.payload;

    // RBAC: Enforce Vivacity Team role
    const rbacResult = enforceVivacityTeamRole(tokenPayload);
    if (!rbacResult.success) {
      await logFailedAction(FUNCTION_NAME, 'task_create', tokenPayload.user_uuid, rbacResult.error!.code, rbacResult.error!.message);
      return errorResponse(rbacResult.error!.status, rbacResult.error!.code, rbacResult.error!.message, rbacResult.error!.details || {});
    }

    const idempotencyKey = req.headers.get('Idempotency-Key');
    const body: CreateTaskRequest = await req.json();
    
    console.log('[addin-email-create-task] Request:', {
      user: tokenPayload.email,
      role: tokenPayload.role,
      external_message_id: body.external_message_id?.substring(0, 20) + '...',
      client_id: body.client_id,
      title: body.task?.title,
      idempotency_key: idempotencyKey,
    });

    // Validate required fields
    if (!body.external_message_id) {
      return errorResponse(400, 'VALIDATION_ERROR', 'external_message_id is required');
    }
    if (!body.client_id) {
      return errorResponse(400, 'VALIDATION_ERROR', 'client_id is required');
    }
    if (!body.task?.title) {
      return errorResponse(400, 'VALIDATION_ERROR', 'task.title is required');
    }
    if (!body.task?.assigned_to_user_uuid) {
      return errorResponse(400, 'VALIDATION_ERROR', 'task.assigned_to_user_uuid is required');
    }

    // RBAC: Verify user has access to the client
    const clientAccessResult = await verifyClientAccess(tokenPayload.user_uuid, body.client_id, FUNCTION_NAME);
    if (!clientAccessResult.success) {
      await logFailedAction(FUNCTION_NAME, 'task_create', tokenPayload.user_uuid, clientAccessResult.error!.code, clientAccessResult.error!.message, { client_id: body.client_id });
      return errorResponse(clientAccessResult.error!.status, clientAccessResult.error!.code, clientAccessResult.error!.message, clientAccessResult.error!.details || {});
    }

    const supabaseAdmin = createAdminClient();

    // Get user's tenant_id
    const tenantId = tokenPayload.tenant_id;
    if (!tenantId) {
      return errorResponse(403, 'NO_TENANT', 'User is not associated with any tenant');
    }

    // Check if email record exists (must be captured first)
    const { data: existingEmail, error: emailError } = await supabaseAdmin
      .from('email_messages')
      .select('id, user_uuid, subject')
      .eq('external_message_id', body.external_message_id)
      .eq('user_uuid', tokenPayload.user_uuid)
      .maybeSingle();

    if (emailError) {
      console.error('[addin-email-create-task] Email lookup error:', emailError);
      return errorResponse(500, 'DATABASE_ERROR', 'Failed to lookup email record', { detail: emailError.message });
    }

    if (!existingEmail) {
      return errorResponse(404, 'EMAIL_NOT_FOUND', 'Email record not found. Capture the email first.', {});
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
      .eq('user_uuid', body.task.assigned_to_user_uuid)
      .single();

    if (assigneeError || !assignee) {
      return errorResponse(404, 'USER_NOT_FOUND', 'Assigned user not found', { assigned_to_user_uuid: body.task.assigned_to_user_uuid });
    }

    // Create the task
    const { data: task, error: taskError } = await supabaseAdmin
      .from('tasks')
      .insert({
        title: body.task.title,
        description: body.task.description || `Created from Outlook email. See linked email evidence.`,
        status: 'open',
        priority: body.task.priority || 'medium',
        tenant_id: tenantId,
        client_id: parseInt(body.client_id, 10),
        assigned_to: body.task.assigned_to_user_uuid,
        created_by: tokenPayload.user_uuid,
        due_date: body.task.due_at || null,
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

    // Link the email record to the task
    const { error: updateError } = await supabaseAdmin
      .from('email_messages')
      .update({ 
        task_id: task.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingEmail.id);

    if (updateError) {
      console.warn('[addin-email-create-task] Failed to link email to task:', updateError);
    }

    // Log audit event
    const { data: auditEvent, error: auditError } = await supabaseAdmin
      .from('email_link_audit')
      .insert({
        email_id: existingEmail.id,
        user_id: tokenPayload.user_uuid,
        action: 'task_created_from_email',
        entity_type: 'task',
        entity_id: task.id,
        metadata: {
          task_title: body.task.title,
          client_id: body.client_id,
          assigned_to_user_uuid: body.task.assigned_to_user_uuid,
          external_message_id: body.external_message_id,
          idempotency_key: idempotencyKey,
        },
      })
      .select('id')
      .single();

    if (auditError) {
      console.warn('[addin-email-create-task] Audit log failed:', auditError);
    }

    console.log('[addin-email-create-task] Task created successfully:', task.id);

    // Return success with new format
    return new Response(
      JSON.stringify({
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          due_at: task.due_date,
          assigned_to_user_uuid: task.assigned_to,
          client_id: body.client_id,
        },
        email_record: {
          id: existingEmail.id,
          task_id: task.id,
        },
        audit_event_id: auditEvent?.id || null,
        links: {
          open_task: `/tasks/${task.id}`,
          open_client: `/clients/${body.client_id}`,
        },
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[addin-email-create-task] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(500, 'INTERNAL_ERROR', message, {});
  }
});