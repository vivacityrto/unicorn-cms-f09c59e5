/**
 * RETIRED — dead-code cleanup follow-up (28 Aug 2026).
 *
 * Built ahead of a planned "Sprint 3 AI layer" frontend (Addendum §3.3/§3.7)
 * that never shipped — it read from tga_scope_units/tga_units tables that
 * remained empty in production throughout. Carl confirmed that Sprint 3 AI
 * layer work is no longer planned, so this function has no future caller
 * to wait for.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "This function has been retired (28 Aug 2026) — built ahead of a Sprint 3 AI layer that was never planned to ship.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
