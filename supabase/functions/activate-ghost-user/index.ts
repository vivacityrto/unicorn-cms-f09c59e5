import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface Body {
  user_uuid: string;
  tenant_id: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
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
    if (!token) return json(req, 401, { ok: false, code: "NO_AUTH", detail: "Missing Authorization header" });

    const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !callerData?.user) {
      return json(req, 401, { ok: false, code: "AUTH_FAILED", detail: callerErr?.message || "Invalid token" });
    }
    const caller = callerData.user;

    // 2. Permission gate via central RPC (service-role)
    const { data: allowed } = await admin.rpc("check_permission", {
      p_user_id: caller.id,
      p_feature_key: "admin.team_users.manage",
      p_min_level: "full",
    });
    if (!allowed) {
      return json(req, 403, { ok: false, code: "FORBIDDEN", detail: "You do not have permission to activate users" });
    }

    // 3. Payload
    let body: Body;
    try { body = await req.json(); } catch {
      return json(req, 400, { ok: false, code: "BAD_JSON", detail: "Invalid JSON" });
    }
    if (!body?.user_uuid || !UUID_RE.test(body.user_uuid) || typeof body.tenant_id !== "number") {
      return json(req, 400, { ok: false, code: "INVALID_PAYLOAD", detail: "user_uuid (uuid) and tenant_id (number) required" });
    }

    // 4. Lookup ghost in public.users
    const { data: ghost, error: ghostErr } = await admin
      .from("users")
      .select("email, first_name, last_name, unicorn_role")
      .eq("user_uuid", body.user_uuid)
      .maybeSingle();
    if (ghostErr) {
      console.error("ghost lookup failed", ghostErr);
      return json(req, 500, { ok: false, code: "USER_LOOKUP_FAILED", detail: ghostErr.message });
    }
    if (!ghost || !ghost.email) {
      return json(req, 404, { ok: false, code: "USER_NOT_FOUND", detail: "No public.users row for that UUID (or missing email)" });
    }
    const ghostEmail = ghost.email.toLowerCase();

    // 5. Confirm ghost via auth.admin.getUserById
    const { data: existingById } = await admin.auth.admin.getUserById(body.user_uuid);
    if (existingById?.user) {
      return json(req, 409, { ok: false, code: "ALREADY_ACTIVATED", detail: "User already has an auth account" });
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
        return json(req, 409, {
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
        ghost_activation: true,
      },
    });
    if (createErr) {
      console.error("createUser failed", createErr);
      const msg = createErr.message || "";
      if (/already|duplicate|exists/i.test(msg)) {
        return json(req, 409, { ok: false, code: "ALREADY_ACTIVATED", detail: msg });
      }
      return json(req, 500, { ok: false, code: "AUTH_CREATE_FAILED", detail: msg });
    }

    // 8. Role correction — align tenant_users / tenant_members / users with relationship_role
    const VIVACITY_TENANT_ID = 6372;
    const isVivacity = body.tenant_id === VIVACITY_TENANT_ID;

    const { data: existingTU } = await admin
      .from('tenant_users')
      .select('relationship_role, primary_contact')
      .eq('user_id', body.user_uuid)
      .eq('tenant_id', body.tenant_id)
      .maybeSingle();

    const relationshipRole: string =
      (existingTU as any)?.relationship_role ||
      (ghost.unicorn_role === 'Admin' ? 'primary_contact' : 'user');

    let tuRole: string, tuPrimary: boolean, tuSecondary: boolean, tuScope: string;
    let uRole: string, uType: string;
    let tmRole: string, tmStatus: string;

    switch (relationshipRole) {
      case 'primary_contact':
        tuRole='parent'; tuPrimary=true;  tuSecondary=false; tuScope='full';
        uRole='Admin';        uType='Client Parent';
        tmRole='Admin';       tmStatus='active'; break;
      case 'secondary_contact':
        tuRole='parent'; tuPrimary=false; tuSecondary=true;  tuScope='full';
        uRole='Admin';        uType='Client Parent';
        tmRole='Admin';       tmStatus='active'; break;
      case 'academy_user':
        tuRole='child'; tuPrimary=false; tuSecondary=false; tuScope='academy_only';
        uRole='Academy User'; uType='Client Child';
        tmRole='General User'; tmStatus='inactive'; break;
      default:
        tuRole='child'; tuPrimary=false; tuSecondary=false; tuScope='full';
        uRole='User';         uType='Client Child';
        tmRole='General User'; tmStatus='active';
    }
    if (isVivacity) {
      uType='Vivacity Team'; uRole = ghost.unicorn_role ?? uRole;
      tmRole='Admin'; tmStatus='active';
    }

    await admin.from('tenant_users').upsert({
      user_id: body.user_uuid,
      tenant_id: body.tenant_id,
      role: tuRole,
      primary_contact: tuPrimary,
      secondary_contact: tuSecondary,
      access_scope: tuScope,
      relationship_role: relationshipRole,
    }, { onConflict: 'tenant_id,user_id' });

    await admin.from('tenant_members').upsert({
      tenant_id: body.tenant_id,
      user_id: body.user_uuid,
      role: tmRole,
      status: tmStatus,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,user_id' });

    await admin.from('users').update({
      unicorn_role: uRole,
      user_type: uType,
      updated_at: new Date().toISOString(),
    }).eq('user_uuid', body.user_uuid);

    // 9. Create 7-day invite token and send branded invitation email
    const inviteToken = crypto.randomUUID();
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(inviteToken));
    const tokenHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    let emailSent = false;
    let emailError: string | null = null;
    let invitationId: string | null = null;

    const { data: insertedInvite, error: inviteInsertErr } = await admin
      .from('user_invitations')
      .insert({
        email: ghost.email,
        status: 'pending',
        invited_by: caller.id,
        tenant_id: body.tenant_id,
        unicorn_role: uRole,
        relationship_role: relationshipRole,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        first_name: ghost.first_name ?? '',
        last_name: ghost.last_name ?? null,
      })
      .select('id')
      .single();

    if (inviteInsertErr || !insertedInvite) {
      emailError = inviteInsertErr?.message || 'invitation insert failed';
      console.error('user_invitations insert failed', inviteInsertErr);
    } else {
      invitationId = insertedInvite.id;
      const { error: emailErr } = await admin.functions.invoke('send-invitation-email', {
        body: { invitation_id: insertedInvite.id, token_plaintext: inviteToken },
        // Deno's functions.invoke does not auto-forward the service-role token;
        // send-invitation-email requires it for its trusted-internal path.
        headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      });
      if (emailErr) {
        emailError = emailErr.message || 'send-invitation-email failed';
        console.error('send-invitation-email failed', emailErr);
      } else {
        emailSent = true;
      }
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
          relationship_role: relationshipRole,
          tenant_users_role: tuRole,
          tenant_members_role: tmRole,
          roles_corrected: true,
          invitation_id: invitationId,
        },
      });
    } catch (auditErr) {
      console.error("audit insert failed (non-fatal)", auditErr);
    }

    return json(req, 200, {
      ok: true,
      email: ghost.email,
      email_sent: emailSent,
      email_error: emailError,
      detail: emailSent
        ? "Account activated and invitation email sent (7-day token)"
        : "Account activated; invitation email could not be sent",
    });
  } catch (err: any) {
    console.error("activate-ghost-user error", err);
    return json(req, 500, { ok: false, code: "UNEXPECTED", detail: err?.message || "Unexpected error" });
  }
});
