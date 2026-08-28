/**
 * RETIRED — dead-code cleanup follow-up (28 Aug 2026).
 *
 * A duplicate of the live mailgun-webhook (singular) function. A prior
 * security audit's claim that only the singular was "re-verified live" was
 * contradicted by this repo's own MAILGUN_SETUP.md, which instructed
 * pointing Mailgun at this plural URL — an internal grep could never
 * resolve which was actually correct. Settled by checking Mailgun's actual
 * dashboard webhook configuration directly (28 Aug 2026): only
 * mailgun-webhook (singular) is configured, receiving all 8 event types
 * (Accepted, Delivered, Opened, +5 more). This plural function has never
 * received real traffic. MAILGUN_SETUP.md corrected in the same change.
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
      error: "This function has been retired (28 Aug 2026) — Mailgun's actual dashboard configuration confirms it never received real traffic. Use mailgun-webhook instead.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
