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
  skip_email?: boolean;
  job_title?: string | null;
  phone_number?: string | null;
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

    // 3. Get caller's profile and verify permissions
    const { data: callerProfile, error: roleErr } = await supabase
      .from("users")
      .select("unicorn_role, global_role, tenant_id, tenant_role")
      .eq("user_uuid", callerUser.user.id)
      .maybeSingle();

    if (roleErr) {
      return jsonResponse(500, {
        ok: false,
        code: "ROLE_LOOKUP_FAILED",
        detail: roleErr.message,
      });
    }

    if (!callerProfile) {
      return jsonResponse(403, {
        ok: false,
        code: "FORBIDDEN",
        detail: "User profile not found",
      });
    }

    // Parse payload early to check tenant_id for permission check
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

    // Check permissions: Super Admin can invite anyone, Tenant Admins can invite to their own tenant
    // Check global_role for SuperAdmin status
    const isSuperAdmin = callerProfile.global_role === 'SuperAdmin';
    const isTenantAdmin = callerProfile.tenant_id === payload.tenant_id && 
      (callerProfile.unicorn_role === 'Admin' || callerProfile.tenant_role === 'admin');

    if (!isSuperAdmin && !isTenantAdmin) {
      return jsonResponse(403, {
        ok: false,
        code: "FORBIDDEN",
        detail: "You don't have permission to invite users to this tenant",
      });
    }

    // Tenant admins can only invite to their own tenant
    if (!isSuperAdmin && callerProfile.tenant_id !== payload.tenant_id) {
      return jsonResponse(403, {
        ok: false,
        code: "FORBIDDEN",
        detail: "You can only invite users to your own organisation",
      });
    }

    // Tenant admins can only assign Admin or User roles (not Super Admin, Team Leader, etc.)
    if (!isSuperAdmin && !CLIENT_ROLES.includes(payload.unicorn_role)) {
      return jsonResponse(403, {
        ok: false,
        code: "FORBIDDEN",
        detail: "You can only assign Admin or User roles",
      });
    }

    // 4. Validate payload fields

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
    }

    // --- SKIP EMAIL PATH: create users + tenant_users directly ---
    if (payload.skip_email) {
      console.log(`[skip_email] Adding ${payload.email} directly without invitation`);

      // Check if user already exists in public.users
      const { data: existingProfile } = await supabase
        .from('users')
        .select('user_uuid')
        .eq('email', payload.email.toLowerCase())
        .maybeSingle();

      let userUuid: string;

      if (existingProfile) {
        userUuid = existingProfile.user_uuid;
        console.log(`[skip_email] User already exists: ${userUuid}`);
      } else {
        // Create a new user record (no auth account)
        userUuid = crypto.randomUUID();
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            user_uuid: userUuid,
            email: payload.email.toLowerCase(),
            first_name: payload.first_name.trim(),
            last_name: (payload.last_name || '-').trim(),
            unicorn_role: payload.unicorn_role,
            user_type: payload.invite_as === 'VIVACITY' ? 'Vivacity' : 'Client',
            is_team: payload.invite_as === 'VIVACITY',
            disabled: false,
            job_title: payload.job_title || null,
            phone_number: payload.phone_number || null,
          });

        if (insertError) {
          console.error('[skip_email] Failed to create user:', insertError);
          return jsonResponse(500, {
            ok: false,
            code: 'USER_CREATE_FAILED',
            detail: insertError.message,
          });
        }
        console.log(`[skip_email] Created user: ${userUuid}`);
      }

      // Check if tenant_users row already exists
      const { data: existingTu } = await supabase
        .from('tenant_users')
        .select('id')
        .eq('user_id', userUuid)
        .eq('tenant_id', payload.tenant_id)
        .maybeSingle();

      if (existingTu) {
        return jsonResponse(409, {
          ok: false,
          code: 'ALREADY_MEMBER',
          detail: `${payload.email} is already a member of this tenant`,
        });
      }

      // Create tenant_users association
      const { error: tuError } = await supabase
        .from('tenant_users')
        .insert({
          user_id: userUuid,
          tenant_id: payload.tenant_id,
          role: payload.unicorn_role === 'Admin' ? 'parent' : 'child',
        });

      if (tuError) {
        console.error('[skip_email] Failed to create tenant_users:', tuError);
        return jsonResponse(500, {
          ok: false,
          code: 'TENANT_USER_CREATE_FAILED',
          detail: tuError.message,
        });
      }

      // Audit log
      await supabase.from('audit_eos_events').insert({
        tenant_id: payload.tenant_id,
        entity: 'tenant_members',
        action: 'add_user_no_invite',
        reason: 'User added directly without invitation email',
        details: {
          email: payload.email,
          tenant_id: payload.tenant_id,
          unicorn_role: payload.unicorn_role,
          user_uuid: userUuid,
          added_by: callerUser.user.id,
        },
      });

      console.log(`[skip_email] Successfully added ${payload.email} to tenant ${payload.tenant_id}`);

      return jsonResponse(200, {
        ok: true,
        detail: 'User added successfully (no invitation sent)',
        user_uuid: userUuid,
        skipped_email: true,
      });
    }

    // --- STANDARD INVITATION PATH ---
    // 6b. Check for existing pending invitation for this email/tenant
    const { data: existingInvite } = await supabase
      .from('user_invitations')
      .select('id, created_at, expires_at')
      .eq('email', payload.email.toLowerCase())
      .eq('tenant_id', payload.tenant_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInvite) {
      const isExpired = new Date(existingInvite.expires_at) < new Date();
      
      if (!isExpired) {
        return jsonResponse(409, {
          ok: false,
          code: "INVITE_EXISTS",
          detail: `An active invitation already exists for ${payload.email}`,
        });
      }
      
      // If expired, delete old invite before creating new one
      await supabase
        .from('user_invitations')
        .delete()
        .eq('id', existingInvite.id);
      
      console.log(`Deleted expired invitation for ${payload.email}`);
    }

    // 7. Generate invitation token
    const inviteToken = crypto.randomUUID();
    const encoder = new TextEncoder();
    const data = encoder.encode(inviteToken);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Create invitation record with 7-day expiration
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
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
    const frontendOrigin = req.headers.get("origin") || req.headers.get("referer")?.split('/').slice(0, 3).join('/');
    
    if (!frontendOrigin) {
      console.error('Warning: No origin header found in request. Invite URL may not work correctly.');
    }
    
    const inviteUrl = `${frontendOrigin}/accept-invitation?token=${inviteToken}`;
    console.log('Generated invite URL:', inviteUrl);
    
    // Try to send custom invitation email
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
    }

    // 10. Track invite attempts and log
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
      role: payload.unicorn_role,
      outcome: "success",
      invite_attempts: attemptCount,
      actor_user_id: callerUser.user.id,
    });

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
