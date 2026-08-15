// Bulk-send-invitations: thin orchestrator over invite-user.
// NEVER re-implement the email send here. invite-user → send-invitation-email
// (v501, with the canary CAPS comment) is the single code path. Re-implementing
// the Mailgun call would re-introduce the variable-doubling regression.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const THROTTLE_MS = 3000; // 3-second gap between invite-user calls (≈20/min)
const MAX_CONSECUTIVE_FAILURES = 5;

type ContactOverride = {
  email: string;
  first_name: string;
  last_name?: string;
  unicorn_role: "Admin" | "User";
};

type RequestBody = {
  tenant_ids: number[];
  contact_overrides?: Record<string, ContactOverride>;
};

type Outcome =
  | { tenant_id: number; outcome: "sent"; invitation_id: string; email: string }
  | { tenant_id: number; outcome: "skipped"; reason: string; email?: string }
  | { tenant_id: number; outcome: "failed"; error: string; email?: string };

function jsonResponse(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  const callerToken = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!callerToken) {
    return jsonResponse(req, 401, { ok: false, code: "NO_AUTH", detail: "Missing Authorization header" });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Authenticate caller and verify Super Admin
  const { data: callerUser, error: callerErr } = await supabase.auth.getUser(callerToken);
  if (callerErr || !callerUser?.user) {
    return jsonResponse(req, 401, {
      ok: false,
      code: "AUTH_FAILED",
      detail: callerErr?.message || "Unable to authenticate",
    });
  }

  const { data: allowed } = await supabase.rpc('check_permission', {
    p_user_id: callerUser.user.id,
    p_feature_key: 'admin.invites.manage',
    p_min_level: 'full',
  });

  if (!allowed) {
    return jsonResponse(req, 403, {
      ok: false,
      code: "FORBIDDEN",
      detail: "You do not have permission to run bulk invitations",
    });
  }

  // 2. Parse + validate body
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, 400, { ok: false, code: "BAD_JSON", detail: "Invalid JSON body" });
  }

  if (!Array.isArray(body.tenant_ids) || body.tenant_ids.length === 0) {
    return jsonResponse(req, 422, {
      ok: false,
      code: "INVALID_PAYLOAD",
      detail: "tenant_ids must be a non-empty array",
    });
  }

  const overrides = body.contact_overrides || {};
  const details: Outcome[] = [];
  const remaining: number[] = [];
  let consecutiveFailures = 0;
  let aborted = false;
  let sendCount = 0;

  for (let i = 0; i < body.tenant_ids.length; i++) {
    const tenant_id = body.tenant_ids[i];

    if (aborted) {
      remaining.push(tenant_id);
      continue;
    }

    try {
      // Resolve contact: override → primary_contact tenant_users row → users
      let contact:
        | { email: string; first_name: string; last_name: string; unicorn_role: string }
        | null = null;

      const override = overrides[String(tenant_id)];
      if (override?.email && override?.first_name && override?.unicorn_role) {
        contact = {
          email: override.email,
          first_name: override.first_name,
          last_name: override.last_name || "-",
          unicorn_role: override.unicorn_role,
        };
      } else {
        const { data: tu } = await supabase
          .from("tenant_users")
          .select("user_id, created_at")
          .eq("tenant_id", tenant_id)
          .eq("relationship_role", "primary_contact")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (tu?.user_id) {
          const { data: u } = await supabase
            .from("users")
            .select("email, first_name, last_name, unicorn_role")
            .eq("user_uuid", tu.user_id)
            .maybeSingle();

          if (u?.email) {
            contact = {
              email: u.email,
              first_name: u.first_name || "there",
              last_name: u.last_name || "-",
              unicorn_role: u.unicorn_role || "User",
            };
          }
        }
      }

      if (!contact) {
        details.push({ tenant_id, outcome: "skipped", reason: "no_primary_contact" });
        continue;
      }

      // Dedup: skip if a non-revoked, non-expired, non-failed invitation exists
      const { data: existing } = await supabase
        .from("user_invitations")
        .select("id, status, expires_at")
        .eq("email", contact.email.toLowerCase())
        .eq("tenant_id", tenant_id)
        .not("status", "in", "(revoked,expired,failed)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing && existing.expires_at && new Date(existing.expires_at) > new Date()) {
        details.push({
          tenant_id,
          outcome: "skipped",
          reason: "already_invited",
          email: contact.email,
        });
        continue;
      }

      // Throttle BEFORE invoke (skip on the very first send of the batch)
      if (sendCount > 0) {
        await sleep(THROTTLE_MS);
      }

      const { data: inviteRes, error: inviteErr } = await supabase.functions.invoke("invite-user", {
        body: {
          email: contact.email,
          first_name: contact.first_name,
          last_name: contact.last_name,
          invite_as: "CLIENT",
          tenant_id,
          unicorn_role: contact.unicorn_role,
        },
        headers: { Authorization: `Bearer ${callerToken}` },
      });

      sendCount += 1;

      if (inviteErr || !inviteRes?.ok) {
        const errMsg =
          inviteErr?.message || inviteRes?.detail || inviteRes?.code || "unknown";
        details.push({ tenant_id, outcome: "failed", error: errMsg, email: contact.email });
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          aborted = true;
          console.error(
            `[bulk-send] Aborting after ${consecutiveFailures} consecutive failures`
          );
        }
        continue;
      }

      details.push({
        tenant_id,
        outcome: "sent",
        invitation_id: inviteRes.invitation_id,
        email: contact.email,
      });
      consecutiveFailures = 0;
    } catch (e: any) {
      console.error(`[bulk-send] Unhandled error for tenant ${tenant_id}:`, e);
      details.push({ tenant_id, outcome: "failed", error: e?.message || String(e) });
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        aborted = true;
      }
    }
  }

  const summary = {
    sent: details.filter((d) => d.outcome === "sent").length,
    skipped: details.filter((d) => d.outcome === "skipped").length,
    failed: details.filter((d) => d.outcome === "failed").length,
  };

  // Audit log of the batch
  try {
    await supabase.from("audit_eos_events").insert({
      tenant_id: null,
      entity: "user_invitations",
      action: "bulk_send_invitations",
      reason: aborted
        ? `Bulk send aborted after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`
        : "Bulk send complete",
      details: {
        actor: callerUser.user.id,
        summary,
        attempted: body.tenant_ids.length,
        partial_failure: aborted,
        remaining_tenant_ids: remaining,
      },
    });
  } catch (e) {
    console.warn("[bulk-send] Audit log insert failed (non-fatal):", e);
  }

  return jsonResponse(req, 200, {
    ok: true,
    summary,
    details,
    partial_failure: aborted,
    remaining_tenant_ids: remaining,
  });
});
