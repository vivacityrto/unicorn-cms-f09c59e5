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
    return token.access_token;
  }

  console.log('[sync-outlook] Refreshing token for user:', userId);

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
    throw new Error('Failed to refresh token');
  }

  const tokens = await tokenResponse.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

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

  const response = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[sync-outlook] Graph API error:', errorText);
    throw new Error(`Graph API error: ${response.status}`);
  }

  const data = await response.json();
  return data.value || [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Get OAuth token
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('oauth_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'microsoft')
      .single();

    if (tokenError || !tokenRecord) {
      return new Response(
        JSON.stringify({ error: 'Not connected to Outlook' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh token if needed
    const accessToken = await refreshTokenIfNeeded(supabaseAdmin, user.id, tokenRecord as TokenRecord);

    // Fetch events from Microsoft Graph
    console.log('[sync-outlook] Fetching events for user:', user.id);
    const events = await fetchCalendarEvents(accessToken);
    console.log('[sync-outlook] Fetched', events.length, 'events');

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

        await supabaseAdmin.from('calendar_events').upsert({
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
        
        synced++;
      } catch (e) {
        console.error('[sync-outlook] Error upserting event:', e);
        errors++;
      }
    }

    console.log('[sync-outlook] Sync complete:', { synced, errors });

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
    console.error('[sync-outlook] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
