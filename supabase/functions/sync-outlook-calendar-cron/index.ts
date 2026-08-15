// Scheduled fan-out wrapper for sync-outlook-calendar.
// Invoked by pg_cron every 30 minutes with the project service-role key.
// For each user with a Microsoft oauth_tokens row, mints a short-lived
// user JWT and calls sync-outlook-calendar so its per-user logic
// (token refresh, calendar_events upsert, last_synced_at/last_error
// bookkeeping) runs unchanged.
//
// Hard rules:
//   - NEVER pass includeMeetings: true. Meetings tables stay untouched.
//   - Per-user errors do not abort the run; the downstream function
//     already persists refresh failures to oauth_tokens.last_error.
//   - Caller must present the service-role key in Authorization.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT } from "https://esm.sh/jose@5.9.6";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// SUPABASE_ prefix is reserved; the JWT signing secret is stored under EDGE_JWT_SECRET.
const JWT_SECRET = Deno.env.get("EDGE_JWT_SECRET")!;

const CONCURRENCY = 5;

async function mintUserJwt(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(secret);
}

async function syncOneUser(userId: string, accountEmail: string | null): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const jwt = await mintUserJwt(userId);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-outlook-calendar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      // Explicitly omit includeMeetings -> meetings tables untouched.
      body: JSON.stringify({ action: "sync-calendar" }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[sync-cron] user=${userId} (${accountEmail ?? "?"}) status=${res.status} body=${text.slice(0, 300)}`);
      return { ok: false, status: res.status, error: text.slice(0, 300) };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sync-cron] user=${userId} threw: ${msg}`);
    return { ok: false, error: msg };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  // Authorize: require a Supabase-issued service_role JWT for this project.
  // Accept either an exact match against SUPABASE_SERVICE_ROLE_KEY (manual
  // invocation) or any token whose decoded payload has role=service_role and
  // ref matching this project (pg_cron via private.cron_function_jwt()).
  const auth = req.headers.get("Authorization") ?? "";
  const presented = auth.replace(/^Bearer\s+/i, "").trim();
  let authorized = presented === SUPABASE_SERVICE_ROLE_KEY;
  if (!authorized && presented) {
    try {
      const parts = presented.split(".");
      if (parts.length === 3) {
        const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
        const json = JSON.parse(
          new TextDecoder().decode(
            Uint8Array.from(atob(padded.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
          ),
        );
        const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
        const notExpired = typeof json.exp !== "number" || json.exp * 1000 > Date.now();
        authorized = json.role === "service_role" && json.iss === "supabase" && json.ref === projectRef && notExpired;
      }
    } catch (_err) {
      authorized = false;
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: tokens, error } = await supabaseAdmin
    .from("oauth_tokens")
    .select("user_id, account_email")
    .eq("provider", "microsoft")
    .not("refresh_token", "is", null);

  if (error) {
    console.error("[sync-cron] Failed to list oauth_tokens:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const rows = (tokens ?? []).filter((r): r is { user_id: string; account_email: string | null } => !!r.user_id);
  console.log(`[sync-cron] Starting run for ${rows.length} Microsoft-connected users`);

  let succeeded = 0;
  let failed = 0;
  // Simple concurrency-limited fan-out.
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((r) => syncOneUser(r.user_id, r.account_email)));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.ok) succeeded++;
      else failed++;
    }
  }

  const durationMs = Date.now() - startedAt;
  const summary = { processed: rows.length, succeeded, failed, durationMs };
  console.log("[sync-cron] Run complete:", summary);

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
});
