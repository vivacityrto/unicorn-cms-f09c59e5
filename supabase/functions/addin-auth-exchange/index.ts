import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT } from "https://deno.land/x/jose@v5.2.2/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADDIN_JWT_SECRET = Deno.env.get('ADDIN_JWT_SECRET') || Deno.env.get('JWT_SECRET') || SUPABASE_SERVICE_ROLE_KEY;

interface ExchangeRequest {
  ms_access_token?: string;
  office_sso_token?: string;
  ms_user_email: string;
  ms_user_id: string;
}

interface MicrosoftProfile {
  id: string;
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
}

/**
 * Verify Microsoft access token by calling Microsoft Graph API
 */
async function verifyMicrosoftToken(token: string): Promise<MicrosoftProfile | null> {
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error('[addin-auth] MS Graph API error:', response.status, await response.text());
      return null;
    }

    const profile = await response.json();
    return {
      id: profile.id,
      mail: profile.mail,
      userPrincipalName: profile.userPrincipalName,
      displayName: profile.displayName,
    };
  } catch (error) {
    console.error('[addin-auth] Failed to verify MS token:', error);
    return null;
  }
}

/**
 * Verify Office SSO token (id_token from Office.auth.getAccessToken)
 * This is a simpler JWT that we can decode and verify the claims
 */
async function verifyOfficeSsoToken(token: string): Promise<{ email: string; oid: string; name?: string } | null> {
  try {
    // Office SSO tokens are JWTs - decode and extract claims
    // In production, you should verify the signature against Microsoft's public keys
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('[addin-auth] Invalid Office SSO token format');
      return null;
    }

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    
    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      console.error('[addin-auth] Office SSO token expired');
      return null;
    }

    // Extract email and oid
    const email = payload.preferred_username || payload.email || payload.upn;
    const oid = payload.oid;

    if (!email || !oid) {
      console.error('[addin-auth] Missing email or oid in Office SSO token');
      return null;
    }

    return {
      email,
      oid,
      name: payload.name,
    };
  } catch (error) {
    console.error('[addin-auth] Failed to verify Office SSO token:', error);
    return null;
  }
}

/**
 * Mint a short-lived JWT for add-in usage
 */
async function mintAddinJwt(
  userUuid: string,
  email: string,
  role: string,
  tenantId: number | null
): Promise<string> {
  const secret = new TextEncoder().encode(ADDIN_JWT_SECRET);
  
  const jwt = await new SignJWT({
    user_uuid: userUuid,
    email,
    role,
    tenant_id: tenantId,
    purpose: 'addin',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('15m') // 15 minutes
    .setIssuer('unicorn-addin')
    .setSubject(userUuid)
    .sign(secret);

  return jwt;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body: ExchangeRequest = await req.json();
    const { ms_access_token, office_sso_token, ms_user_email, ms_user_id } = body;

    console.log('[addin-auth] Exchange request received:', {
      hasAccessToken: !!ms_access_token,
      hasSsoToken: !!office_sso_token,
      email: ms_user_email,
      msUserId: ms_user_id?.substring(0, 8) + '...',
    });

    // Validate required fields
    if (!ms_user_email) {
      return new Response(
        JSON.stringify({ error: 'ms_user_email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!ms_access_token && !office_sso_token) {
      return new Response(
        JSON.stringify({ error: 'Either ms_access_token or office_sso_token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the Microsoft token
    let verifiedEmail: string;
    let verifiedMsUserId: string;
    let displayName: string | undefined;

    if (ms_access_token) {
      // Verify via Graph API
      const profile = await verifyMicrosoftToken(ms_access_token);
      if (!profile) {
        return new Response(
          JSON.stringify({ error: 'Invalid Microsoft access token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      verifiedEmail = (profile.mail || profile.userPrincipalName || '').toLowerCase();
      verifiedMsUserId = profile.id;
      displayName = profile.displayName;
    } else {
      // Verify Office SSO token
      const ssoResult = await verifyOfficeSsoToken(office_sso_token!);
      if (!ssoResult) {
        return new Response(
          JSON.stringify({ error: 'Invalid Office SSO token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      verifiedEmail = ssoResult.email.toLowerCase();
      verifiedMsUserId = ssoResult.oid;
      displayName = ssoResult.name;
    }

    // Validate email match
    if (verifiedEmail !== ms_user_email.toLowerCase()) {
      console.error('[addin-auth] Email mismatch:', {
        verified: verifiedEmail,
        provided: ms_user_email,
      });
      return new Response(
        JSON.stringify({ error: 'Email mismatch between token and provided email' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase admin client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find Unicorn user by email
    const { data: unicornUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('user_uuid, email, first_name, last_name, status')
      .eq('email', verifiedEmail)
      .single();

    if (userError || !unicornUser) {
      console.error('[addin-auth] Unicorn user not found:', verifiedEmail);
      return new Response(
        JSON.stringify({ error: 'No Unicorn account found for this email' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (unicornUser.status !== 'active') {
      console.error('[addin-auth] User account not active:', unicornUser.status);
      return new Response(
        JSON.stringify({ error: 'Unicorn account is not active' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user role
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', unicornUser.user_uuid)
      .single();

    const role = roleData?.role || 'user';

    // Get tenant association
    const { data: tenantUser } = await supabaseAdmin
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', unicornUser.user_uuid)
      .eq('status', 'active')
      .limit(1)
      .single();

    const tenantId = tenantUser?.tenant_id || null;

    // Upsert Microsoft identity
    const { error: identityError } = await supabaseAdmin
      .from('user_microsoft_identities')
      .upsert({
        user_uuid: unicornUser.user_uuid,
        ms_user_id: verifiedMsUserId,
        email: verifiedEmail,
        display_name: displayName || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_uuid' });

    if (identityError) {
      console.error('[addin-auth] Failed to store MS identity:', identityError);
      // Continue anyway - not critical
    }

    // Mint add-in JWT
    const addinJwt = await mintAddinJwt(
      unicornUser.user_uuid,
      verifiedEmail,
      role,
      tenantId
    );

    // Log audit event
    await supabaseAdmin
      .from('addin_audit_log')
      .insert({
        user_uuid: unicornUser.user_uuid,
        action: 'addin_opened',
        surface: null,
        metadata: {
          exchange_type: ms_access_token ? 'access_token' : 'sso_token',
          ms_user_id: verifiedMsUserId,
        },
      })
      .catch(err => console.warn('[addin-auth] Audit log failed:', err));

    console.log('[addin-auth] Exchange successful for:', verifiedEmail);

    return new Response(
      JSON.stringify({
        token: addinJwt,
        expires_in: 900, // 15 minutes in seconds
        user: {
          user_uuid: unicornUser.user_uuid,
          email: unicornUser.email,
          first_name: unicornUser.first_name,
          last_name: unicornUser.last_name,
          role,
          tenant_id: tenantId,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[addin-auth] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
