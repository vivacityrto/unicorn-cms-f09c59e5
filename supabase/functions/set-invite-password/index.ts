import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface Body {
  token_plaintext: string;
  email: string;
  new_password: string;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    let body: Body;
    try {
      body = await req.json();
    } catch {
      return json(400, { ok: false, code: "BAD_JSON", detail: "Invalid JSON" });
    }

    const token_plaintext = typeof body?.token_plaintext === "string" ? body.token_plaintext : "";
    const email = typeof body?.email === "string" ? body.email : "";
    const new_password = typeof body?.new_password === "string" ? body.new_password : "";

    if (!token_plaintext || !email || !new_password) {
      return json(400, {
        ok: false,
        code: "INVALID_INPUT",
        detail: "token_plaintext, email, and new_password are required",
      });
    }
    if (new_password.length < 8) {
      return json(400, {
        ok: false,
        code: "INVALID_INPUT",
        detail: "Password must be at least 8 characters",
      });
    }

    const tokenHash = await sha256Hex(token_plaintext);

    const { data: invitation, error: inviteErr } = await admin
      .from("user_invitations")
      .select("id, email, tenant_id, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (inviteErr) {
      console.error("invitation lookup failed", inviteErr);
      return json(500, { ok: false, code: "LOOKUP_FAILED", detail: inviteErr.message });
    }
    if (!invitation) {
      return json(400, { ok: false, code: "INVALID_TOKEN" });
    }
    if (invitation.status === "successful" || invitation.status === "accepted") {
      return json(410, {
        ok: false,
        code: "TOKEN_CONSUMED",
        detail: "This invitation has already been used",
      });
    }
    if (invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) {
      return json(400, { ok: false, code: "INVALID_TOKEN", detail: "This invitation is not usable" });
    }

    const emailLc = email.toLowerCase();
    if ((invitation.email || "").toLowerCase() !== emailLc) {
      return json(400, { ok: false, code: "EMAIL_MISMATCH" });
    }

    // Find auth user by email
    let authUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null } | null = null;
    let page = 1;
    while (page <= 20) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listErr) {
        console.error("listUsers failed", listErr);
        return json(500, { ok: false, code: "AUTH_LOOKUP_FAILED", detail: listErr.message });
      }
      const found = list?.users?.find((u) => u.email?.toLowerCase() === emailLc);
      if (found) {
        authUser = found as any;
        break;
      }
      if (!list?.users?.length || list.users.length < 1000) break;
      page++;
    }

    if (!authUser) {
      return json(404, { ok: false, code: "AUTH_USER_NOT_FOUND" });
    }

    const isGhost = (authUser.user_metadata as any)?.ghost_activation === true;

    // For old activations without the flag, check if the user has ever
    // signed in. If last_sign_in_at is null they have no known password —
    // safe to let them set one via the invite token.
    let neverSignedIn = false;
    if (!isGhost) {
      const { data: profile } = await admin
        .from('users')
        .select('last_sign_in_at')
        .eq('email', emailLc)
        .maybeSingle();
      neverSignedIn = !profile?.last_sign_in_at;
    }

    if (!isGhost && !neverSignedIn) {
      return json(403, {
        ok: false,
        code: "NOT_GHOST_ACCOUNT",
        detail: "Use your existing password or Forgot Password.",
      });
    }

    // Claim first (conditional UPDATE). If another request already consumed
    // the token, RETURNING is empty — 410 and do NOT set the password.
    const { data: claimed, error: claimErr } = await admin
      .from("user_invitations")
      .update({
        status: "successful",
        used_at: new Date().toISOString(),
      })
      .eq("token_hash", tokenHash)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .select("id");

    if (claimErr) {
      console.error("invitation claim failed", claimErr);
      return json(500, { ok: false, code: "CLAIM_FAILED", detail: claimErr.message });
    }
    if (!claimed || claimed.length === 0) {
      return json(410, {
        ok: false,
        code: "TOKEN_CONSUMED",
        detail: "This invitation has already been used",
      });
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(authUser.id, {
      password: new_password,
    });
    if (updateErr) {
      console.error("updateUserById failed", updateErr);
      return json(500, {
        ok: false,
        code: "PASSWORD_UPDATE_FAILED",
        detail: updateErr.message,
      });
    }

    // Best-effort: clear ghost_activation flag now that the password is set.
    // Failure here must not abort the successful password change.
    try {
      await admin.auth.admin.updateUserById(authUser.id, {
        user_metadata: { ghost_activation: false },
      });
    } catch (clearErr) {
      console.warn("Failed to clear ghost_activation flag (non-fatal)", clearErr);
    }

    // Best-effort audit
    try {
      await admin.from("audit_eos_events").insert({
        tenant_id: invitation.tenant_id,
        user_id: authUser.id,
        entity: "users",
        entity_id: authUser.id,
        action: "ghost_password_set",
        details: {
          email: authUser.email,
          invitation_id: invitation.id,
        },
      });
    } catch (auditErr) {
      console.error("audit insert failed (non-fatal)", auditErr);
    }

    return json(200, { ok: true, email: authUser.email });
  } catch (err: any) {
    console.error("set-invite-password error", err);
    return json(500, { ok: false, code: "UNEXPECTED", detail: err?.message || "Unexpected error" });
  }
});
