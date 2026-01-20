import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

    // Parse payload
    let payload: { invitation_id: string };
    try {
      payload = await req.json();
    } catch {
      return jsonResponse(400, {
        ok: false,
        code: "BAD_JSON",
        detail: "Request body must be valid JSON",
      });
    }

    if (!payload.invitation_id) {
      return jsonResponse(422, {
        ok: false,
        code: "INVALID_PAYLOAD",
        detail: "invitation_id is required",
      });
    }

    // 4. Fetch the existing invitation
    const { data: invitation, error: inviteErr } = await supabase
      .from("user_invitations")
      .select("*")
      .eq("id", payload.invitation_id)
      .maybeSingle();

    if (inviteErr) {
      return jsonResponse(500, {
        ok: false,
        code: "INVITE_LOOKUP_FAILED",
        detail: inviteErr.message,
      });
    }

    if (!invitation) {
      return jsonResponse(404, {
        ok: false,
        code: "INVITE_NOT_FOUND",
        detail: "Invitation not found",
      });
    }

    // 5. Check permissions
    const isSuperAdmin = callerProfile.global_role === 'SuperAdmin';
    const isTenantAdmin = callerProfile.tenant_id === invitation.tenant_id && 
      (callerProfile.unicorn_role === 'Admin' || callerProfile.tenant_role === 'admin');

    if (!isSuperAdmin && !isTenantAdmin) {
      return jsonResponse(403, {
        ok: false,
        code: "FORBIDDEN",
        detail: "You don't have permission to resend this invitation",
      });
    }

    // 6. Check if invitation was already accepted
    if (invitation.status === 'accepted' || invitation.accepted_at) {
      return jsonResponse(400, {
        ok: false,
        code: "INVITE_ALREADY_ACCEPTED",
        detail: "This invitation has already been accepted",
      });
    }

    // 7. Generate new token
    const newToken = crypto.randomUUID();
    const encoder = new TextEncoder();
    const data = encoder.encode(newToken);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const newTokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // New expiration: 24 hours from now
    const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 8. Update invitation with new token and expiration
    const { error: updateErr } = await supabase
      .from("user_invitations")
      .update({
        token_hash: newTokenHash,
        expires_at: newExpiresAt.toISOString(),
        last_sent_at: new Date().toISOString(),
        status: 'pending', // Reset to pending in case it was expired
      })
      .eq("id", payload.invitation_id);

    if (updateErr) {
      console.error("Failed to update invitation:", updateErr);
      return jsonResponse(500, {
        ok: false,
        code: "UPDATE_FAILED",
        detail: updateErr.message,
      });
    }

    // 9. Create invite URL
    const frontendOrigin = req.headers.get("origin") || req.headers.get("referer")?.split('/').slice(0, 3).join('/');
    const inviteUrl = `${frontendOrigin}/accept-invitation?token=${newToken}`;
    console.log('Generated resend invite URL:', inviteUrl);

    // 10. Determine user type based on tenant
    const VIVACITY_TENANT_ID = 319;
    const userType = invitation.tenant_id === VIVACITY_TENANT_ID ? 'vivacity' : 'client';

    // 11. Send invitation email
    try {
      await supabase.functions.invoke('send-invitation-email', {
        body: {
          email: invitation.email,
          inviteUrl,
          userType,
        }
      });
      console.log(`Resent invitation email to ${invitation.email}`);
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
      return jsonResponse(500, {
        ok: false,
        code: "EMAIL_SEND_FAILED",
        detail: "Failed to send invitation email",
      });
    }

    // 12. Log the resend in audit tables
    // Get previous attempts count
    const { data: prevInvites } = await supabase
      .from("audit_invites")
      .select("invite_attempts")
      .eq("email", invitation.email.toLowerCase())
      .eq("tenant_id", invitation.tenant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const attemptCount = (prevInvites?.invite_attempts || 0) + 1;

    await supabase.from("audit_invites").insert({
      email: invitation.email.toLowerCase(),
      tenant_id: invitation.tenant_id,
      role: invitation.unicorn_role,
      outcome: "resend_success",
      invite_attempts: attemptCount,
      actor_user_id: callerUser.user.id,
      detail: `Invitation resent by ${callerUser.user.email}`,
    });

    await supabase.from("audit_eos_events").insert({
      tenant_id: invitation.tenant_id,
      entity: "user_invitations",
      action: "resend_invite",
      entity_id: payload.invitation_id,
      user_id: callerUser.user.id,
      reason: "Invitation resent",
      details: { 
        email: invitation.email, 
        tenant_id: invitation.tenant_id, 
        unicorn_role: invitation.unicorn_role,
        attempt: attemptCount 
      },
    });

    console.log(`Successfully resent invitation to ${invitation.email} (attempt ${attemptCount})`);

    return jsonResponse(200, {
      ok: true,
      detail: "Invitation resent successfully",
      email: invitation.email,
    });

  } catch (e: any) {
    console.error("Unhandled error:", e);
    return jsonResponse(500, {
      ok: false,
      code: "UNHANDLED_ERROR",
      detail: e?.message || String(e),
    });
  }
});
