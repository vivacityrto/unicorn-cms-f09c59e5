/**
 * RETIRED — 16 Aug 2026.
 *
 * Hosted slug: e77f4567-a230-4294-b8cd-9888092c2448
 * Display name: clickup-integration
 *
 * Unauthenticated May 2025 Lovable mock (verify_jwt=false, CORS *).
 * Letter-leading UUID so MCP deploy can replace the body. This stub
 * carries no service-role key and no ClickUp credentials.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(
    JSON.stringify({
      error: "This legacy UUID-slug clickup-integration deployment has been retired.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
