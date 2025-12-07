import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type UnicornRole = 
  | "Super Admin"
  | "Team Leader"
  | "Team Member"
  | "Admin"
  | "User";

type Payload = {
  email: string;
  first_name: string;
  last_name: string;
  invite_as: 'VIVACITY' | 'CLIENT';
  tenant_id: number;
  unicorn_role: UnicornRole;
};

const VIVACITY_TENANT_ID = 319;
const VIVACITY_ROLES: UnicornRole[] = [
  "Super Admin",
  "Team Leader",
  "Team Member",
];
const CLIENT_ROLES: UnicornRole[] = ["Admin", "User"];

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function isRoleAllowed(tenant_id: number, unicorn_role: UnicornRole) {
  if (tenant_id === VIVACITY_TENANT_ID) return VIVACITY_ROLES.includes(unicorn_role);
  return CLIENT_ROLES.includes(unicorn_role);
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Create service role client (bypasses RLS)
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // 1. Validate caller's auth token
    const callerToken = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!callerToken) {
      return jsonResponse(401, {
        ok: false,
        code: "NO_AUTH",
        detail: "Missing Authorization header",
      });
    }

    // 2. Get caller's user info
    const { data: callerUser, error: callerErr } = await supabase.auth.getUser(callerToken);
    if (callerErr || !callerUser?.user) {
      return jsonResponse(401, {
        ok: false,
        code: "AUTH_FAILED",
        detail: callerErr?.message || "Unable to authenticate caller",
      });
    }

    // 3. Verify caller is Super Admin
    const { data: callerProfile, error: roleErr } = await supabase
      .from("users")
      .select("unicorn_role")
      .eq("user_uuid", callerUser.user.id)
      .maybeSingle();

    if (roleErr) {
      return jsonResponse(500, {
        ok: false,
        code: "ROLE_LOOKUP_FAILED",
        detail: roleErr.message,
      });
    }

    if (!callerProfile || !["Super Admin", "SuperAdmin"].includes(callerProfile.unicorn_role)) {
      return jsonResponse(403, {
        ok: false,
        code: "FORBIDDEN",
        detail: "Only Super Admins can invite users",
      });
    }

    // 4. Parse and validate payload
    let payload: Payload;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse(400, {
        ok: false,
        code: "BAD_JSON",
        detail: "Request body must be valid JSON",
      });
    }

    if (!payload.email || !payload.first_name || !payload.unicorn_role || typeof payload.tenant_id !== "number") {
      return jsonResponse(422, {
        ok: false,
        code: "INVALID_PAYLOAD",
        detail: "email, first_name, unicorn_role, and tenant_id are required",
      });
    }

    // Validate invite_as and tenant_id match
    if (payload.invite_as === 'CLIENT' && (!payload.tenant_id || payload.tenant_id === VIVACITY_TENANT_ID)) {
      return jsonResponse(400, {
        ok: false,
        code: "TENANT_REQUIRED",
        detail: "Tenant is required for client invites",
      });
    }

    if (payload.invite_as === 'VIVACITY' && payload.tenant_id !== VIVACITY_TENANT_ID) {
      return jsonResponse(400, {
        ok: false,
        code: "INVALID_TENANT",
        detail: `Vivacity users must be assigned to tenant ${VIVACITY_TENANT_ID}`,
      });
    }

    if (!isValidEmail(payload.email)) {
      return jsonResponse(400, {
        ok: false,
        code: "INVALID_EMAIL",
        detail: "Please provide a valid email address",
      });
    }

    if (!isRoleAllowed(payload.tenant_id, payload.unicorn_role)) {
      return jsonResponse(400, {
        ok: false,
        code: "ROLE_NOT_ALLOWED",
        detail: `Role ${payload.unicorn_role} is not allowed for this tenant`,
      });
    }

    // 5. Verify tenant exists
    const { data: tenantData, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("id", payload.tenant_id)
      .maybeSingle();

    if (tenantError) {
      return jsonResponse(500, {
        ok: false,
        code: "TENANT_LOOKUP_FAILED",
        detail: tenantError.message,
      });
    }

    if (!tenantData) {
      return jsonResponse(404, {
        ok: false,
        code: "TENANT_NOT_FOUND",
        detail: `Tenant ${payload.tenant_id} does not exist`,
      });
    }

    // 6. Check if user already exists in auth
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === payload.email);

    if (existingUser) {
      console.log(`User ${payload.email} already exists with ID ${existingUser.id}. They will be added to the tenant when they accept.`);
      // Don't create duplicate invitations for existing users
      // They should accept the invitation to be added to this tenant
    }

    // 7. Generate invitation token
    const inviteToken = crypto.randomUUID();
    const encoder = new TextEncoder();
    const data = encoder.encode(inviteToken);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Create invitation record with 24-hour expiration
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const { error: inviteError } = await supabase
      .from('user_invitations')
      .insert({
        email: payload.email.toLowerCase(),
        first_name: payload.first_name,
        last_name: payload.last_name,
        tenant_id: payload.tenant_id,
        unicorn_role: payload.unicorn_role,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        invited_by: callerUser.user.id,
        status: 'pending',
      });

    if (inviteError) {
      console.error("Failed to create invitation:", inviteError);
      return jsonResponse(500, {
        ok: false,
        code: "INVITATION_CREATE_FAILED",
        detail: inviteError.message,
      });
    }

    // 8. Create invite URL using the frontend origin
    // The origin header should contain the lovable.app domain
    const frontendOrigin = req.headers.get("origin") || req.headers.get("referer")?.split('/').slice(0, 3).join('/');
    
    if (!frontendOrigin) {
      console.error('Warning: No origin header found in request. Invite URL may not work correctly.');
    }
    
    const inviteUrl = `${frontendOrigin}/accept-invitation?token=${inviteToken}`;
    console.log('Generated invite URL:', inviteUrl);
    
    // Try to send custom invitation email (optional - fails gracefully if SendGrid not configured)
    try {
      await supabase.functions.invoke('send-invitation-email', {
        body: {
          email: payload.email,
          inviteUrl,
          userType: payload.invite_as === 'VIVACITY' ? 'vivacity' : 'client',
        }
      });
      console.log(`Custom invitation email sent to ${payload.email}`);
    } catch (emailError) {
      console.warn('Failed to send invitation email (SendGrid may not be configured):', emailError);
      // Continue anyway - admin can manually share the invite URL
    }

    // Note: User profile and tenant membership will be created when they accept the invitation
    // This ensures a clean signup flow without pre-creating user accounts

    // 10. Track invite attempts and log
    // Get previous attempts count for this email/tenant combo
    const { data: prevInvites } = await supabase
      .from("audit_invites")
      .select("invite_attempts")
      .eq("email", payload.email.toLowerCase())
      .eq("tenant_id", payload.tenant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const attemptCount = (prevInvites?.invite_attempts || 0) + 1;

    // Log successful invite with attempt count
    await supabase.from("audit_invites").insert({
      email: payload.email.toLowerCase(),
      tenant_id: payload.tenant_id,
      role: payload.unicorn_role,
      outcome: "success",
      invite_attempts: attemptCount,
      actor_user_id: callerUser.user.id,
    });

    // General audit log
    await supabase.from("audit_eos_events").insert({
      tenant_id: payload.tenant_id,
      entity: "tenant_members",
      action: "invite_user",
      reason: "User invited via admin panel",
      details: { email: payload.email, tenant_id: payload.tenant_id, unicorn_role: payload.unicorn_role, attempt: attemptCount },
    });

    console.log(`Successfully invited ${payload.email} to tenant ${payload.tenant_id} with role ${payload.unicorn_role} (attempt ${attemptCount})`);

    return jsonResponse(200, {
      ok: true,
      detail: "Invitation sent successfully",
      inviteUrl: `${req.headers.get("origin") || SUPABASE_URL}/accept-invitation?token=${inviteToken}`,
    });
  } catch (e: any) {
    console.error("Unhandled error:", e);
    
    // Log failed invite attempt if we have enough context
    try {
      const payload: Payload = await req.clone().json();
      if (payload?.email && payload?.tenant_id) {
        // Get previous attempts
        const { data: prevInvites } = await supabase
          .from("audit_invites")
          .select("invite_attempts")
          .eq("email", payload.email.toLowerCase())
          .eq("tenant_id", payload.tenant_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const attemptCount = (prevInvites?.invite_attempts || 0) + 1;

        await supabase.from("audit_invites").insert({
          email: payload.email.toLowerCase(),
          tenant_id: payload.tenant_id,
          role: payload.unicorn_role || "UNKNOWN",
          outcome: "failure",
          code: "UNHANDLED_ERROR",
          detail: e?.message || String(e),
          invite_attempts: attemptCount,
        });
      }
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }
    
    return jsonResponse(500, {
      ok: false,
      code: "UNHANDLED_ERROR",
      detail: e?.message || String(e),
    });
  }
});
