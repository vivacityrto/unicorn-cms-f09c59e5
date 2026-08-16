/**
 * RETIRED — outbound-email hardening (15 Aug 2026).
 *
 * Historical Lovable UUID-slug copies of send-test-email (verify_jwt=false,
 * no caller gate, CORS *). There were THREE UUID copies, not two:
 *   dcd6c745-…  (letter-leading — 410 stub via MCP)
 *   c22daa64-…  (letter-leading — 410 stub via MCP)
 *   64329f1f-…  (digit-leading — MCP deploy rejects the slug; must be
 *                deleted or stubbed via Management API / dashboard)
 * The keeper is the named slug `send-test-email` (super-admin gated).
 * This stub carries no service-role key and no SendGrid client.
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
