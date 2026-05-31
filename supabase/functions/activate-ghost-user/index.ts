import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface Body {
  user_uuid: string;
  tenant_id: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
  const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN");
  const MAILGUN_FROM_EMAIL = Deno.env.get("MAILGUN_FROM_EMAIL");
  const MAILGUN_FROM_NAME = Deno.env.get("MAILGUN_FROM_NAME") || "Vivacity Unicorn";
  const MAILGUN_REGION = (Deno.env.get("MAILGUN_REGION") || "eu").toLowerCase();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Caller auth
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { ok: false, code: "NO_AUTH", detail: "Missing Authorization header" });

    const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !callerData?.user) {
      return json(401, { ok: false, code: "AUTH_FAILED", detail: callerErr?.message || "Invalid token" });
    }
    const caller = callerData.user;

    // 2. Staff check via JWT-bound client (so SECURITY DEFINER RPCs see auth.uid())
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [{ data: isStaff }, { data: isSA }] = await Promise.all([
      userClient.rpc("is_vivacity_team_safe", { p_user_id: caller.id }),
      userClient.rpc("is_super_admin_safe", { p_user_id: caller.id }),
    ]);
    if (!isStaff && !isSA) {
      return json(403, { ok: false, code: "FORBIDDEN", detail: "Vivacity staff only" });
    }

    // 3. Payload
    let body: Body;
    try { body = await req.json(); } catch {
      return json(400, { ok: false, code: "BAD_JSON", detail: "Invalid JSON" });
    }
    if (!body?.user_uuid || !UUID_RE.test(body.user_uuid) || typeof body.tenant_id !== "number") {
      return json(400, { ok: false, code: "INVALID_PAYLOAD", detail: "user_uuid (uuid) and tenant_id (number) required" });
    }

    // 4. Lookup ghost in public.users
    const { data: ghost, error: ghostErr } = await admin
      .from("users")
      .select("email, first_name, last_name, unicorn_role")
      .eq("user_uuid", body.user_uuid)
      .maybeSingle();
    if (ghostErr) {
      console.error("ghost lookup failed", ghostErr);
      return json(500, { ok: false, code: "USER_LOOKUP_FAILED", detail: ghostErr.message });
    }
    if (!ghost || !ghost.email) {
      return json(404, { ok: false, code: "USER_NOT_FOUND", detail: "No public.users row for that UUID (or missing email)" });
    }
    const ghostEmail = ghost.email.toLowerCase();

    // 5. Confirm ghost via auth.admin.getUserById
    const { data: existingById } = await admin.auth.admin.getUserById(body.user_uuid);
    if (existingById?.user) {
      return json(409, { ok: false, code: "ALREADY_ACTIVATED", detail: "User already has an auth account" });
    }

    // 6. Defensive email collision check (paginated)
    let page = 1;
    while (page <= 20) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listErr) {
        console.error("listUsers failed", listErr);
        break; // non-fatal; createUser will surface conflict if any
      }
      const conflict = list?.users?.find((u) => u.email?.toLowerCase() === ghostEmail);
      if (conflict) {
        return json(409, {
          ok: false,
          code: "EMAIL_TAKEN_BY_OTHER_AUTH_USER",
          detail: `Email ${ghostEmail} is already used by auth user ${conflict.id}`,
        });
      }
      if (!list?.users?.length || list.users.length < 1000) break;
      page++;
    }

    // 7. Create auth row USING EXISTING UUID (preserves all FKs)
    const { error: createErr } = await admin.auth.admin.createUser({
      id: body.user_uuid,
      email: ghostEmail,
      email_confirm: true,
      user_metadata: {
        first_name: ghost.first_name ?? '',
        last_name: ghost.last_name ?? '',
        full_name: `${ghost.first_name ?? ''} ${ghost.last_name ?? ''}`.trim(),
      },
    });
    if (createErr) {
      console.error("createUser failed", createErr);
      // Map gotrue duplicate errors to 409
      const msg = createErr.message || "";
      if (/already|duplicate|exists/i.test(msg)) {
        return json(409, { ok: false, code: "ALREADY_ACTIVATED", detail: msg });
      }
      return json(500, { ok: false, code: "AUTH_CREATE_FAILED", detail: msg });
    }

    // 8. Generate recovery link
    const origin = req.headers.get("origin") || "https://unicorn-cms.au";
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: ghostEmail,
      options: { redirectTo: `${origin}/reset-password` },
    });
    const actionLink = linkData?.properties?.action_link;
    if (linkErr || !actionLink) {
      console.error("generateLink failed", linkErr);
      return json(500, {
        ok: false,
        code: "LINK_GENERATION_FAILED",
        detail: linkErr?.message || "No action_link returned. Auth account was created — use Resend password reset.",
      });
    }

    // 9. Send branded welcome email via Mailgun
    let emailSent = false;
    let emailError: string | null = null;
    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      emailError = "Mailgun not configured";
      console.warn("Mailgun not configured — skipping welcome email");
    } else {
      const recipientName = (ghost.first_name?.trim()) || ghostEmail.split("@")[0];
      const fromEmail = MAILGUN_FROM_EMAIL || `noreply@${MAILGUN_DOMAIN}`;
      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Your Unicorn account is ready</title>
<style>
  body { margin:0; padding:0; background:#f6f8fb; font-family:Arial,Helvetica,sans-serif; color:#111; }
  .container { max-width:560px; margin:0 auto; background:#ffffff; }
  .header { background:#23C0DD; padding:24px; color:#fff; text-align:center; }
  .content { padding:24px; }
  .btn { display:inline-block; background:#23C0DD; color:#fff; text-decoration:none; padding:12px 18px; border-radius:6px; font-weight:500; }
  .muted { color:#666; font-size:14px; margin-top:16px; }
  .footer { padding:16px; text-align:center; color:#666; font-size:12px; }
  .link-box { background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px; padding:12px; margin:16px 0; word-break:break-all; font-size:14px; }
  a { color:#23C0DD; }
</style></head>
<body><div class="container">
  <div class="header"><h1 style="margin:0; font-size:28px;">🦄 Unicorn</h1></div>
  <div class="content">
    <h2 style="color:#1f2937; margin-top:0;">Your Unicorn account is ready</h2>
    <p>Hi ${recipientName},</p>
    <p>Vivacity has set up your Unicorn account. Click below to set your password and log in for the first time.</p>
    <p style="text-align:center; margin:24px 0;">
      <a href="${actionLink}" class="btn">Set up my password 🔑</a>
    </p>
    <p class="muted">If the button doesn't work, copy this link:</p>
    <div class="link-box"><a href="${actionLink}">${actionLink}</a></div>
    <p class="muted"><strong>⚡ This link expires in 1 hour.</strong><br/>
    If you didn't expect this email, please contact your Vivacity consultant.</p>
  </div>
  <div class="footer">Vivacity Unicorn • <a href="${origin}">${origin}</a></div>
</div></body></html>`;
      const text = `Hi ${recipientName},\n\nVivacity has set up your Unicorn account. Set your password here:\n${actionLink}\n\nThis link expires in 1 hour.\n\n— Vivacity Unicorn`;

      const fd = new FormData();
      fd.append("from", `${MAILGUN_FROM_NAME} <${fromEmail}>`);
      fd.append("to", ghost.email);
      fd.append("subject", "Your Unicorn account is ready");
      fd.append("html", html);
      fd.append("text", text);

      const apiBase = MAILGUN_REGION === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
      const mg = await fetch(`${apiBase}/v3/${MAILGUN_DOMAIN}/messages`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: fd,
      });
      if (mg.ok) {
        emailSent = true;
      } else {
        emailError = await mg.text();
        console.error("Mailgun send failed", mg.status, emailError);
      }
    }

    // Best-effort: record in user_invitations for Manage Invites visibility
    try {
      await admin.from("user_invitations").insert({
        email: ghost.email,
        status: "sent",
        invited_by: caller.id,
        tenant_id: body.tenant_id,
        unicorn_role: ghost.unicorn_role ?? "User",
        first_name: ghost.first_name ?? "",
        last_name: ghost.last_name ?? null,
        last_sent_at: new Date().toISOString(),
      });
    } catch (inviteLogErr) {
      console.error("user_invitations insert failed (non-fatal)", inviteLogErr);
    }

    // 10. Audit (best-effort)
    try {
      await admin.from("audit_eos_events").insert({
        tenant_id: body.tenant_id,
        user_id: body.user_uuid,
        entity: "users",
        entity_id: body.user_uuid,
        action: "ghost_user_activated",
        details: {
          email: ghost.email,
          activated_by: caller.id,
          email_sent: emailSent,
          email_error: emailError,
        },
      });
    } catch (auditErr) {
      console.error("audit insert failed (non-fatal)", auditErr);
    }

    return json(200, {
      ok: true,
      email: ghost.email,
      email_sent: emailSent,
      email_error: emailError,
      action_link: emailSent ? null : actionLink,
      detail: emailSent
        ? "Account activated and welcome email sent"
        : "Account activated; welcome email could not be sent — resend via password reset",
    });
  } catch (err: any) {
    console.error("activate-ghost-user error", err);
    return json(500, { ok: false, code: "UNEXPECTED", detail: err?.message || "Unexpected error" });
  }
});
