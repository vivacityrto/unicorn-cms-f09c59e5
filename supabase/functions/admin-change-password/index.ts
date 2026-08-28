/**
 * RETIRED — dead-code cleanup follow-up (28 Aug 2026).
 *
 * SuperAdmin-only force-password-set for another user, bypassing the normal
 * email reset flow. Zero frontend callers (checked exact name plus related
 * "change/reset/force password" UI, no match), zero production invocations
 * in the last 24h, and Carl confirmed no Super Admin has used or known of
 * this as a manual unlock tool. Safe to retire.
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
      error: "This function has been retired (28 Aug 2026) — no known caller, confirmed with the project owner.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
