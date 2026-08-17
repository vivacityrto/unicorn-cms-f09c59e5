/**
 * RETIRED — final security audit (17 Aug 2026).
 *
 * This legacy, untracked edge function mutated the deprecated
 * tenants.package_id workflow and created task instances with a service-role
 * client. There are no in-repository callers and no recent function-log hits.
 * Package assignment is now handled by the tracked package-instance flows.
 */
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  return new Response(
    JSON.stringify({
      error: "This legacy package-assignment endpoint has been retired.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    },
  );
});
