/**
 * RETIRED — dead-code cleanup follow-up (28 Aug 2026).
 *
 * Its only caller, src/components/stage/StageCompletenessWidget.tsx, had
 * zero importers anywhere in the app (confirmed via repo-wide grep) and was
 * removed in the same cleanup pass. No other frontend surface or edge
 * function ever called this. Carl confirmed phase-completeness tracking is
 * not a feature to preserve or re-wire elsewhere.
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
      error: "This function has been retired (28 Aug 2026) — its only caller, StageCompletenessWidget.tsx, was removed as dead code.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
