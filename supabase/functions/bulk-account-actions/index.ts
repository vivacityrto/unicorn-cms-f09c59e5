// Thin orchestrator over activate-ghost-user and send-password-reset.
// NEVER reimplement the senders here — they are the single source of truth
// for emails, URLs and audit. This function only loops with a circuit-breaker
// and returns per-recipient outcomes (including partial results on abort).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { emitTimelineEvent } from "../_shared/emit-timeline-event.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THROTTLE_MS = 400;
const MAX_CONSECUTIVE_FAILURES = 5;

type Action = "activate" | "reset";
type Outcome = "sent" | "skipped" | "failed" | "aborted";

interface Body {
  tenant_id: number;
  action: Action;
  user_uuids: string[];
}

interface ResultRow {
  user_uuid: string;
  email: string | null;
  action: Action;
  outcome: Outcome;
  reason?: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { ok: false, code: "NO_AUTH", detail: "Missing Authorization header" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Authenticate caller
  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) {
    return json(401, { ok: false, code: "AUTH_FAILED", detail: callerErr?.message || "Invalid token" });
  }
  const caller = callerData.user;

  // 2. Permission gate via central RPC (service-role client)
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: allowed } = await admin.rpc("check_permission", {
    p_user_id: caller.id,
    p_feature_key: "admin.team_users.manage",
    p_min_level: "full",
  });
  if (!allowed) {
    return json(403, { ok: false, code: "FORBIDDEN", detail: "You do not have permission to perform this action" });
  }

  // 3. Parse body
  let body: Body;
  try { body = await req.json(); } catch {
    return json(400, { ok: false, code: "BAD_JSON", detail: "Invalid JSON" });
  }

  // Recovery is per-row only — a recovery link is a live login-as credential.
  if ((body?.action as string) === "recovery") {
    return json(400, {
      ok: false,
      code: "RECOVERY_NOT_ALLOWED_IN_BULK",
      detail: "Recovery links must be generated one-at-a-time from the per-row menu",
    });
  }
  if (!body || (body.action !== "activate" && body.action !== "reset")) {
    return json(400, { ok: false, code: "INVALID_ACTION", detail: "action must be 'activate' or 'reset'" });
  }
  if (typeof body.tenant_id !== "number") {
    return json(400, { ok: false, code: "INVALID_PAYLOAD", detail: "tenant_id (number) required" });
  }
  if (!Array.isArray(body.user_uuids) || body.user_uuids.length === 0) {
    return json(400, { ok: false, code: "INVALID_PAYLOAD", detail: "user_uuids must be a non-empty array" });
  }
  const uuids = Array.from(new Set(body.user_uuids.filter((u) => typeof u === "string" && UUID_RE.test(u))));
  if (uuids.length === 0) {
    return json(400, { ok: false, code: "INVALID_PAYLOAD", detail: "no valid uuids supplied" });
  }

  // 4. Resolve emails up-front so every result row carries identifying info,
  //    even when the per-user sender call fails before returning an email.
  const { data: userRows } = await admin
    .from("users")
    .select("user_uuid, email, first_name, last_name")
    .in("user_uuid", uuids);
  const emailByUuid = new Map<string, string>();
  const nameByUuid = new Map<string, string>();
  for (const u of (userRows || []) as { user_uuid: string; email: string | null; first_name: string | null; last_name: string | null }[]) {
    if (u.email) emailByUuid.set(u.user_uuid, u.email);
    const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    if (full) nameByUuid.set(u.user_uuid, full);
  }

  const senderName = body.action === "activate" ? "activate-ghost-user" : "send-password-reset";
  const details: ResultRow[] = [];
  let consecutiveFailures = 0;
  let aborted = false;
  let invokedCount = 0;

  for (let i = 0; i < uuids.length; i++) {
    const user_uuid = uuids[i];
    const email = emailByUuid.get(user_uuid) ?? null;

    if (aborted) {
      details.push({
        user_uuid,
        email,
        action: body.action,
        outcome: "aborted",
        reason: "Not sent — batch stopped after repeated failures",
      });
      continue;
    }

    if (invokedCount > 0) await sleep(THROTTLE_MS);

    try {
      const invokeBody =
        body.action === "activate"
          ? { user_uuid, tenant_id: body.tenant_id }
          : { user_uuid };

      const { data, error } = await admin.functions.invoke(senderName, {
        body: invokeBody,
        headers: { Authorization: `Bearer ${token}` },
      });
      invokedCount += 1;

      if (error) {
        details.push({
          user_uuid,
          email,
          action: body.action,
          outcome: "failed",
          reason: error.message || "Sender error",
        });
        consecutiveFailures += 1;
      } else if (data?.ok) {
        details.push({
          user_uuid,
          email: data.email ?? email,
          action: body.action,
          outcome: "sent",
        });
        consecutiveFailures = 0;
      } else {
        // Sender returned ok:false — state-mismatch codes are skips, not failures.
        const code = data?.code as string | undefined;
        const isStateMismatch =
          code === "AUTH_USER_NOT_FOUND" ||
          code === "ALREADY_ACTIVATED" ||
          code === "USER_DISABLED" ||
          code === "USER_NOT_FOUND";
        let reason = data?.detail || code || "Sender refused the action";
        if (code === "AUTH_USER_NOT_FOUND" && body.action === "reset") {
          reason = "No auth account yet — use Activate";
        }
        if (code === "ALREADY_ACTIVATED" && body.action === "activate") {
          reason = "Already activated — use Send password reset";
        }
        details.push({
          user_uuid,
          email,
          action: body.action,
          outcome: isStateMismatch ? "skipped" : "failed",
          reason,
        });
        if (isStateMismatch) consecutiveFailures = 0;
        else consecutiveFailures += 1;
      }
    } catch (e) {
      details.push({
        user_uuid,
        email,
        action: body.action,
        outcome: "failed",
        reason: (e as Error)?.message || String(e),
      });
      consecutiveFailures += 1;
    }

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      aborted = true;
      console.error(
        `[bulk-account-actions] aborting after ${consecutiveFailures} consecutive failures`,
      );
    }
  }

  const summary = {
    sent: details.filter((d) => d.outcome === "sent").length,
    skipped: details.filter((d) => d.outcome === "skipped").length,
    failed: details.filter((d) => d.outcome === "failed").length,
    aborted: details.filter((d) => d.outcome === "aborted").length,
  };

  // One audit row per batch — single audit trail across the senders.
  try {
    await admin.from("audit_eos_events").insert({
      tenant_id: body.tenant_id,
      entity: "users",
      action: `bulk_account_${body.action}`,
      reason: aborted
        ? `Batch aborted after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`
        : "Bulk account action complete",
      details: {
        actor: caller.id,
        summary,
        attempted: uuids.length,
        partial_failure: aborted,
      },
    });
  } catch (e) {
    console.warn("[bulk-account-actions] audit insert failed (non-fatal):", e);
  }

  return json(200, {
    ok: true,
    action: body.action,
    summary,
    details,
    partial_failure: aborted,
  });
});
