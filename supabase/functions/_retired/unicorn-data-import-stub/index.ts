/**
 * RETIRED — 16 Aug 2026.
 *
 * Hosted slug: 61429ee4-9d13-4b39-847e-3ead08b94f71
 * Display name: unicorn-data-import
 *
 * Unauthenticated May 2025 Lovable mock (verify_jwt=false, CORS *).
 * Digit-leading UUID — MCP deploy_edge_function rejects the slug.
 * Delete or stub via Management API / dashboard. This file is the
 * intended 410 body (no service-role key).
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
      error: "This legacy UUID-slug unicorn-data-import deployment has been retired.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
