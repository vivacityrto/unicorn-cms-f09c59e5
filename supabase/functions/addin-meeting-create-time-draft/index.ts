import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  corsHeaders, 
  errorResponse, 
  verifyAddinToken, 
  enforceVivacityTeamRole,
  verifyClientAccess,
  createAdminClient,
  logFailedAction,
} from "../_shared/addin-auth.ts";

const FUNCTION_NAME = 'addin-meeting-create-time-draft';

interface TimeRules {
  rounding_minutes?: number;
  min_minutes?: number;
  max_minutes?: number;
}

interface CreateTimeDraftRequest {
  external_event_id: string;
  client_id?: string;
  package_id?: string;
  minutes_override?: number | null;
  notes?: string;
  rules?: TimeRules;
}

function calculateMinutesFromDuration(startAt: string, endAt: string): number {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}

function applyTimeRules(minutes: number, rules: TimeRules): number {
  let result = minutes;
  
  // Apply rounding
  if (rules.rounding_minutes && rules.rounding_minutes > 0) {
    result = Math.ceil(result / rules.rounding_minutes) * rules.rounding_minutes;
  }
  
  // Apply minimum
  if (rules.min_minutes && result < rules.min_minutes) {
    result = rules.min_minutes;
  }
  
  // Apply maximum
  if (rules.max_minutes && result > rules.max_minutes) {
    result = rules.max_minutes;
  }
  
  return result;
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
      await logFailedAction(FUNCTION_NAME, 'time_draft_create', null, authResult.error!.code, authResult.error!.message);
      return errorResponse(authResult.error!.status, authResult.error!.code, authResult.error!.message);
    }
    const tokenPayload = authResult.payload;

    // RBAC: Enforce Vivacity Team role
    const rbacResult = enforceVivacityTeamRole(tokenPayload);
    if (!rbacResult.success) {
      await logFailedAction(FUNCTION_NAME, 'time_draft_create', tokenPayload.user_uuid, rbacResult.error!.code, rbacResult.error!.message);
      return errorResponse(rbacResult.error!.status, rbacResult.error!.code, rbacResult.error!.message, rbacResult.error!.details || {});
    }

    const idempotencyKey = req.headers.get('Idempotency-Key');
    const body: CreateTimeDraftRequest = await req.json();
    
    console.log('[addin-meeting-create-time-draft] Request:', {
      user: tokenPayload.email,
      role: tokenPayload.role,
      external_event_id: body.external_event_id?.substring(0, 20) + '...',
      client_id: body.client_id,
      minutes_override: body.minutes_override,
      rules: body.rules,
      idempotency_key: idempotencyKey,
    });

    // Validate required fields
    if (!body.external_event_id) {
      return errorResponse(400, 'VALIDATION_ERROR', 'external_event_id is required');
    }

    const supabaseAdmin = createAdminClient();

    // Get user's tenant_id
    const tenantId = tokenPayload.tenant_id;
    if (!tenantId) {
      return errorResponse(403, 'NO_TENANT', 'User is not associated with any tenant');
    }

    // Find the meeting (must be captured first)
    const { data: meeting, error: meetingError } = await supabaseAdmin
      .from('calendar_events')
      .select('id, title, start_at, end_at, client_id, package_id, tenant_id')
      .eq('provider_event_id', body.external_event_id)
      .eq('user_id', tokenPayload.user_uuid)
      .maybeSingle();

    if (meetingError) {
      console.error('[addin-meeting-create-time-draft] Meeting lookup error:', meetingError);
      return errorResponse(500, 'DATABASE_ERROR', 'Failed to lookup meeting', { detail: meetingError.message });
    }

    if (!meeting) {
      return errorResponse(404, 'MEETING_NOT_FOUND', 'Meeting not found. Capture the meeting first.', {});
    }

    // Determine client_id - prefer request, fallback to meeting
    const clientId = body.client_id ? parseInt(body.client_id, 10) : meeting.client_id;
    const packageId = body.package_id ? parseInt(body.package_id, 10) : meeting.package_id;

    // RBAC: Verify user has access to the client if specified
    if (clientId) {
      const clientAccessResult = await verifyClientAccess(tokenPayload.user_uuid, clientId, FUNCTION_NAME);
      if (!clientAccessResult.success) {
        await logFailedAction(FUNCTION_NAME, 'time_draft_create', tokenPayload.user_uuid, clientAccessResult.error!.code, clientAccessResult.error!.message, { client_id: clientId });
        return errorResponse(clientAccessResult.error!.status, clientAccessResult.error!.code, clientAccessResult.error!.message, clientAccessResult.error!.details || {});
      }
    }

    // Check if a draft already exists for this meeting and user (idempotency)
    const { data: existingDraft, error: draftCheckError } = await supabaseAdmin
      .from('calendar_time_drafts')
      .select('id')
      .eq('calendar_event_id', meeting.id)
      .eq('created_by', tokenPayload.user_uuid)
      .eq('status', 'draft')
      .maybeSingle();

    if (draftCheckError) {
      console.error('[addin-meeting-create-time-draft] Draft check error:', draftCheckError);
      return errorResponse(500, 'DATABASE_ERROR', 'Failed to check existing draft', { detail: draftCheckError.message });
    }

    if (existingDraft) {
      return errorResponse(409, 'TIME_DRAFT_ALREADY_EXISTS', 'A draft time entry already exists for this meeting.', {
        meeting_id: meeting.id,
        time_entry_id: existingDraft.id,
      });
    }

    // Calculate minutes from duration
    const calculatedMinutes = calculateMinutesFromDuration(meeting.start_at, meeting.end_at);
    
    // Use override if provided, otherwise use calculated
    let minutes = body.minutes_override ?? calculatedMinutes;
    
    // Apply time rules if provided
    if (body.rules) {
      minutes = applyTimeRules(minutes, body.rules);
    }

    // Get work date from meeting start
    const workDate = new Date(meeting.start_at).toISOString().split('T')[0];

    // Create the time draft
    const { data: draft, error: draftError } = await supabaseAdmin
      .from('calendar_time_drafts')
      .insert({
        tenant_id: tenantId,
        created_by: tokenPayload.user_uuid,
        calendar_event_id: meeting.id,
        client_id: clientId,
        package_id: packageId,
        minutes: minutes,
        work_date: workDate,
        notes: body.notes || `Meeting: ${meeting.title}`,
        status: 'draft',
        source: 'teams',
      })
      .select('id, minutes, work_date, client_id, package_id, status, created_at')
      .single();

    if (draftError) {
      console.error('[addin-meeting-create-time-draft] Draft creation error:', draftError);
      return errorResponse(500, 'DATABASE_ERROR', 'Failed to create time draft', { detail: draftError.message });
    }

    // Log audit event
    const { data: auditEvent, error: auditError } = await supabaseAdmin
      .from('meeting_capture_audit')
      .insert({
        calendar_event_id: meeting.id,
        user_id: tokenPayload.user_uuid,
        action: 'time_draft_created',
        entity_type: 'time_draft',
        entity_id: draft.id,
        metadata: {
          minutes: minutes,
          calculated_minutes: calculatedMinutes,
          minutes_override: body.minutes_override ?? null,
          rules_applied: body.rules || null,
          client_id: clientId,
          package_id: packageId,
          work_date: workDate,
          idempotency_key: idempotencyKey,
        },
      })
      .select('id')
      .single();

    if (auditError) {
      console.warn('[addin-meeting-create-time-draft] Audit log failed:', auditError);
    }

    console.log('[addin-meeting-create-time-draft] Time draft created successfully:', draft.id);

    // Build response links
    const links: Record<string, string> = {
      open_time_inbox: '/time-inbox',
    };
    if (clientId) {
      links.open_client = `/clients/${clientId}`;
    }

    // Return success response matching API contract
    return new Response(
      JSON.stringify({
        time_entry: {
          id: draft.id,
          status: draft.status,
          minutes: draft.minutes,
          source: 'teams',
          meeting_id: meeting.id,
          client_id: draft.client_id,
        },
        audit_event_id: auditEvent?.id || null,
        links,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[addin-meeting-create-time-draft] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(500, 'INTERNAL_ERROR', message, {});
  }
});
