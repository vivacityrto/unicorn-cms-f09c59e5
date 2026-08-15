// Cross-Tenant Cohort Access Sender — worker.
// Staff-initiated, time-budgeted drain. Calls activate-ghost-user and
// send-password-reset UNMODIFIED, carrying the caller's JWT. Never stores
// the token. pg_cron is NOT permitted to invoke this function.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const THROTTLE_MS_DEFAULT = 400;
const TIME_BUDGET_MS = 50_000;
const MAX_CONSECUTIVE_FAILURES = 10;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Body { job_id?: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { ok: false, code: "NO_AUTH" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Authenticate caller
  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) return json(401, { ok: false, code: "AUTH_FAILED", detail: callerErr?.message });
  const caller = callerData.user;

  // Permission gate via central RPC (service-role).
  // JWT-bound client is still needed below for SECURITY DEFINER rpcs that read auth.uid().
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: allowed } = await admin.rpc("check_permission", {
    p_user_id: caller.id,
    p_feature_key: "admin.cohort.send",
    p_min_level: "full",
  });
  if (!allowed) return json(403, { ok: false, code: "FORBIDDEN" });

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { ok: false, code: "BAD_JSON" }); }
  const jobId = body?.job_id;
  if (!jobId) return json(400, { ok: false, code: "INVALID_PAYLOAD", detail: "job_id required" });

  // Load job (service role; RLS already enforced by staff gate)
  const { data: job, error: jobErr } = await admin
    .from("cohort_send_jobs")
    .select("id, action, status, batch_size, throttle_ms, consecutive_failures")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !job) return json(404, { ok: false, code: "JOB_NOT_FOUND" });
  if (job.status !== "running") {
    return json(200, { ok: true, drained: 0, status: job.status, remaining: null, note: "Job not running" });
  }

  const action = job.action as "activate" | "reset";
  const senderName = action === "activate" ? "activate-ghost-user" : "send-password-reset";
  const throttle = typeof job.throttle_ms === "number" ? job.throttle_ms : THROTTLE_MS_DEFAULT;
  const batchSize = typeof job.batch_size === "number" ? job.batch_size : 10;
  const workerId = `worker-${caller.id.slice(0,8)}-${crypto.randomUUID().slice(0,8)}`;

  let drained = 0;
  let sent = 0, skipped = 0, failed = 0;
  let aborted: string | null = null;
  let consecutiveLocal = 0;

  while (true) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) { aborted = "TIME_BUDGET"; break; }

    // Lease a chunk
    const { data: leased, error: leaseErr } = await userClient.rpc("lease_cohort_job_items", {
      p_job_id: jobId, p_worker_id: workerId, p_limit: batchSize, p_caller_id: caller.id,
    });
    if (leaseErr) { aborted = `LEASE_FAILED: ${leaseErr.message}`; break; }
    if (!leased || leased.length === 0) break;

    for (const item of leased as Array<{ id: number; user_uuid: string; tenant_id: number | null; email: string | null; planned_action: string }>) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) { aborted = "TIME_BUDGET"; break; }
      if (drained > 0) await sleep(throttle);

      // Items planned as 'skip' were finalised at launch and should not be leased,
      // but guard anyway.
      if (item.planned_action !== action) {
        await userClient.rpc("record_cohort_item_outcome", {
          p_item_id: item.id, p_outcome: "skipped", p_reason: "Action mismatch — re-evaluated", p_caller_id: caller.id,
        });
        skipped++; drained++; continue;
      }

      // Activate requires a tenant assignment; skip if missing.
      if (action === "activate" && (item.tenant_id === null || item.tenant_id === undefined)) {
        await userClient.rpc("record_cohort_item_outcome", {
          p_item_id: item.id, p_outcome: "skipped", p_reason: "No tenant assigned — cannot activate", p_caller_id: caller.id,
        });
        skipped++; drained++; continue;
      }



      const invokeBody = action === "activate"
        ? { user_uuid: item.user_uuid, tenant_id: item.tenant_id }
        : { user_uuid: item.user_uuid };

      let outcome: "sent" | "skipped" | "failed" = "failed";
      let reason: string | null = null;
      let payload: any = undefined;
      try {
        const { data, error } = await admin.functions.invoke(senderName, {
          body: invokeBody,
          headers: { Authorization: `Bearer ${token}` },
        });

        // supabase.functions.invoke surfaces non-2xx via `error.context`; parse if present
        payload = data;
        if (error && (error as any).context) {
          try { payload = await (error as any).context.json(); }
          catch { try { payload = JSON.parse(await (error as any).context.text()); } catch { /* noop */ } }
        }

        if (payload?.ok) {
          outcome = "sent";
        } else if (payload && payload.ok === false) {
          const code = payload.code as string | undefined;
          const stateMismatch =
            code === "AUTH_USER_NOT_FOUND" ||
            code === "ALREADY_ACTIVATED" ||
            code === "USER_DISABLED" ||
            code === "USER_NOT_FOUND";
          outcome = stateMismatch ? "skipped" : "failed";
          reason = payload.detail || code || "Sender refused the action";
          if (code === "AUTH_USER_NOT_FOUND" && action === "reset") reason = "No auth account yet — use Activate";
          if (code === "ALREADY_ACTIVATED" && action === "activate") reason = "Already activated — use Send password reset";
        } else if (error) {
          outcome = "failed";
          reason = error.message || "Sender transport error";
        } else {
          outcome = "failed";
          reason = "Empty sender response";
        }
      } catch (e) {
        outcome = "failed";
        reason = (e as Error)?.message || String(e);
      }

      await userClient.rpc("record_cohort_item_outcome", {
        p_item_id: item.id, p_outcome: outcome, p_reason: reason, p_caller_id: caller.id,
      });

      if (payload?.ok === true && typeof payload?.action_link === "string" && payload.action_link.length > 0) { // APP_BASE_URL from sender
        await admin
          .from("cohort_send_job_items")
          .update({ action_link: payload.action_link }) // stored copy of APP_BASE_URL link
          .eq("id", item.id);
      }

      drained++;
      if (outcome === "sent") { sent++; consecutiveLocal = 0; }
      else if (outcome === "skipped") { skipped++; consecutiveLocal = 0; }
      else { failed++; consecutiveLocal++; }

      if (consecutiveLocal >= MAX_CONSECUTIVE_FAILURES) {
        await userClient.rpc("set_cohort_job_status", { p_job_id: jobId, p_status: "paused", p_caller_id: caller.id });
        aborted = "TOO_MANY_FAILURES"; break;
      }
    }
    if (aborted) break;
  }

  // Try to finalise (no-op unless 0 pending remain)
  let finalStatus: string | null = null;
  try {
    const { data } = await userClient.rpc("finalise_cohort_job", { p_job_id: jobId, p_caller_id: caller.id });
    finalStatus = (data as string) ?? null;
  } catch { /* noop */ }

  // Re-read remaining
  const { count: remaining } = await admin
    .from("cohort_send_job_items")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("outcome", "pending");

  return json(200, {
    ok: true,
    drained, sent, skipped, failed,
    aborted, status: finalStatus ?? "running",
    remaining: remaining ?? null,
  });
});
