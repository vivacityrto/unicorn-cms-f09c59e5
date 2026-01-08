import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID')!;
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader && action !== 'callback') {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Action: Get auth URL to redirect user to Microsoft login
    if (action === 'get-auth-url') {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
        authHeader?.replace('Bearer ', '') || ''
      );
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.json();
      const redirectUri = body.redirect_uri;
      const tenantId = body.tenant_id;

      // Store state for CSRF protection
      const state = crypto.randomUUID();
      const stateData = {
        user_id: user.id,
        tenant_id: tenantId,
        redirect_uri: redirectUri,
        created_at: new Date().toISOString()
      };

      // Store state temporarily
      await supabaseAdmin.from('oauth_states').upsert({
        state,
        data: stateData,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min expiry
      });

      const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      authUrl.searchParams.set('client_id', MICROSOFT_CLIENT_ID);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', 'openid profile email offline_access Calendars.Read');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('response_mode', 'query');

      console.log('[outlook-auth] Generated auth URL for user:', user.id);

      return new Response(
        JSON.stringify({ auth_url: authUrl.toString(), state }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Exchange code for tokens
    if (action === 'exchange-code') {
      const body = await req.json();
      const { code, redirect_uri, state } = body;

      // Verify state
      const { data: stateRecord } = await supabaseAdmin
        .from('oauth_states')
        .select('*')
        .eq('state', state)
        .single();

      if (!stateRecord) {
        return new Response(
          JSON.stringify({ error: 'Invalid state' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const stateData = stateRecord.data as { user_id: string; tenant_id: number };

      // Exchange code for tokens
      const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          code,
          redirect_uri,
          grant_type: 'authorization_code',
          scope: 'openid profile email offline_access Calendars.Read'
        })
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('[outlook-auth] Token exchange failed:', errorText);
        return new Response(
          JSON.stringify({ error: 'Token exchange failed' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const tokens = await tokenResponse.json();
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Store tokens
      await supabaseAdmin.from('oauth_tokens').upsert({
        user_id: stateData.user_id,
        tenant_id: stateData.tenant_id,
        provider: 'microsoft',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt.toISOString(),
        scope: tokens.scope,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,provider' });

      // Clean up state
      await supabaseAdmin.from('oauth_states').delete().eq('state', state);

      console.log('[outlook-auth] Tokens stored for user:', stateData.user_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Check connection status
    if (action === 'status') {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
        authHeader?.replace('Bearer ', '') || ''
      );
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: token } = await supabaseAdmin
        .from('oauth_tokens')
        .select('expires_at, updated_at')
        .eq('user_id', user.id)
        .eq('provider', 'microsoft')
        .single();

      return new Response(
        JSON.stringify({ 
          connected: !!token,
          expires_at: token?.expires_at,
          last_updated: token?.updated_at
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Disconnect
    if (action === 'disconnect') {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
        authHeader?.replace('Bearer ', '') || ''
      );
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabaseAdmin.from('oauth_tokens').delete()
        .eq('user_id', user.id)
        .eq('provider', 'microsoft');

      // Also delete synced events
      await supabaseAdmin.from('calendar_events').delete()
        .eq('user_id', user.id)
        .eq('provider', 'outlook');

      console.log('[outlook-auth] Disconnected user:', user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[outlook-auth] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
