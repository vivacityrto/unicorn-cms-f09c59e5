/**
 * RETIRED — final security audit (17 Aug 2026).
 *
 * The original one-off Vimeo duration backfill was still publicly reachable
 * and used the service-role key to enumerate and mutate training videos.
 * It has no in-repository caller and must not remain a browser-callable API.
 */
Deno.serve(() =>
  new Response(
    JSON.stringify({
      error: "This one-off Vimeo duration backfill has been retired.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { "Content-Type": "application/json" },
    },
  )
);
