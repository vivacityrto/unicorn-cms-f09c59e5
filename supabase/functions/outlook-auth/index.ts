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
    // Parse action from body instead of URL params for consistency
    let action: string | null = null;
    let body: Record<string, unknown> = {};
    
    try {
      body = await req.json();
      action = body.action as string || null;
    } catch {
      // Fall back to URL params
      const url = new URL(req.url);
      action = url.searchParams.get('action');
    }

    console.log('[outlook-auth] Action:', action);
    console.log('[outlook-auth] Request received at:', new Date().toISOString());

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Helper to get authenticated user
    const getUser = async () => {
      if (!authHeader) {
        console.log('[outlook-auth] No auth header');
        return null;
      }
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(
        authHeader.replace('Bearer ', '')
      );
      if (error) {
        console.error('[outlook-auth] Auth error:', error.message);
        return null;
      }
      return user;
    };

    // Action: Get auth URL to redirect user to Microsoft login
    if (action === 'get-auth-url') {
      const user = await getUser();
      if (!user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const redirectUri = body.redirect_uri as string;
      const tenantId = body.tenant_id as number;

      console.log('[outlook-auth] get-auth-url:', {
        userId: user.id,
        tenantId,
        redirectUri
      });

      if (!redirectUri) {
        return new Response(
          JSON.stringify({ error: 'redirect_uri is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate and store state for CSRF protection
      const state = crypto.randomUUID();
      const stateData = {
        user_id: user.id,
        tenant_id: tenantId,
        redirect_uri: redirectUri,
        created_at: new Date().toISOString()
      };

      // Store state in database (canonical source of truth)
      const { error: stateError } = await supabaseAdmin.from('oauth_states').upsert({
        state,
        data: stateData,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min expiry
      });

      if (stateError) {
        console.error('[outlook-auth] Failed to store state:', stateError);
        return new Response(
          JSON.stringify({ error: 'Failed to initialize OAuth' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      authUrl.searchParams.set('client_id', MICROSOFT_CLIENT_ID);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', 'openid profile email offline_access Calendars.Read');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('response_mode', 'query');

      console.log('[outlook-auth] Generated auth URL for user:', user.id);
      console.log('[outlook-auth] State stored:', state.substring(0, 8) + '...');

      return new Response(
        JSON.stringify({ auth_url: authUrl.toString(), state }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Exchange code for tokens
    if (action === 'exchange-code') {
      const code = body.code as string;
      const redirectUri = body.redirect_uri as string;
      const state = body.state as string;

      console.log('[outlook-auth] exchange-code:', {
        hasCode: !!code,
        codeLength: code?.length,
        redirectUri,
        state: state?.substring(0, 8) + '...'
      });

      if (!code || !state) {
        return new Response(
          JSON.stringify({ error: 'code and state are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify state from database
      const { data: stateRecord, error: stateError } = await supabaseAdmin
        .from('oauth_states')
        .select('*')
        .eq('state', state)
        .single();

      console.log('[outlook-auth] State lookup result:', {
        found: !!stateRecord,
        error: stateError?.message
      });

      if (stateError || !stateRecord) {
        console.error('[outlook-auth] Invalid state - not found in database');
        return new Response(
          JSON.stringify({ error: 'Invalid or expired state. Please try connecting again.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if state is expired
      if (new Date(stateRecord.expires_at) < new Date()) {
        console.error('[outlook-auth] State expired');
        await supabaseAdmin.from('oauth_states').delete().eq('state', state);
        return new Response(
          JSON.stringify({ error: 'OAuth session expired. Please try connecting again.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const stateData = stateRecord.data as { 
        user_id: string; 
        tenant_id: number; 
        redirect_uri: string 
      };

      // Use the redirect_uri from the stored state (canonical)
      const canonicalRedirectUri = stateData.redirect_uri;

      console.log('[outlook-auth] Exchanging code:', {
        userId: stateData.user_id,
        tenantId: stateData.tenant_id,
        canonicalRedirectUri,
        providedRedirectUri: redirectUri
      });

      // Exchange code for tokens with Microsoft
      const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          code,
          redirect_uri: canonicalRedirectUri, // Use the URI from when auth was initiated
          grant_type: 'authorization_code',
          scope: 'openid profile email offline_access Calendars.Read'
        })
      });

      const tokenText = await tokenResponse.text();
      
      if (!tokenResponse.ok) {
        console.error('[outlook-auth] Token exchange failed:', {
          status: tokenResponse.status,
          body: tokenText
        });
        
        let errorMessage = 'Token exchange failed';
        try {
          const errorJson = JSON.parse(tokenText);
          errorMessage = errorJson.error_description || errorJson.error || errorMessage;
        } catch {
          // Use default message
        }
        
        return new Response(
          JSON.stringify({ error: errorMessage }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let tokens;
      try {
        tokens = JSON.parse(tokenText);
      } catch {
        console.error('[outlook-auth] Failed to parse token response');
        return new Response(
          JSON.stringify({ error: 'Invalid token response from Microsoft' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[outlook-auth] Token exchange successful:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in,
        scope: tokens.scope
      });

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Fetch user profile from Microsoft Graph to get email
      let accountEmail: string | null = null;
      try {
        const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { 'Authorization': `Bearer ${tokens.access_token}` }
        });
        if (profileResponse.ok) {
          const profile = await profileResponse.json();
          accountEmail = profile.mail || profile.userPrincipalName || null;
          console.log('[outlook-auth] Fetched profile email:', accountEmail);
        }
      } catch (profileError) {
        console.warn('[outlook-auth] Failed to fetch profile:', profileError);
      }

      // Store tokens - upsert to handle reconnection
      const { error: upsertError } = await supabaseAdmin.from('oauth_tokens').upsert({
        user_id: stateData.user_id,
        tenant_id: stateData.tenant_id,
        provider: 'microsoft',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt.toISOString(),
        scope: tokens.scope,
        account_email: accountEmail,
        last_synced_at: null,
        last_error: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,provider' });

      if (upsertError) {
        console.error('[outlook-auth] Failed to store tokens:', upsertError);
        return new Response(
          JSON.stringify({ error: 'Failed to store tokens' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Clean up state
      await supabaseAdmin.from('oauth_states').delete().eq('state', state);

      console.log('[outlook-auth] Tokens stored successfully for user:', stateData.user_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Check connection status
    if (action === 'status') {
      const user = await getUser();
      if (!user) {
        return new Response(
          JSON.stringify({ connected: false, error: 'Not authenticated' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: token, error: tokenError } = await supabaseAdmin
        .from('oauth_tokens')
        .select('expires_at, updated_at, account_email, last_synced_at, last_error')
        .eq('user_id', user.id)
        .eq('provider', 'microsoft')
        .single();

      console.log('[outlook-auth] Status check for user:', user.id, {
        found: !!token,
        error: tokenError?.message
      });

      const isExpired = token ? new Date(token.expires_at) < new Date() : false;

      return new Response(
        JSON.stringify({ 
          connected: !!token,
          expires_at: token?.expires_at,
          last_updated: token?.updated_at,
          account_email: token?.account_email,
          last_synced_at: token?.last_synced_at,
          last_error: token?.last_error,
          is_expired: isExpired
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Disconnect
    if (action === 'disconnect') {
      const user = await getUser();
      if (!user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[outlook-auth] Disconnecting user:', user.id);

      await supabaseAdmin.from('oauth_tokens').delete()
        .eq('user_id', user.id)
        .eq('provider', 'microsoft');

      // Also delete synced events
      await supabaseAdmin.from('calendar_events').delete()
        .eq('user_id', user.id)
        .eq('provider', 'outlook');

      console.log('[outlook-auth] User disconnected:', user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[outlook-auth] Invalid action:', action);

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[outlook-auth] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
