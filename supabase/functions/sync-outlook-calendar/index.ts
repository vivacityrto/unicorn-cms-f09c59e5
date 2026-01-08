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
}

interface TokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  tenant_id: number;
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
      scope: 'openid profile email offline_access Calendars.Read'
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
  url.searchParams.set('$select', 'id,subject,bodyPreview,start,end,location,organizer,attendees,webLink,onlineMeeting,isCancelled');
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[sync-outlook] Sync request received at:', new Date().toISOString());

  try {
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

    console.log('[sync-outlook] Syncing for user:', user.id);

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

    // Fetch events from Microsoft Graph
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
      } catch (e) {
        console.error('[sync-outlook] Error processing event:', e);
        errors++;
      }
    }

    console.log('[sync-outlook] Sync complete:', { synced, errors, total: events.length });

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
