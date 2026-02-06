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

interface CreateTimeDraftRequest {
  external_event_id: string;
  client_id?: string;
  package_id?: string;
  minutes_override?: number;
  notes?: string;
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
    console.error('[addin-meeting-create-time-draft] Token verification failed:', error);
    return null;
  }
}

function calculateMinutesFromDuration(startAt: string, endAt: string): number {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.round(diffMs / 60000));
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
    const body: CreateTimeDraftRequest = await req.json();
    
    console.log('[addin-meeting-create-time-draft] Request:', {
      user: tokenPayload.email,
      external_event_id: body.external_event_id?.substring(0, 20) + '...',
      client_id: body.client_id,
      minutes_override: body.minutes_override,
      idempotency_key: idempotencyKey,
    });

    // Validate required fields
    if (!body.external_event_id) {
      return errorResponse(400, 'VALIDATION_ERROR', 'external_event_id is required');
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    // Check if a draft already exists for this meeting and user
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
      return errorResponse(409, 'DRAFT_ALREADY_EXISTS', 'A time draft already exists for this meeting', {
        existing_draft_id: existingDraft.id,
      });
    }

    // Calculate minutes from duration or use override
    const calculatedMinutes = calculateMinutesFromDuration(meeting.start_at, meeting.end_at);
    const minutes = body.minutes_override ?? calculatedMinutes;

    // Determine client_id and package_id (prefer request, fallback to meeting)
    const clientId = body.client_id ? parseInt(body.client_id, 10) : meeting.client_id;
    const packageId = body.package_id ? parseInt(body.package_id, 10) : meeting.package_id;

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
        source: 'addin',
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
          minutes_override: body.minutes_override || null,
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

    // Return success
    return new Response(
      JSON.stringify({
        time_draft: {
          id: draft.id,
          calendar_event_id: meeting.id,
          minutes: draft.minutes,
          work_date: draft.work_date,
          client_id: draft.client_id,
          package_id: draft.package_id,
          status: draft.status,
          created_at: draft.created_at,
        },
        meeting: {
          id: meeting.id,
          title: meeting.title,
          starts_at: meeting.start_at,
          ends_at: meeting.end_at,
        },
        calculated_minutes: calculatedMinutes,
        audit_event_id: auditEvent?.id || null,
        links: {
          open_time_inbox: '/work/time-inbox',
        },
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[addin-meeting-create-time-draft] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(500, 'INTERNAL_ERROR', message, {});
  }
});
