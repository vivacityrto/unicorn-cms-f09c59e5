import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { APP_BASE_URL } from "../_shared/app-base-url.ts";

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
    let payload: { invitation_id: string; skip_email?: boolean };
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

    // 5. Check permissions: Vivacity staff via central RPC OR a tenant Admin who is a member of the invitation's tenant.
    const { data: staffAllowed } = await supabase.rpc('check_permission', {
      p_user_id: callerUser.user.id,
      p_feature_key: 'admin.invites.manage',
      p_min_level: 'full',
    });
    const isSuperAdmin = !!staffAllowed;
    let isTenantAdmin = false;
    if (!isSuperAdmin && callerProfile.unicorn_role === 'Admin') {
      const { data: membership } = await supabase
        .from('tenant_users')
        .select('id, relationship_role')
        .eq('user_id', callerUser.user.id)
        .eq('tenant_id', invitation.tenant_id)
        .maybeSingle();
      if (membership && (membership.relationship_role === 'primary_contact' || membership.relationship_role === 'secondary_contact')) {
        isTenantAdmin = true;
      }
    }

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

    // New expiration: 7 days from now
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 8. Update invitation with new token and expiration
    // NOTE: last_sent_at is intentionally NOT updated here — it is only stamped
    // after a successful Mailgun dispatch below, so failures don't produce a
    // misleading "resent" timestamp with no message ID.
    const { error: updateErr } = await supabase
      .from("user_invitations")
      .update({
        token_hash: newTokenHash,
        expires_at: newExpiresAt.toISOString(),
        status: 'pending', // Reset to pending in case it was expired
        delivery_status: null,
        delivery_event_at: null,
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
    const inviteUrl = `${APP_BASE_URL}/accept-invitation?token=${newToken}`;
    console.log('Generated resend invite URL:', inviteUrl);

    // 10. Determine user type based on tenant
    const VIVACITY_TENANT_ID = 6372;
    const userType = invitation.tenant_id === VIVACITY_TENANT_ID ? 'vivacity' : 'client';

    // 10b. Handle skip_email — generate link only, no send, no audit_invites
    if (payload.skip_email === true) {
      // Stamp last_sent_at so the UI reflects the link-generation event
      await supabase
        .from("user_invitations")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("id", payload.invitation_id);

      await supabase.from("audit_eos_events").insert({
        tenant_id: invitation.tenant_id,
        entity: "user_invitations",
        action: "copy_invite_link",
        entity_id: payload.invitation_id,
        user_id: callerUser.user.id,
        reason: "Invitation link generated without sending email",
        details: {
          email: invitation.email,
          tenant_id: invitation.tenant_id,
          unicorn_role: invitation.unicorn_role,
        },
      });

      console.log(`Generated invite link without sending email for ${invitation.email}`);

      return jsonResponse(200, {
        ok: true,
        action_link: inviteUrl, // inviteUrl built from APP_BASE_URL
        detail: "Link generated without sending email",
        email: invitation.email,
      });
    }

    // 11. Send invitation email — surface real failures instead of swallowing them.
    // supabase.functions.invoke returns { data, error } and does NOT throw on
    // HTTP errors, so we must inspect BOTH the error field and data.ok.
    let sendErrorDetail: string | null = null;
    let sendErrorCode: string | null = null;
    try {
      const { data: sendData, error: sendErr } = await supabase.functions.invoke(
        'send-invitation-email',
        {
          body: { invitation_id: payload.invitation_id, token_plaintext: newToken },
          // Explicitly forward the service-role bearer — Deno's functions.invoke
          // does not auto-attach it, and send-invitation-email requires it for
          // its trusted-internal path.
          headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        },
      );

      if (sendErr) {
        // Try to pull the JSON body from the FunctionsHttpError context.
        let bodyDetail: string | null = null;
        let bodyCode: string | null = null;
        const ctx = (sendErr as { context?: Response }).context;
        if (ctx && typeof ctx.text === 'function') {
          try {
            const txt = await ctx.text();
            try {
              const parsed = JSON.parse(txt);
              bodyDetail = parsed?.detail || parsed?.error || txt;
              bodyCode = parsed?.code ?? null;
            } catch {
              bodyDetail = txt;
            }
          } catch { /* ignore */ }
        }
        sendErrorDetail = bodyDetail || sendErr.message || 'send-invitation-email failed';
        sendErrorCode = bodyCode;
      } else if (sendData && sendData.ok === false) {
        sendErrorDetail = sendData.detail || sendData.error || 'send-invitation-email returned ok=false';
        sendErrorCode = sendData.code ?? null;
      }
    } catch (emailError) {
      sendErrorDetail = (emailError as Error)?.message || String(emailError);
    }

    if (sendErrorDetail) {
      console.error('Failed to send invitation email:', sendErrorCode, sendErrorDetail);
      await supabase.from("audit_invites").insert({
        email: invitation.email.toLowerCase(),
        tenant_id: invitation.tenant_id,
        role: invitation.unicorn_role,
        outcome: "resend_failed",
        actor_user_id: callerUser.user.id,
        detail: `Resend failed: ${sendErrorCode || ''} ${sendErrorDetail}`.trim(),
      });
      return jsonResponse(502, {
        ok: false,
        code: sendErrorCode || "EMAIL_SEND_FAILED",
        detail: sendErrorDetail,
      });
    }

    // Only stamp last_sent_at once Mailgun has accepted the message
    await supabase
      .from("user_invitations")
      .update({ last_sent_at: new Date().toISOString() })
      .eq("id", payload.invitation_id);
    console.log(`Resent invitation email to ${invitation.email}`);

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
