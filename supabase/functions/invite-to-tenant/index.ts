import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as buildCorsHeaders } from "../_shared/cors.ts";

const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") || "https://unicorn-cms.au").replace(/\/+$/, "");

// Tenant-scoped invites (this function has no VIVACITY invite_as branch, unlike
// invite-user) may only assign client-safe roles. Inviting Vivacity staff with
// an elevated role (Super Admin, Team Leader, etc.) must go through invite-user,
// which enforces admin.team_users.manage for that path.
const CLIENT_ROLES = ["Admin", "User"];

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ ok: false, code: "NO_AUTH", detail: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, code: "AUTH_FAILED", detail: authErr?.message || "Unable to authenticate caller" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, code: "BAD_JSON", detail: "Request body must be valid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, tenantId, role } = body as { email?: string; tenantId?: unknown; role?: string };

    if (!email || !tenantId || !role) {
      return new Response(JSON.stringify({ ok: false, code: "MISSING_FIELDS", detail: "email, tenantId, and role are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!CLIENT_ROLES.includes(role)) {
      return new Response(JSON.stringify({ ok: false, code: "ROLE_NOT_ALLOWED", detail: `Role '${role}' is not allowed for a tenant invite. Use invite-user for Vivacity staff roles.` }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization gate: allow if admin.invites.manage (full) OR tenant admin for this tenant
    const { data: canManageInvites } = await supabase.rpc("check_permission", {
      p_user_id: user.id,
      p_feature_key: "admin.invites.manage",
      p_min_level: "full",
    });

    let authorized = !!canManageInvites;

    if (!authorized) {
      const { data: isTenantAdmin } = await supabase.rpc("has_tenant_admin_safe", {
        p_tenant_id: Number(tenantId),
        p_user_id: user.id,
      });
      authorized = !!isTenantAdmin;
    }

    if (!authorized) {
      return new Response(JSON.stringify({ ok: false, code: "FORBIDDEN", detail: "Insufficient permissions to invite to this tenant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate invite token
    const inviteToken = crypto.randomUUID();
    const encoder = new TextEncoder();
    const data = encoder.encode(inviteToken);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const { error: insertErr } = await supabase.from("user_invitations").insert({
      email: (email as string).toLowerCase(),
      tenant_id: Number(tenantId),
      unicorn_role: role,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      invited_by: user.id,
      status: "pending",
    });

    if (insertErr) {
      console.error("Failed to create invitation:", insertErr);
      return new Response(JSON.stringify({ ok: false, code: "INVITATION_CREATE_FAILED", detail: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inviteLink = `${APP_BASE_URL}/accept-invitation?token=${inviteToken}`;
    console.log(`Generated invite link for ${email} (tenant ${tenantId})`);

    // Best-effort: send invitation email
    try {
      await supabase.functions.invoke("send-invitation-email", {
        body: {
          email: (email as string).toLowerCase(),
          inviteUrl: inviteLink,
          userType: "client",
        },
      });
      console.log(`Invitation email sent to ${email}`);
    } catch (emailErr) {
      console.warn("Failed to send invitation email (non-fatal):", emailErr);
    }

    // Best-effort audit log
    try {
      await supabase.from("audit_invites").insert({
        email: (email as string).toLowerCase(),
        tenant_id: Number(tenantId),
        role: role as string,
        outcome: "success",
        invite_attempts: 1,
        actor_user_id: user.id,
      });
    } catch (auditErr) {
      console.warn("Audit log failed (non-fatal):", auditErr);
    }

    return new Response(JSON.stringify({ ok: true, inviteLink }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", detail: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
