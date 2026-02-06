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

// Error codes
const ERROR_CODES = {
  MICROSOFT_TOKEN_INVALID: 'MICROSOFT_TOKEN_INVALID',
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_INACTIVE: 'USER_INACTIVE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

interface ExchangeRequest {
  ms_proof_token: string;
  ms_user_email: string;
  ms_user_id: string;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

interface MicrosoftProfile {
  id: string;
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {}
): Response {
  const body: ErrorResponse = {
    error: { code, message, details }
  };
  return new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Verify Microsoft proof token by calling Microsoft Graph API
 * The proof token can be an access token from Office.auth.getAccessToken()
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
 * Try to decode and verify an Office SSO token (JWT format)
 * Falls back to Graph API verification if not a valid JWT
 */
async function verifyProofToken(token: string): Promise<{ email: string; msUserId: string; displayName?: string } | null> {
  // First try as Graph API access token
  const graphProfile = await verifyMicrosoftToken(token);
  if (graphProfile) {
    const email = (graphProfile.mail || graphProfile.userPrincipalName || '').toLowerCase();
    if (email) {
      return {
        email,
        msUserId: graphProfile.id,
        displayName: graphProfile.displayName,
      };
    }
  }

  // Try to decode as JWT (Office SSO token)
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      
      // Check expiration
      if (payload.exp && payload.exp < Date.now() / 1000) {
        console.error('[addin-auth] Token expired');
        return null;
      }

      const email = (payload.preferred_username || payload.email || payload.upn || '').toLowerCase();
      const msUserId = payload.oid;

      if (email && msUserId) {
        return {
          email,
          msUserId,
          displayName: payload.name,
        };
      }
    }
  } catch (e) {
    console.error('[addin-auth] JWT decode failed:', e);
  }

  return null;
}

/**
 * Mint a short-lived JWT for add-in usage (15 minutes)
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
    .setExpirationTime('15m')
    .setIssuer('unicorn-addin')
    .setSubject(userUuid)
    .sign(secret);

  return jwt;
}

/**
 * Map internal role to display name
 */
function formatRoleName(role: string): string {
  const roleMap: Record<string, string> = {
    'super_admin': 'Super Admin',
    'superadmin': 'Super Admin',
    'admin': 'Admin',
    'moderator': 'Moderator',
    'user': 'User',
    'team_member': 'Team Member',
    'team_leader': 'Team Leader',
  };
  return roleMap[role.toLowerCase()] || role;
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
    const body: ExchangeRequest = await req.json();
    const { ms_proof_token, ms_user_email, ms_user_id } = body;

    console.log('[addin-auth] Exchange request:', {
      hasProofToken: !!ms_proof_token,
      email: ms_user_email,
      msUserId: ms_user_id?.substring(0, 8) + '...',
    });

    // Validate required fields
    if (!ms_proof_token) {
      return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'ms_proof_token is required');
    }
    if (!ms_user_email) {
      return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'ms_user_email is required');
    }

    // Verify the Microsoft proof token
    const verified = await verifyProofToken(ms_proof_token);
    if (!verified) {
      return errorResponse(401, ERROR_CODES.MICROSOFT_TOKEN_INVALID, 'Microsoft token validation failed.', {});
    }

    // Validate email match
    if (verified.email !== ms_user_email.toLowerCase()) {
      console.error('[addin-auth] Email mismatch:', {
        verified: verified.email,
        provided: ms_user_email,
      });
      return errorResponse(403, ERROR_CODES.IDENTITY_MISMATCH, 'Microsoft email does not match a Unicorn user.', {
        ms_user_email: ms_user_email,
      });
    }

    // Initialize Supabase admin client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find Unicorn user by email
    const { data: unicornUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('user_uuid, email, first_name, last_name, status')
      .eq('email', verified.email)
      .single();

    if (userError || !unicornUser) {
      console.error('[addin-auth] Unicorn user not found:', verified.email);
      return errorResponse(403, ERROR_CODES.IDENTITY_MISMATCH, 'Microsoft email does not match a Unicorn user.', {
        ms_user_email: ms_user_email,
      });
    }

    if (unicornUser.status !== 'active') {
      console.error('[addin-auth] User account not active:', unicornUser.status);
      return errorResponse(403, ERROR_CODES.USER_INACTIVE, 'Unicorn account is not active.', {
        status: unicornUser.status,
      });
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

    // Fetch feature flags
    const { data: appSettings } = await supabaseAdmin
      .from('app_settings')
      .select('*')
      .limit(1)
      .single();

    const features = {
      microsoft_addin_enabled: (appSettings as Record<string, unknown>)?.microsoft_addin_enabled ?? false,
      addin_outlook_mail_enabled: (appSettings as Record<string, unknown>)?.addin_outlook_mail_enabled ?? false,
      addin_meetings_enabled: (appSettings as Record<string, unknown>)?.addin_meetings_enabled ?? false,
      addin_documents_enabled: (appSettings as Record<string, unknown>)?.addin_documents_enabled ?? false,
    };

    // Upsert Microsoft identity
    await supabaseAdmin
      .from('user_microsoft_identities')
      .upsert({
        user_uuid: unicornUser.user_uuid,
        ms_user_id: verified.msUserId,
        email: verified.email,
        display_name: verified.displayName || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_uuid' })
      .catch(err => console.warn('[addin-auth] Failed to store MS identity:', err));

    // Mint add-in JWT
    const addinToken = await mintAddinJwt(
      unicornUser.user_uuid,
      verified.email,
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
          exchange_type: 'proof_token',
          ms_user_id: verified.msUserId,
        },
      })
      .catch(err => console.warn('[addin-auth] Audit log failed:', err));

    console.log('[addin-auth] Exchange successful for:', verified.email);

    // Return success response matching the contract
    return new Response(
      JSON.stringify({
        addin_token: addinToken,
        expires_in_seconds: 900,
        user: {
          user_uuid: unicornUser.user_uuid,
          email: unicornUser.email,
          first_name: unicornUser.first_name,
          last_name: unicornUser.last_name,
          unicorn_role: formatRoleName(role),
        },
        features,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[addin-auth] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(500, ERROR_CODES.INTERNAL_ERROR, message, {});
  }
});
