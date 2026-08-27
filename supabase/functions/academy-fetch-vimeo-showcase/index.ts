/**
 * RETIRED — dead-code cleanup follow-up (28 Aug 2026).
 *
 * A "preview before import" companion to academy-import-vimeo-showcase that
 * was never wired to any frontend caller. The live showcase-preview UI
 * (AcademyAddCoursePage.tsx's handlePreviewShowcase) calls
 * academy-import-vimeo-showcase directly instead — this function was a
 * distinct, separately-built sibling that never got a real caller.
 * Independently re-verified via repo-wide grep (zero references) and
 * production edge-function logs (zero invocations in the last 24h) before
 * retirement; Carl confirmed no "preview before import" UX built on this
 * specific function is planned.
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
      error: "This function has been retired (28 Aug 2026) — never had a real caller. Use academy-import-vimeo-showcase instead.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
