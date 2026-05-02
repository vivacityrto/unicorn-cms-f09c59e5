import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN");
const MAILGUN_FROM_EMAIL = Deno.env.get("MAILGUN_FROM_EMAIL");
const MAILGUN_FROM_NAME = Deno.env.get("MAILGUN_FROM_NAME") || "Vivacity Unicorn";
const MAILGUN_REGION = (Deno.env.get("MAILGUN_REGION") || "eu").toLowerCase();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://unicorn-cms.au";

const VIVACITY_TENANT_ID = 6372;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  invitation_id: string;
  token_plaintext: string;
}

const ROLE_LABELS: Record<string, string> = {
  "Super Admin": "Super Admin",
  "Team Leader": "Team Leader",
  "Team Member": "Team Member",
  Admin: "Organisation Admin",
  User: "General User",
};

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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;
    if (!body?.invitation_id || !body?.token_plaintext) {
      return new Response(
        JSON.stringify({ error: "invitation_id and token_plaintext are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      console.error("Missing Mailgun configuration");
      return new Response(
        JSON.stringify({ error: "Mailgun configuration is missing" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Load invitation
    const { data: invitation, error: invErr } = await supabase
      .from("user_invitations")
      .select("id, email, first_name, last_name, tenant_id, unicorn_role, expires_at, invited_by")
      .eq("id", body.invitation_id)
      .maybeSingle();

    if (invErr || !invitation) {
      console.error("Invitation lookup failed:", invErr);
      return new Response(
        JSON.stringify({ error: "Invitation not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

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
        inviterName = [inviter.first_name, inviter.last_name].filter(Boolean).join(" ").trim() || inviterName;
      }
    }

    const inviteUrl = `${APP_BASE_URL.replace(/\/$/, "")}/accept-invitation?token=${encodeURIComponent(
      body.token_plaintext
    )}`;

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
    formData.append("h:X-Mailgun-Variables", JSON.stringify(variables));
    // Also pass as t:variables for template engine
    for (const [k, v] of Object.entries(variables)) {
      formData.append(`v:${k}`, String(v));
    }

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
      return new Response(
        JSON.stringify({ error: "Failed to send invitation email", detail: errorText }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
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

    return new Response(
      JSON.stringify({ success: true, messageId: result?.id, invite_url: inviteUrl }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-invitation-email:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to send invitation email" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
