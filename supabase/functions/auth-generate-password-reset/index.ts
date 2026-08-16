import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  return new Response(
    JSON.stringify({ error: "Retired duplicate — use send-self-password-reset.", code: "FUNCTION_RETIRED" }),
    { status: 410, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
