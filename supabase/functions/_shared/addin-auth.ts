/**
 * Shared authentication and authorization utilities for add-in edge functions
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://deno.land/x/jose@v5.2.2/index.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADDIN_JWT_SECRET = Deno.env.get('ADDIN_JWT_SECRET') || Deno.env.get('JWT_SECRET') || SUPABASE_SERVICE_ROLE_KEY;

// Allowed Vivacity Team roles
const VIVACITY_TEAM_ROLES = ['Super Admin', 'Team Leader', 'Team Member', 'SuperAdmin'];

export interface AddinTokenPayload {
  user_uuid: string;
  email: string;
  role: string;
  tenant_id: number | null;
  purpose: string;
}

export interface AuthResult {
  success: boolean;
  payload?: AddinTokenPayload;
  error?: { status: number; code: string; message: string };
}

export interface RBACResult {
  success: boolean;
  error?: { status: number; code: string; message: string; details?: Record<string, unknown> };
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
};

export function errorResponse(status: number, code: string, message: string, details: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({ error: { code, message, details } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Verify the add-in JWT token
 */
export async function verifyAddinToken(authHeader: string | null, functionName: string): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { 
      success: false, 
      error: { status: 401, code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } 
    };
  }

  const token = authHeader.substring(7);
  try {
    const secret = new TextEncoder().encode(ADDIN_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'unicorn-addin',
    });
    
    if (payload.purpose !== 'addin') {
      return { 
        success: false, 
        error: { status: 401, code: 'UNAUTHORIZED', message: 'Invalid token purpose' } 
      };
    }
    
    return { 
      success: true, 
      payload: payload as unknown as AddinTokenPayload 
    };
  } catch (error) {
    console.error(`[${functionName}] Token verification failed:`, error);
    return { 
      success: false, 
      error: { status: 401, code: 'UNAUTHORIZED', message: 'Invalid or expired token' } 
    };
  }
}

/**
 * Check if user has Vivacity Team role (Super Admin, Team Leader, Team Member)
 */
export function isVivacityTeamRole(role: string): boolean {
  return VIVACITY_TEAM_ROLES.includes(role);
}

/**
 * Enforce that user must be Vivacity Team member
 */
export function enforceVivacityTeamRole(tokenPayload: AddinTokenPayload): RBACResult {
  if (!isVivacityTeamRole(tokenPayload.role)) {
    console.warn(`[RBAC] Access denied for role: ${tokenPayload.role}, user: ${tokenPayload.email}`);
    return {
      success: false,
      error: {
        status: 403,
        code: 'FORBIDDEN',
        message: 'Access restricted to Vivacity Team members only.',
        details: { required_roles: VIVACITY_TEAM_ROLES },
      },
    };
  }
  return { success: true };
}

/**
 * Verify user has access to the specified client/tenant
 */
/**
 * Verify user has access to the specified client/tenant
 * Uses the consolidated has_tenant_access_safe RPC which checks:
 * - SuperAdmin status (unicorn_role or global_role)
 * - Vivacity Team membership (with archived check)
 * - Active tenant_members entry (status = 'active')
 */
export async function verifyClientAccess(
  userUuid: string, 
  clientId: string | number,
  functionName: string
): Promise<RBACResult> {
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const clientIdNum = typeof clientId === 'string' ? parseInt(clientId, 10) : clientId;
  
  // Use the consolidated safe RPC for tenant access
  const { data: hasAccess, error } = await supabaseAdmin.rpc('has_tenant_access_safe', {
    p_tenant_id: clientIdNum,
    p_user_id: userUuid,
  });

  if (error) {
    console.error(`[${functionName}] Tenant access check error:`, error);
    return {
      success: false,
      error: {
        status: 500,
        code: 'DATABASE_ERROR',
        message: 'Failed to verify client access',
      },
    };
  }

  if (!hasAccess) {
    return {
      success: false,
      error: {
        status: 403,
        code: 'CLIENT_ACCESS_DENIED',
        message: 'You do not have access to this client.',
        details: { client_id: clientIdNum },
      },
    };
  }

  return { success: true };
}

/**
 * Create Supabase admin client
 */
export function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Log failed action to audit events
 */
export async function logFailedAction(
  functionName: string,
  action: string,
  userUuid: string | null,
  errorCode: string,
  errorMessage: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabaseAdmin = createAdminClient();
    await supabaseAdmin
      .from('audit_events')
      .insert({
        action: `${action}_failed`,
        entity: 'addin',
        entity_id: functionName,
        user_id: userUuid,
        details: {
          error_code: errorCode,
          error_message: errorMessage,
          ...details,
          timestamp: new Date().toISOString(),
        },
      });
  } catch (err) {
    console.error(`[${functionName}] Failed to log audit event:`, err);
  }
}
