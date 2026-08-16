/**
 * send-invitation-email
 *
 * Sends the Mailgun invite template for a pending user_invitations row.
 *
 * Authorization (in-code; gateway verify_jwt alone accepts the public anon key):
 *   - Trusted internal: Authorization bearer === SUPABASE_SERVICE_ROLE_KEY
 *     (invite-user / resend-invite / activate-ghost-user invoke with the
 *     service-role client and no user JWT override)
 *   - Staff: auth.getUser(bearer) + check_permission(..., 'admin.invites.manage', 'full')
 *   - Tenant Admin: primary/secondary contact on the invitation's tenant
 *     (same scope gate as resend-invite / cancel-invite)
 *
 * Possession proof: SHA-256(token_plaintext) must equal the stored token_hash
 * for invitation_id before any email is built or sent.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { appUrl } from "../_shared/app-base-url.ts";

const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN");
const MAILGUN_FROM_EMAIL = Deno.env.get("MAILGUN_FROM_EMAIL");
const MAILGUN_FROM_NAME = Deno.env.get("MAILGUN_FROM_NAME") || "Vivacity Unicorn";
const MAILGUN_REGION = (Deno.env.get("MAILGUN_REGION") || "eu").toLowerCase();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VIVACITY_TENANT_ID = 6372;

interface RequestBody {
  invitation_id: string;
  token_plaintext: string;
}

const ROLE_LABELS: Record<string, string> = {
  "Super Admin": "Super Admin",
  "Team Leader": "Team Leader",
  "Team Member": "Team Member",
  "Integrator": "Integrator",
  "BGT": "Business Growth Team",
  "CSC": "Client Success Champion",
  "CET": "Client Experience Team",
  Admin: "Organisation Admin",
  User: "General User",
  "Academy User": "Academy User",
};

function jsonResponse(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

function formatExpiry(expiresAt: string): string {
  // dd/MM/yyyy (Australian)
  try {
    const d = new Date(expiresAt);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return expiresAt;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time hex string compare (equal length required). */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    // ── 1. Authenticate caller ────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!bearer) {
      return jsonResponse(req, 401, { error: "Missing Authorization header" });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Trusted internal path: invite-user / resend-invite / activate-ghost-user
    // invoke with the service-role client (bearer === SERVICE_ROLE_KEY).
    const isTrustedInternalCall = bearer === SERVICE_ROLE_KEY;

    let callerId: string | null = null;
    if (!isTrustedInternalCall) {
      const { data: callerData, error: callerErr } = await supabase.auth.getUser(bearer);
      if (callerErr || !callerData?.user) {
        return jsonResponse(req, 401, { error: "Unauthorized" });
      }
      callerId = callerData.user.id;
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────
    const body = (await req.json()) as RequestBody;
    if (!body?.invitation_id || !body?.token_plaintext) {
      return jsonResponse(req, 400, {
        error: "invitation_id and token_plaintext are required",
      });
    }

    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      console.error("Missing Mailgun configuration");
      return jsonResponse(req, 500, { error: "Mailgun configuration is missing" });
    }

    // ── 3. Load invitation (include token_hash + tenant/creator for scope) ─
    const { data: invitation, error: invErr } = await supabase
      .from("user_invitations")
      .select(
        "id, email, first_name, last_name, tenant_id, unicorn_role, expires_at, invited_by, token_hash, status",
      )
      .eq("id", body.invitation_id)
      .maybeSingle();

    if (invErr || !invitation) {
      console.error("Invitation lookup failed:", invErr);
      return jsonResponse(req, 404, { error: "Invitation not found" });
    }

    // ── 4. Authorise non-service callers against invitation tenant/scope ──
    // Do not trust invitation_id alone: use the row's tenant_id (and
    // invited_by as creator context) so permission is scoped to that invite.
    // Service-role callers are already gated by the upstream invite-creation
    // / resend flow (same pattern as issue-token isTrustedInternalCall).
    if (!isTrustedInternalCall && callerId) {
      const { data: staffAllowed } = await supabase.rpc("check_permission", {
        p_user_id: callerId,
        p_feature_key: "admin.invites.manage",
        p_min_level: "full",
      });
      let authorised = !!staffAllowed;

      // Tenant Admin whose membership covers the invitation's tenant
      // (mirrors resend-invite / cancel-invite).
      if (!authorised) {
        const { data: callerProfile } = await supabase
          .from("users")
          .select("unicorn_role")
          .eq("user_uuid", callerId)
          .maybeSingle();

        if (callerProfile?.unicorn_role === "Admin") {
          const { data: membership } = await supabase
            .from("tenant_users")
            .select("id, relationship_role")
            .eq("user_id", callerId)
            .eq("tenant_id", invitation.tenant_id)
            .maybeSingle();
          if (
            membership &&
            (membership.relationship_role === "primary_contact" ||
              membership.relationship_role === "secondary_contact")
          ) {
            authorised = true;
          }
        }
      }

      // Creator context: Vivacity staff who created this invite may send for it
      // without global admin.invites.manage (invite-user allows broader staff).
      if (!authorised && invitation.invited_by === callerId) {
        const { data: isVivacityTeam } = await supabase.rpc("is_vivacity_team_safe", {
          p_user_id: callerId,
        });
        if (isVivacityTeam) authorised = true;
      }

      if (!authorised) {
        return jsonResponse(req, 403, {
          error: "You don't have permission to send this invitation email",
        });
      }
    }

    // ── 5. Possession proof: re-hash token_plaintext vs stored token_hash ─
    if (!invitation.token_hash) {
      return jsonResponse(req, 400, { error: "Invitation token is invalid or revoked" });
    }
    const expectedHash = await sha256Hex(body.token_plaintext);
    if (!timingSafeEqualHex(expectedHash, invitation.token_hash)) {
      return jsonResponse(req, 400, { error: "Invitation token mismatch" });
    }

    // ── 6. Build and send email ───────────────────────────────────────────
    // Resolve tenant name
    let tenantName = "your organisation";
    if (invitation.tenant_id === VIVACITY_TENANT_ID) {
      tenantName = "Vivacity Coaching & Consulting";
    } else {
      const { data: tenantRow } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", invitation.tenant_id)
        .maybeSingle();
      if (tenantRow?.name) tenantName = tenantRow.name;
    }

    // Resolve inviter name
    let inviterName = "The Vivacity team";
    if (invitation.invited_by) {
      const { data: inviter } = await supabase
        .from("users")
        .select("first_name, last_name")
        .eq("user_uuid", invitation.invited_by)
        .maybeSingle();
      if (inviter) {
        inviterName =
          [inviter.first_name, inviter.last_name].filter(Boolean).join(" ").trim() ||
          inviterName;
      }
    }

    const inviteUrl = appUrl(
      `/accept-invitation?token=${encodeURIComponent(body.token_plaintext)}`,
    );

    const roleLabel = ROLE_LABELS[invitation.unicorn_role] || invitation.unicorn_role;
    const expiryDate = formatExpiry(invitation.expires_at);
    const fromEmail = MAILGUN_FROM_EMAIL || `noreply@${MAILGUN_DOMAIN}`;

    const variables = {
      first_name: invitation.first_name || "there",
      last_name: invitation.last_name || "",
      tenant_name: tenantName,
      invite_url: inviteUrl,
      expiry_date: expiryDate,
      role_label: roleLabel,
      inviter_name: inviterName,
    };

    const formData = new FormData();
    formData.append("from", `${MAILGUN_FROM_NAME} <${fromEmail}>`);
    formData.append("to", invitation.email);
    formData.append("subject", `You've been invited to ${tenantName} on Unicorn`);
    formData.append("template", "unicorn_accept_invite_v1");
    // ============================================================================
    // DO NOT ADD A `v:NAME` LOOP HERE. DO NOT "ALSO PASS AS t:VARIABLES".
    // Mailgun reads template variables from the h:X-Mailgun-Variables header ONLY.
    // Appending v:<name> form params in addition to the header causes Mailgun to
    // run substitution TWICE, doubling every variable in the rendered email and
    // breaking every click-through link (including the invite acceptance URL).
    // This bug has regressed twice. Live v501 is the canonical fix.
    // If a future sync wants to re-add the loop "for safety" — it is not safety,
    // it is the bug. Leave this block as-is.
    // ============================================================================
    formData.append("h:X-Mailgun-Variables", JSON.stringify(variables));

    const apiBase =
      MAILGUN_REGION === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";

    const mailgunResponse = await fetch(`${apiBase}/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
      },
      body: formData,
    });

    if (!mailgunResponse.ok) {
      const errorText = await mailgunResponse.text();
      console.error("Mailgun error:", {
        status: mailgunResponse.status,
        statusText: mailgunResponse.statusText,
        body: errorText,
      });
      return jsonResponse(req, 502, {
        error: "Failed to send invitation email",
        detail: errorText,
      });
    }

    const result = await mailgunResponse.json();
    console.log("Invitation email sent:", invitation.email, result?.id);

    // Stamp the invitation
    await supabase
      .from("user_invitations")
      .update({
        last_sent_at: new Date().toISOString(),
        mailgun_message_id: result?.id ?? null,
      })
      .eq("id", invitation.id);

    return jsonResponse(req, 200, {
      success: true,
      messageId: result?.id,
      invite_url: inviteUrl,
    });
  } catch (error: any) {
    console.error("Error in send-invitation-email:", error);
    return jsonResponse(req, 500, {
      error: error?.message || "Failed to send invitation email",
    });
  }
};

serve(handler);
