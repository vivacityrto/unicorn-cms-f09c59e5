/**
 * RETIRED — outbound-email hardening (15 Aug 2026).
 *
 * Historical Lovable UUID-slug copies of send-test-email (verify_jwt=false,
 * no caller gate, CORS *). Two of the three deployments are neutralized
 * here. The keeper is the named slug `send-test-email` (super-admin gated).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeadersFor } from "../../_shared/requireCaller.ts";

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(
    JSON.stringify({
      error:
        "This duplicate send-test-email deployment has been retired. Use the named slug send-test-email.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
