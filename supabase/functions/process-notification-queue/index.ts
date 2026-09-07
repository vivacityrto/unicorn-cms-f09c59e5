/**
 * RETIRED — notification migration stabilization (7 Sep 2026).
 *
 * This named deployment is kept as an explicit 410 rather than deleted so
 * stale cron invocations or undocumented callers fail closed and visibly.
 * The worker previously read the legacy scheduling table, but no cron job or
 * frontend/Edge caller remains and that table is being retired separately in
 * M3-C after a quiet-period proof.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// auth-gate: none -- this endpoint is a credential-free 410 retirement stub;
// accepting any caller is intentional so stale invocations fail visibly.
serve((req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  return new Response(
    JSON.stringify({
      error: "This legacy notification queue deployment has been retired.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...headers, "Content-Type": "application/json" },
    },
  );
});
