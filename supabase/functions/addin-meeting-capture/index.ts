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

const FUNCTION_NAME = 'addin-meeting-capture';

interface Organiser {
  email: string;
  name?: string;
}

interface Attendee {
  email: string;
  name?: string;
  type?: 'required' | 'optional' | 'resource';
}

interface CaptureRequest {
  provider?: string;
  external_event_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  organiser: Organiser;
  teams_join_url?: string;
  location?: string;
  attendees?: Attendee[];
  link?: {
    client_id?: string | null;
    package_id?: string | null;
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
      await logFailedAction(FUNCTION_NAME, 'meeting_capture', null, authResult.error!.code, authResult.error!.message);
      return errorResponse(authResult.error!.status, authResult.error!.code, authResult.error!.message);
    }
    const tokenPayload = authResult.payload;

    // RBAC: Enforce Vivacity Team role
    const rbacResult = enforceVivacityTeamRole(tokenPayload);
    if (!rbacResult.success) {
      await logFailedAction(FUNCTION_NAME, 'meeting_capture', tokenPayload.user_uuid, rbacResult.error!.code, rbacResult.error!.message);
      return errorResponse(rbacResult.error!.status, rbacResult.error!.code, rbacResult.error!.message, rbacResult.error!.details || {});
    }

    const idempotencyKey = req.headers.get('Idempotency-Key');
    const body: CaptureRequest = await req.json();
    
    console.log('[addin-meeting-capture] Request:', {
      user: tokenPayload.email,
      role: tokenPayload.role,
      external_event_id: body.external_event_id?.substring(0, 20) + '...',
      title: body.title,
      client_id: body.link?.client_id,
      attendees_count: body.attendees?.length || 0,
      idempotency_key: idempotencyKey,
    });

    // Validate required fields
    if (!body.external_event_id) {
      return errorResponse(400, 'VALIDATION_ERROR', 'external_event_id is required');
    }
    if (!body.title) {
      return errorResponse(400, 'VALIDATION_ERROR', 'title is required');
    }
    if (!body.starts_at) {
      return errorResponse(400, 'VALIDATION_ERROR', 'starts_at is required');
    }
    if (!body.ends_at) {
      return errorResponse(400, 'VALIDATION_ERROR', 'ends_at is required');
    }
    if (!body.organiser?.email) {
      return errorResponse(400, 'VALIDATION_ERROR', 'organiser.email is required');
    }

    // RBAC: Verify user has access to the client if linking
    if (body.link?.client_id) {
      const clientAccessResult = await verifyClientAccess(tokenPayload.user_uuid, body.link.client_id, FUNCTION_NAME);
      if (!clientAccessResult.success) {
        await logFailedAction(FUNCTION_NAME, 'meeting_capture', tokenPayload.user_uuid, clientAccessResult.error!.code, clientAccessResult.error!.message, { client_id: body.link.client_id });
        return errorResponse(clientAccessResult.error!.status, clientAccessResult.error!.code, clientAccessResult.error!.message, clientAccessResult.error!.details || {});
      }
    }

    const supabaseAdmin = createAdminClient();

    // Get user's tenant_id
    const tenantId = tokenPayload.tenant_id;
    if (!tenantId) {
      return errorResponse(403, 'NO_TENANT', 'User is not associated with any tenant');
    }

    // Check if event already exists for this user
    const { data: existingEvent, error: checkError } = await supabaseAdmin
      .from('calendar_events')
      .select('id, user_id, addin_captured_at')
      .eq('provider_event_id', body.external_event_id)
      .eq('user_id', tokenPayload.user_uuid)
      .maybeSingle();

    if (checkError) {
      console.error('[addin-meeting-capture] Check error:', checkError);
      return errorResponse(500, 'DATABASE_ERROR', 'Failed to check existing event', { detail: checkError.message });
    }

    // Determine if this is an insert or update
    const isUpdate = !!existingEvent;

    // Prepare event data
    const attendeesCount = body.attendees?.length || 0;
    const eventData = {
      tenant_id: tenantId,
      user_id: tokenPayload.user_uuid,
      provider: body.provider || 'microsoft',
      provider_event_id: body.external_event_id,
      title: body.title,
      start_at: body.starts_at,
      end_at: body.ends_at,
      location: body.location || null,
      organiser_email: body.organiser.email,
      teams_join_url: body.teams_join_url || null,
      client_id: body.link?.client_id ? parseInt(body.link.client_id, 10) : null,
      package_id: body.link?.package_id ? parseInt(body.link.package_id, 10) : null,
      addin_captured_at: new Date().toISOString(),
      addin_captured_by: tokenPayload.user_uuid,
      source: 'addin',
      raw: {
        attendees_count: attendeesCount,
        attendees: body.attendees || [],
        organiser_name: body.organiser.name || null,
        captured_via: 'outlook_addin',
      },
    };

    let eventRecord;

    if (isUpdate) {
      // Update existing event
      const { data, error: updateError } = await supabaseAdmin
        .from('calendar_events')
        .update({
          title: eventData.title,
          start_at: eventData.start_at,
          end_at: eventData.end_at,
          location: eventData.location,
          organiser_email: eventData.organiser_email,
          teams_join_url: eventData.teams_join_url,
          client_id: eventData.client_id,
          package_id: eventData.package_id,
          addin_captured_at: eventData.addin_captured_at,
          raw: eventData.raw,
        })
        .eq('id', existingEvent.id)
        .select('id, provider_event_id, title, start_at, end_at, client_id, package_id, teams_join_url, addin_captured_at')
        .single();

      if (updateError) {
        console.error('[addin-meeting-capture] Update error:', updateError);
        return errorResponse(500, 'DATABASE_ERROR', 'Failed to update event', { detail: updateError.message });
      }
      eventRecord = data;
    } else {
      // Insert new event
      const { data, error: insertError } = await supabaseAdmin
        .from('calendar_events')
        .insert(eventData)
        .select('id, provider_event_id, title, start_at, end_at, client_id, package_id, teams_join_url, addin_captured_at')
        .single();

      if (insertError) {
        console.error('[addin-meeting-capture] Insert error:', insertError);
        return errorResponse(500, 'DATABASE_ERROR', 'Failed to create event', { detail: insertError.message });
      }
      eventRecord = data;
    }

    // Log audit event
    const { data: auditEvent, error: auditError } = await supabaseAdmin
      .from('meeting_capture_audit')
      .insert({
        calendar_event_id: eventRecord.id,
        user_id: tokenPayload.user_uuid,
        action: 'meeting_captured',
        entity_type: body.link?.client_id ? 'client' : null,
        entity_id: body.link?.client_id || null,
        metadata: {
          title: body.title,
          starts_at: body.starts_at,
          ends_at: body.ends_at,
          package_id: body.link?.package_id || null,
          attendees_count: attendeesCount,
          is_update: isUpdate,
          idempotency_key: idempotencyKey,
        },
      })
      .select('id')
      .single();

    if (auditError) {
      console.warn('[addin-meeting-capture] Audit log failed:', auditError);
    }

    console.log('[addin-meeting-capture] Meeting captured successfully:', eventRecord.id);

    // Build response links
    const links: Record<string, string> = {
      open_meeting: `/meetings/${eventRecord.id}`,
    };
    if (body.link?.client_id) {
      links.open_client = `/clients/${body.link.client_id}`;
    }

    // Return success response matching API contract
    return new Response(
      JSON.stringify({
        meeting: {
          id: eventRecord.id,
          external_event_id: eventRecord.provider_event_id,
          title: eventRecord.title,
          starts_at: eventRecord.start_at,
          ends_at: eventRecord.end_at,
          teams_join_url: eventRecord.teams_join_url,
          client_id: eventRecord.client_id,
          package_id: eventRecord.package_id,
          status: 'scheduled',
        },
        participants_upserted: attendeesCount,
        audit_event_id: auditEvent?.id || null,
        links,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[addin-meeting-capture] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(500, 'INTERNAL_ERROR', message, {});
  }
});
