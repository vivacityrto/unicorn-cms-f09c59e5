import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyHmacSha256Hex } from "../_shared/webhook-signature.ts";
import { parseTaskEventPayload } from "../_shared/rock-task-sync-payload.ts";

// auth-gate: none -- machine-to-machine webhook. Each request is authenticated
// by an HMAC-SHA256 signature (ROCK_TASK_SYNC_SECRET) over the raw body, not by
// a per-user caller, hence verify_jwt = false in config.toml.
//
// Receives the GitHub [task] event the ComplyHub repo publishes for its Planner
// bridge and hands it to apply_rock_task_sync_event(), which links the task to
// its Unicorn milestone and applies the sync policy (a started task moves a
// milestone to in progress, a blocked task blocks it, and all-closed is derived
// as "ready for review"; the sync never completes a milestone).
//
// No corsHeaders: called server-to-server from GitHub Actions, never a browser.

const SYNC_SECRET = (Deno.env.get("ROCK_TASK_SYNC_SECRET") ?? "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPECTED_TENANT_ID = Number(Deno.env.get("ROCK_TASK_SYNC_TENANT_ID") ?? "6372");
const ALLOWED_REPOSITORIES = (Deno.env.get("ROCK_TASK_SYNC_REPOSITORIES") ?? "ComplyHub-ai/rto-compass-hub")
  .split(",")
  .map((repo) => repo.trim())
  .filter(Boolean);

const MAX_BODY_BYTES = 64 * 1024;

if (!SYNC_SECRET) {
  console.error("[rock-task-sync] ROCK_TASK_SYNC_SECRET is not set — refusing all requests");
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!SYNC_SECRET || !Number.isInteger(EXPECTED_TENANT_ID)) {
    return new Response("Webhook is not configured", { status: 500 });
  }

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json({ error: "payload_too_large" }, 413);
  }

  const signature = req.headers.get("x-signature-256") ?? "";
  const valid = await verifyHmacSha256Hex(SYNC_SECRET, rawBody, signature);
  if (!valid) {
    console.error("[rock-task-sync] Signature mismatch");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = parseTaskEventPayload(payload, { allowedRepositories: ALLOWED_REPOSITORIES });
  if (!parsed.ok) {
    if (parsed.kind === "ignored") {
      // Asks and tasks with no milestone link are expected traffic: acknowledge.
      return json({ outcome: "ignored", reason: parsed.reason }, 200);
    }
    console.error("[rock-task-sync] Invalid payload:", parsed.reason);
    return json({ error: "invalid_payload", reason: parsed.reason }, 400);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabaseAdmin.rpc("apply_rock_task_sync_event", {
    p_event: parsed.event,
    p_expected_tenant_id: EXPECTED_TENANT_ID,
  });

  if (error) {
    // 500 so the sender's retry logic (429/5xx) redelivers; the RPC is idempotent.
    console.error("[rock-task-sync] RPC failed:", error.message);
    return json({ error: "sync_failed" }, 500);
  }

  const result = (data ?? {}) as { outcome?: string; reason?: string };
  if (result.outcome === "rejected") {
    // Signed and well-formed, but names a milestone that isn't in the expected
    // tenant. Not retryable: surface it to the sender.
    return json(result as Record<string, unknown>, 422);
  }
  return json(result as Record<string, unknown>, 200);
});
