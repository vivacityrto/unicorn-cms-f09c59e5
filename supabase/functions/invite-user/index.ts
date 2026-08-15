import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type UnicornRole =
  | "Super Admin" | "Team Leader" | "Team Member"
  | "Integrator" | "BGT" | "CSC" | "CET"
  | "Admin" | "User" | "Academy User";

type RelationshipRole = 'primary_contact' | 'secondary_contact' | 'user' | 'academy_user';

type Payload = {
  email: string;
  first_name: string;
  last_name: string;
  invite_as: 'VIVACITY' | 'CLIENT';
  tenant_id: number;
  unicorn_role: UnicornRole;
  relationship_role?: RelationshipRole;
  skip_email?: boolean;
  job_title?: string | null;
  phone_number?: string | null;
};

const VIVACITY_TENANT_ID = 6372;
const VIVACITY_ROLES: UnicornRole[] = [
  "Super Admin", "Team Leader", "Team Member",
  "Integrator", "BGT", "CSC", "CET",
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
      .select("unicorn_role, global_role, tenant_id")
      .eq("user_uuid", callerUser.user.id)
      .maybeSingle();

    if (roleErr) {
      console.error("Role lookup error:", roleErr);
      return jsonResponse(500, {
        ok: false,
        code: "ROLE_LOOKUP_FAILED",
        detail: "Unable to verify user permissions",
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

    // Check 1: Is caller a Vivacity internal team member?
    // Allows ALL internal staff (SA, TL, INT, BGT, CSC, CET) to invite CLIENT users.
    const { data: isVivacityTeamCheck } = await supabase.rpc('is_vivacity_team_safe', {
      p_user_id: callerUser.user.id,
    });
    const isVivacityStaff = !!isVivacityTeamCheck;

    // Check 2: Can caller manage Vivacity team users? (SA only)
    const { data: vivacityAllowed } = await supabase.rpc('check_permission', {
      p_user_id: callerUser.user.id,
      p_feature_key: 'admin.team_users.manage',
      p_min_level: 'full',
    });
    const canManageVivacityUsers = !!vivacityAllowed;
    const isSuperAdmin = canManageVivacityUsers;
    const isTenantAdmin = !isVivacityStaff && callerProfile.unicorn_role === 'Admin';

    if (!isVivacityStaff && !isTenantAdmin) {
      return jsonResponse(403, {
        ok: false,
        code: "FORBIDDEN",
        detail: "You don't have permission to invite users to this tenant",
      });
    }

    // VIVACITY invitations require admin.team_users.manage (Super Admin only).
    // The DB trigger trg_enforce_invitation_role_ceiling on public.user_invitations
    // mirrors this for direct PostgREST writes; service-role callers (this fn) are
    // short-circuited by the trigger via request.jwt.claim.role = 'service_role'.
    if (payload.invite_as === 'VIVACITY' && !canManageVivacityUsers) {
      return jsonResponse(403, {
        ok: false,
        code: "FORBIDDEN",
        detail: "Only a Super Admin may invite Vivacity team members",
      });
    }

    // ── Per-membership user cap ─────────────────────────────────────────────
    // Vivacity staff bypass entirely.
    async function assertCapacity(): Promise<Response | null> {
      if (isVivacityStaff || isSuperAdmin) return null;
      const { data: capRows, error: capErr } = await supabase.rpc(
        'get_tenant_user_capacity',
        { p_tenant_id: payload.tenant_id },
      );
      if (capErr) {
        console.error('[capacity] rpc error:', capErr);
        return jsonResponse(500, {
          ok: false,
          code: 'CAPACITY_CHECK_FAILED',
          detail: 'Unable to verify user capacity',
        });
      }
      const cap = Array.isArray(capRows) ? capRows[0] : capRows;
      if (cap && !cap.is_unlimited && cap.limit !== null && cap.used >= cap.limit) {
        try {
          await supabase.from('audit_invites').insert({
            tenant_id: payload.tenant_id,
            email: payload.email.toLowerCase(),
            actor_user_id: callerUser.user.id,
            role: payload.unicorn_role ?? null,
            outcome: 'rejected_user_limit',
            code: 'USER_LIMIT_REACHED',
            detail: `cap ${cap.used}/${cap.limit}`,
          });
        } catch (_) { /* swallow audit failure */ }
        return jsonResponse(403, {
          ok: false,
          code: 'USER_LIMIT_REACHED',
          detail: 'User limit reached for this membership. Contact Vivacity to add more users.',
        });
      }
      return null;
    }

    // For tenant admins, verify they belong to the target tenant
    if (isTenantAdmin) {
      const { data: memberCheck } = await supabase
        .from('tenant_users')
        .select('id')
        .eq('user_id', callerUser.user.id)
        .eq('tenant_id', payload.tenant_id)
        .maybeSingle();

      if (!memberCheck) {
        return jsonResponse(403, {
          ok: false,
          code: "FORBIDDEN",
          detail: "You can only invite users to your own organisation",
        });
      }
    }

    // Tenant admins can only invite Academy users, a Secondary contact, or a Full access user via the client portal
    if (isTenantAdmin && payload.invite_as === 'CLIENT') {
      const allowed = ['academy_user', 'secondary_contact', 'user'];
      if (!payload.relationship_role || !allowed.includes(payload.relationship_role)) {
        return jsonResponse(403, {
          ok: false,
          code: "RELATIONSHIP_ROLE_NOT_ALLOWED",
          detail: "Primary/secondary contacts can only invite Academy users, a Secondary contact, or a Full access user.",
        });
      }
    }


    // Tenant admins can only assign Admin or User roles (not Super Admin, Team Leader, etc.)
    if (!isVivacityStaff && !CLIENT_ROLES.includes(payload.unicorn_role)) {
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

    // Validate relationship_role (optional).
    if (payload.relationship_role) {
      const allowedRR: RelationshipRole[] = ['primary_contact', 'secondary_contact', 'user', 'academy_user'];
      if (!allowedRR.includes(payload.relationship_role)) {
        return jsonResponse(400, {
          ok: false,
          code: "RELATIONSHIP_ROLE_NOT_ALLOWED",
          detail: `Relationship role '${payload.relationship_role}' is not valid`,
        });
      }

      // Primary contact uniqueness: at most one active or pending per tenant.
      // IMPORTANT: check relationship_role column, NOT the primary_contact boolean —
      // the boolean is unreliable (trigger sets it true for all parent-role rows).
      if (payload.relationship_role === 'primary_contact') {
        const { data: existingPrimary } = await supabase
          .from('tenant_users')
          .select('id')
          .eq('tenant_id', payload.tenant_id)
          .eq('relationship_role', 'primary_contact')
          .limit(1)
          .maybeSingle();

        if (existingPrimary) {
          return jsonResponse(409, {
            ok: false,
            code: "PRIMARY_CONTACT_TAKEN",
            detail: "This organisation already has a primary contact. Use the transfer flow to reassign.",
          });
        }

        const { data: pendingPrimary } = await supabase
          .from('user_invitations')
          .select('id')
          .eq('tenant_id', payload.tenant_id)
          .eq('relationship_role', 'primary_contact')
          .eq('status', 'pending')
          .is('revoked_at', null)
          .gt('expires_at', new Date().toISOString())
          .limit(1)
          .maybeSingle();

        if (pendingPrimary) {
          return jsonResponse(409, {
            ok: false,
            code: "PRIMARY_CONTACT_PENDING",
            detail: "A pending invitation already nominates someone as primary contact.",
          });
        }
      }

      // Secondary contact uniqueness: at most one active or pending per tenant.
      if (payload.relationship_role === 'secondary_contact') {
        const { data: existingSecondary } = await supabase
          .from('tenant_users')
          .select('id')
          .eq('tenant_id', payload.tenant_id)
          .eq('relationship_role', 'secondary_contact')
          .limit(1)
          .maybeSingle();

        if (existingSecondary) {
          return jsonResponse(409, {
            ok: false,
            code: "SECONDARY_CONTACT_TAKEN",
            detail: "This organisation already has a secondary contact.",
          });
        }

        const { data: pendingSecondary } = await supabase
          .from('user_invitations')
          .select('id')
          .eq('tenant_id', payload.tenant_id)
          .eq('relationship_role', 'secondary_contact')
          .eq('status', 'pending')
          .is('accepted_at', null)
          .is('revoked_at', null)
          .gt('expires_at', new Date().toISOString())
          .limit(1)
          .maybeSingle();

        if (pendingSecondary) {
          return jsonResponse(409, {
            ok: false,
            code: "SECONDARY_CONTACT_PENDING",
            detail: "A pending invite already nominates someone as secondary contact.",
          });
        }
      }
    }

    // 4b. Rate limiting - check recent invite attempts for this email
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: recentAttempts } = await supabase
      .from('audit_invites')
      .select('created_at')
      .eq('email', payload.email.toLowerCase())
      .gte('created_at', oneHourAgo);

    if (recentAttempts && recentAttempts.length >= 5) {
      return jsonResponse(429, {
        ok: false,
        code: 'RATE_LIMIT_EXCEEDED',
        detail: 'Too many invitation attempts for this email. Please try again later.',
      });
    }

    // 5. Verify tenant exists
    const { data: tenantData, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("id", payload.tenant_id)
      .maybeSingle();

    if (tenantError) {
      console.error("Tenant lookup error:", tenantError);
      return jsonResponse(500, {
        ok: false,
        code: "TENANT_LOOKUP_FAILED",
        detail: "Unable to verify tenant",
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

    // --- SKIP EMAIL PATH: create users + tenant_users + tenant_members directly ---
    if (payload.skip_email) {
      const capReject = await assertCapacity();
      if (capReject) return capReject;
      console.log(`[skip_email] Adding ${payload.email} directly without invitation`);

      // Resolve final relationship_role. relationship_role is the source of truth;
      // never infer academy from unicorn_role alone.
      let v_relationship_role: RelationshipRole | null;
      const isVivacityTarget = payload.invite_as === 'VIVACITY';
      if (payload.relationship_role) {
        v_relationship_role = payload.relationship_role;
      } else if (isVivacityTarget) {
        v_relationship_role = null;
      } else if (payload.unicorn_role === 'Admin') {
        v_relationship_role = 'primary_contact';
      } else {
        v_relationship_role = 'user';
      }

      // Derive all dependent fields from v_relationship_role using the authoritative mapping.
      let v_tu_role: 'parent' | 'child';
      let v_tu_primary: boolean;
      let v_tu_secondary: boolean;
      let v_tu_access_scope: 'full' | 'academy_only';
      let v_u_unicorn_role: string;
      let v_u_user_type: string;
      let v_tm_role: 'Admin' | 'General User';
      let v_tm_status: 'active' | 'inactive';
      switch (v_relationship_role) {
        case 'primary_contact':
          v_tu_role = 'parent'; v_tu_primary = true;  v_tu_secondary = false; v_tu_access_scope = 'full';
          v_u_unicorn_role = 'Admin'; v_u_user_type = 'Client Parent';
          v_tm_role = 'Admin'; v_tm_status = 'active';
          break;
        case 'secondary_contact':
          v_tu_role = 'parent'; v_tu_primary = false; v_tu_secondary = true;  v_tu_access_scope = 'full';
          v_u_unicorn_role = 'Admin'; v_u_user_type = 'Client Parent';
          v_tm_role = 'Admin'; v_tm_status = 'active';
          break;
        case 'academy_user':
          v_tu_role = 'child'; v_tu_primary = false; v_tu_secondary = false; v_tu_access_scope = 'academy_only';
          v_u_unicorn_role = 'Academy User'; v_u_user_type = 'Client Child';
          v_tm_role = 'General User'; v_tm_status = 'inactive';
          break;
        case 'user':
        default:
          v_tu_role = 'child'; v_tu_primary = false; v_tu_secondary = false; v_tu_access_scope = 'full';
          v_u_unicorn_role = 'User'; v_u_user_type = 'Client Child';
          v_tm_role = 'General User'; v_tm_status = 'active';
      }
      // Internal Vivacity targets keep the supplied unicorn_role and become Vivacity Team.
      if (isVivacityTarget) {
        v_u_unicorn_role = payload.unicorn_role;
        v_u_user_type = 'Vivacity Team';
        v_tm_role = 'Admin';
        v_tm_status = 'active';
      }

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
        // Allowlisted insert: named columns + server-computed role/type. Never spread body.
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            user_uuid: userUuid,
            email: payload.email.toLowerCase(),
            first_name: payload.first_name.trim(),
            last_name: (payload.last_name || '-').trim(),
            unicorn_role: v_u_unicorn_role,
            user_type: v_u_user_type,
            is_team: isVivacityTarget,
            disabled: false,
            job_title: payload.job_title || null,
            phone: payload.phone_number || null,
            tenant_id: payload.tenant_id,
          });

        if (insertError) {
          console.error('[skip_email] Failed to create user:', insertError);
          return jsonResponse(500, {
            ok: false,
            code: 'USER_CREATE_FAILED',
            detail: 'Unable to create user record',
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
        console.log(`[skip_email] ${payload.email} is already a member of tenant ${payload.tenant_id}, returning success`);
        return jsonResponse(200, {
          ok: true,
          detail: `${payload.email} is already a member of this tenant`,
          user_uuid: userUuid,
          skipped_email: true,
          already_member: true,
        });
      }

      // Create tenant_users association (do NOT write tenant_users.updated_at — column does not exist)
      const { error: tuError } = await supabase
        .from('tenant_users')
        .insert({
          user_id: userUuid,
          tenant_id: payload.tenant_id,
          role: v_tu_role,
          primary_contact: v_tu_primary,
          secondary_contact: v_tu_secondary,
          access_scope: v_tu_access_scope,
          relationship_role: v_relationship_role,
        });

      if (tuError) {
        console.error('[skip_email] Failed to create tenant_users:', tuError);
        return jsonResponse(500, {
          ok: false,
          code: 'TENANT_USER_CREATE_FAILED',
          detail: 'Unable to add user to tenant',
        });
      }

      // Mirror into tenant_members
      const { error: tmError } = await supabase
        .from('tenant_members')
        .upsert(
          {
            tenant_id: payload.tenant_id,
            user_id: userUuid,
            role: v_tm_role,
            status: v_tm_status,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,user_id' }
        );
      if (tmError) {
        console.error('[skip_email] Failed to upsert tenant_members:', tmError);
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
          unicorn_role: v_u_unicorn_role,
          user_type: v_u_user_type,
          relationship_role: v_relationship_role,
          access_scope: v_tu_access_scope,
          tu_role: v_tu_role,
          primary_contact: v_tu_primary,
          secondary_contact: v_tu_secondary,
          tm_role: v_tm_role,
          tm_status: v_tm_status,
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
    const capReject = await assertCapacity();
    if (capReject) return capReject;

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
    const { data: insertedInvite, error: inviteError } = await supabase
      .from('user_invitations')
      .insert({
        email: payload.email.toLowerCase(),
        first_name: payload.first_name,
        last_name: payload.last_name,
        tenant_id: payload.tenant_id,
        unicorn_role: payload.unicorn_role,
        relationship_role: payload.relationship_role ?? null,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        invited_by: callerUser.user.id,
        status: 'pending',
      })
      .select('id')
      .single();

    if (inviteError || !insertedInvite) {
      console.error("Failed to create invitation:", inviteError);
      return jsonResponse(500, {
        ok: false,
        code: "INVITATION_CREATE_FAILED",
        detail: "Unable to create invitation",
      });
    }

    // 8. Send invitation email via custom function (uses APP_BASE_URL on the server)
    try {
      const { error: emailErr } = await supabase.functions.invoke('send-invitation-email', {
        body: {
          invitation_id: insertedInvite.id,
          token_plaintext: inviteToken,
        },
        // Deno's functions.invoke does not auto-forward the service-role token;
        // send-invitation-email requires it for its trusted-internal path.
        headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      });
      if (emailErr) {
        console.warn('send-invitation-email returned error:', emailErr);
      } else {
        console.log(`Invitation email dispatched for ${payload.email} (invitation ${insertedInvite.id})`);
      }
    } catch (emailError) {
      console.warn('Failed to invoke send-invitation-email:', emailError);
    }

    const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") || "https://unicorn-cms.au").replace(/\/+$/, "");
    const inviteUrl = `${APP_BASE_URL}/accept-invitation?token=${inviteToken}`;

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
      invitation_id: insertedInvite.id,
      inviteUrl,
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
      code: "INTERNAL_ERROR",
      detail: "An unexpected error occurred",
    });
  }
});
