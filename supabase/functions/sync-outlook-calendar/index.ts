import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID')!;
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface CalendarEvent {
  id: string;
  subject: string;
  bodyPreview?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  organizer?: { emailAddress?: { address?: string; name?: string } };
  attendees?: Array<{ emailAddress?: { address?: string; name?: string }; type?: string }>;
  webLink?: string;
  onlineMeeting?: { joinUrl?: string };
  isCancelled?: boolean;
  sensitivity?: string;
}

interface OutlookEmail {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  receivedDateTime: string;
  hasAttachments: boolean;
  bodyPreview: string;
  isRead: boolean;
}

interface TokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  tenant_id: number;
  scope?: string;
}

async function refreshTokenIfNeeded(
  supabaseAdmin: SupabaseClient,
  userId: string,
  token: TokenRecord
): Promise<string> {
  const expiresAt = new Date(token.expires_at);
  const now = new Date();
  
  // Refresh if expires in less than 5 minutes
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    console.log('[sync-outlook] Token still valid, expires at:', token.expires_at);
    return token.access_token;
  }

  console.log('[sync-outlook] Token expired or expiring soon, refreshing for user:', userId);

  const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
      scope: token.scope || 'openid profile email offline_access Calendars.Read'
    })
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('[sync-outlook] Token refresh failed:', errorText);
    throw new Error('Failed to refresh token - user may need to reconnect');
  }

  const tokens = await tokenResponse.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  console.log('[sync-outlook] Token refreshed successfully, new expiry:', newExpiresAt.toISOString());

  await supabaseAdmin.from('oauth_tokens').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || token.refresh_token,
    expires_at: newExpiresAt.toISOString(),
    updated_at: new Date().toISOString()
  }).eq('user_id', userId).eq('provider', 'microsoft');

  return tokens.access_token;
}

async function fetchCalendarEvents(accessToken: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const past14Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const next60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const url = new URL('https://graph.microsoft.com/v1.0/me/events');
  url.searchParams.set('$filter', `start/dateTime ge '${past14Days.toISOString()}' and start/dateTime le '${next60Days.toISOString()}'`);
  url.searchParams.set('$select', 'id,subject,bodyPreview,start,end,location,organizer,attendees,webLink,onlineMeeting,isCancelled,sensitivity');
  url.searchParams.set('$orderby', 'start/dateTime');
  url.searchParams.set('$top', '250');

  console.log('[sync-outlook] Fetching events from Graph API...');

  const response = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[sync-outlook] Graph API error:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText
    });
    
    if (response.status === 401) {
      throw new Error('Token expired or invalid - user needs to reconnect');
    }
    if (response.status === 403) {
      throw new Error('Insufficient permissions - user needs to re-authorize');
    }
    
    throw new Error(`Graph API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('[sync-outlook] Fetched', data.value?.length || 0, 'events from Graph API');
  return data.value || [];
}

async function fetchEmails(accessToken: string, folder: string, top: number): Promise<OutlookEmail[]> {
  // Determine the folder path
  let folderPath = 'inbox';
  if (folder.toLowerCase() === 'sent') {
    folderPath = 'sentitems';
  } else if (folder.toLowerCase() !== 'inbox') {
    folderPath = folder;
  }

  const url = new URL(`https://graph.microsoft.com/v1.0/me/mailFolders/${folderPath}/messages`);
  url.searchParams.set('$select', 'id,subject,from,receivedDateTime,hasAttachments,bodyPreview,isRead');
  url.searchParams.set('$orderby', 'receivedDateTime desc');
  url.searchParams.set('$top', String(top));

  console.log('[sync-outlook] Fetching emails from folder:', folderPath);

  const response = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[sync-outlook] Graph API email error:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText
    });
    
    if (response.status === 401) {
      throw new Error('Token expired or invalid - user needs to reconnect');
    }
    if (response.status === 403) {
      throw new Error('Insufficient permissions - Mail.Read scope may be missing');
    }
    
    throw new Error(`Graph API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('[sync-outlook] Fetched', data.value?.length || 0, 'emails from Graph API');
  return data.value || [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[sync-outlook] Request received at:', new Date().toISOString());

  try {
    // Parse request body for options
    let action = 'sync-calendar';
    let includeMeetings = false;
    let folder = 'inbox';
    let top = 50;
    
    try {
      const body = await req.json();
      action = body?.action || 'sync-calendar';
      includeMeetings = body?.includeMeetings === true;
      folder = body?.folder || 'inbox';
      top = body?.top || 50;
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log('[sync-outlook] Action:', action);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('[sync-outlook] No auth header');
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
      console.log('[sync-outlook] Auth failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[sync-outlook] Processing for user:', user.id);

    // Get OAuth token
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('oauth_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'microsoft')
      .single();

    if (tokenError || !tokenRecord) {
      console.log('[sync-outlook] No token found:', tokenError?.message);
      return new Response(
        JSON.stringify({ error: 'Not connected to Outlook. Please connect first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[sync-outlook] Found token, tenant:', (tokenRecord as TokenRecord).tenant_id);

    // Refresh token if needed
    let accessToken: string;
    try {
      accessToken = await refreshTokenIfNeeded(supabaseAdmin, user.id, tokenRecord as TokenRecord);
    } catch (refreshError) {
      console.error('[sync-outlook] Token refresh failed:', refreshError);
      return new Response(
        JSON.stringify({ error: 'Token expired. Please reconnect to Outlook.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle get-emails action
    if (action === 'get-emails') {
      console.log('[sync-outlook] Fetching emails, folder:', folder, 'top:', top);
      
      try {
        const emails = await fetchEmails(accessToken, folder, top);
        return new Response(
          JSON.stringify({ emails }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (emailError) {
        console.error('[sync-outlook] Email fetch error:', emailError);
        return new Response(
          JSON.stringify({ error: emailError instanceof Error ? emailError.message : 'Failed to fetch emails' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Default action: sync calendar events
    let events: CalendarEvent[];
    try {
      events = await fetchCalendarEvents(accessToken);
    } catch (graphError) {
      console.error('[sync-outlook] Graph API failed:', graphError);
      return new Response(
        JSON.stringify({ error: graphError instanceof Error ? graphError.message : 'Failed to fetch events' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[sync-outlook] Processing', events.length, 'events');

    // Upsert events to database
    let synced = 0;
    let errors = 0;

    for (const event of events) {
      try {
        const attendees = (event.attendees || []).map(a => ({
          email: a.emailAddress?.address,
          name: a.emailAddress?.name,
          type: a.type
        }));

        const attendeeEmails = attendees.map(a => a.email).filter(Boolean);

        const { error: upsertError } = await supabaseAdmin.from('calendar_events').upsert({
          tenant_id: (tokenRecord as TokenRecord).tenant_id,
          user_id: user.id,
          provider: 'outlook',
          provider_event_id: event.id,
          calendar_id: 'primary',
          organizer_email: event.organizer?.emailAddress?.address,
          attendees: { list: attendees, emails: attendeeEmails },
          title: event.subject || 'Untitled',
          description: event.bodyPreview,
          location: event.location?.displayName,
          start_at: event.start.dateTime + 'Z',
          end_at: event.end.dateTime + 'Z',
          meeting_url: event.onlineMeeting?.joinUrl || event.webLink,
          status: event.isCancelled ? 'cancelled' : 'confirmed',
          sensitivity: event.sensitivity || 'normal',
          last_synced_at: new Date().toISOString(),
          raw: event
        }, { 
          onConflict: 'tenant_id,provider,provider_event_id,user_id',
          ignoreDuplicates: false 
        });
        
        if (upsertError) {
          console.error('[sync-outlook] Event upsert error:', upsertError);
          errors++;
        } else {
          synced++;
        }

        // Also sync to meetings table if it's an online meeting
        if (includeMeetings && event.onlineMeeting?.joinUrl) {
          try {
            const now = new Date();
            const eventEnd = new Date(event.end.dateTime + 'Z');
            const isCompleted = eventEnd < now;
            const organizerEmail = event.organizer?.emailAddress?.address?.toLowerCase();
            
            // Get user's email to check if they're the organizer
            const { data: userData } = await supabaseAdmin
              .from('users')
              .select('email')
              .eq('user_uuid', user.id)
              .single();
            
            const userEmail = userData?.email?.toLowerCase();
            const isOrganizer = userEmail && organizerEmail && userEmail === organizerEmail;

            const { error: meetingError } = await supabaseAdmin.from('meetings').upsert({
              tenant_id: (tokenRecord as TokenRecord).tenant_id,
              owner_user_uuid: user.id,
              provider: 'microsoft',
              external_event_id: event.id,
              external_meeting_url: event.onlineMeeting.joinUrl,
              title: event.subject || 'Untitled',
              starts_at: event.start.dateTime + 'Z',
              ends_at: event.end.dateTime + 'Z',
              timezone: event.start.timeZone,
              location: event.location?.displayName,
              is_online: true,
              is_organizer: isOrganizer,
              status: event.isCancelled ? 'cancelled' : (isCompleted ? 'completed' : 'scheduled'),
              sensitivity: event.sensitivity || 'normal',
              needs_linking: true, // Mark for client linking
              provider_payload: event
            }, {
              onConflict: 'owner_user_uuid,provider,external_event_id',
              ignoreDuplicates: false
            });

            if (meetingError) {
              console.error('[sync-outlook] Meeting upsert error:', meetingError);
            } else {
              // Upsert participants
              const participants = (event.attendees || []).map(a => ({
                meeting_id: null, // Will be set after we get the meeting ID
                participant_email: a.emailAddress?.address || '',
                participant_name: a.emailAddress?.name,
                participant_type: a.type === 'required' ? 'required' : (a.type === 'optional' ? 'optional' : 'required')
              }));

              // Get the meeting ID we just upserted
              const { data: meeting } = await supabaseAdmin
                .from('meetings')
                .select('id')
                .eq('owner_user_uuid', user.id)
                .eq('provider', 'microsoft')
                .eq('external_event_id', event.id)
                .single();

              if (meeting && participants.length > 0) {
                // Delete existing participants and insert new ones
                await supabaseAdmin
                  .from('meeting_participants')
                  .delete()
                  .eq('meeting_id', meeting.id);

                const participantsWithMeetingId = participants.map(p => ({
                  ...p,
                  meeting_id: meeting.id
                }));

                await supabaseAdmin
                  .from('meeting_participants')
                  .insert(participantsWithMeetingId);
              }
            }
          } catch (meetingErr) {
            console.error('[sync-outlook] Error syncing meeting:', meetingErr);
          }
        }
      } catch (e) {
        console.error('[sync-outlook] Error processing event:', e);
        errors++;
      }
    }

    console.log('[sync-outlook] Sync complete:', { synced, errors, total: events.length });

    // Update last_synced_at on the token record
    const { error: updateError } = await supabaseAdmin.from('oauth_tokens').update({
      last_synced_at: new Date().toISOString(),
      last_error: errors > 0 ? `${errors} events failed to sync` : null
    }).eq('user_id', user.id).eq('provider', 'microsoft');

    if (updateError) {
      console.warn('[sync-outlook] Failed to update token record:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced, 
        errors,
        total: events.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sync-outlook] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
