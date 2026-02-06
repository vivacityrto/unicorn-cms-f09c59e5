import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Create Time Drafts from Completed Meetings
 * 
 * This function processes completed meetings that don't have time drafts
 * and creates draft time entries for them based on user settings.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[create-meeting-time-drafts] Request received');

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[create-meeting-time-drafts] Processing for user:', user.id);

    // Get user's time capture settings
    const { data: settings } = await supabaseAdmin
      .from('user_time_capture_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Default settings if none exist
    const minMinutes = settings?.min_minutes || 10;
    const maxMinutes = settings?.max_minutes || 240;
    const includeOrganizerOnly = settings?.include_organizer_only || false;
    const autoCreate = settings?.auto_create_meeting_drafts !== false; // Default true

    if (!autoCreate) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Auto-create disabled in settings',
          created: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's tenant
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('user_uuid', user.id)
      .single();

    if (!userProfile?.tenant_id) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find completed meetings without time drafts
    let query = supabaseAdmin
      .from('meetings')
      .select('*')
      .eq('owner_user_uuid', user.id)
      .eq('status', 'completed')
      .eq('time_draft_created', false);

    if (includeOrganizerOnly) {
      query = query.eq('is_organizer', true);
    }

    const { data: meetings, error: meetingsError } = await query;

    if (meetingsError) {
      console.error('[create-meeting-time-drafts] Error fetching meetings:', meetingsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch meetings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[create-meeting-time-drafts] Found', meetings?.length || 0, 'meetings to process');

    let created = 0;
    let skipped = 0;

    for (const meeting of (meetings || [])) {
      // Calculate duration
      const startTime = new Date(meeting.starts_at);
      const endTime = new Date(meeting.ends_at);
      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

      // Check duration constraints
      if (durationMinutes < minMinutes) {
        console.log(`[create-meeting-time-drafts] Skipping meeting ${meeting.id}: duration ${durationMinutes}m < min ${minMinutes}m`);
        skipped++;
        continue;
      }

      if (durationMinutes > maxMinutes) {
        console.log(`[create-meeting-time-drafts] Capping meeting ${meeting.id}: duration ${durationMinutes}m > max ${maxMinutes}m`);
      }

      const finalMinutes = Math.min(durationMinutes, maxMinutes);

      // Find corresponding calendar event
      const { data: calendarEvent } = await supabaseAdmin
        .from('calendar_events')
        .select('id')
        .eq('provider_event_id', meeting.external_event_id)
        .eq('user_id', user.id)
        .single();

      if (!calendarEvent) {
        console.log(`[create-meeting-time-drafts] No calendar event found for meeting ${meeting.id}`);
        skipped++;
        continue;
      }

      // Create time draft
      const { error: insertError } = await supabaseAdmin
        .from('calendar_time_drafts')
        .insert({
          calendar_event_id: calendarEvent.id,
          created_by: user.id,
          client_id: meeting.client_id,
          package_id: meeting.package_id,
          notes: meeting.title,
          work_date: meeting.starts_at.split('T')[0],
          minutes: finalMinutes,
          status: 'draft',
          tenant_id: userProfile.tenant_id,
          source: 'teams_auto'
        });

      if (insertError) {
        console.error(`[create-meeting-time-drafts] Error creating draft for meeting ${meeting.id}:`, insertError);
        continue;
      }

      // Mark meeting as having time draft
      await supabaseAdmin
        .from('meetings')
        .update({ time_draft_created: true })
        .eq('id', meeting.id);

      created++;
    }

    console.log('[create-meeting-time-drafts] Complete:', { created, skipped });

    // Log audit entry
    await supabaseAdmin.from('meeting_sync_audit').insert({
      user_id: user.id,
      tenant_id: userProfile.tenant_id,
      action: 'time_drafts_created',
      meetings_created: created,
      meetings_skipped: skipped
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        created, 
        skipped,
        total: (meetings?.length || 0)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[create-meeting-time-drafts] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
