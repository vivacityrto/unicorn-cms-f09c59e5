/**
 * RETIRED — Unicorn security audit C1 (14 Jul 2026).
 *
 * Previously minted unauthenticated access/refresh tokens for any requested
 * email. No in-repo callers were found. Admin login-as remains via
 * generate-recovery-link (admin.team_users.manage / full).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  return new Response(
    JSON.stringify({
      error:
        "This function has been retired (security finding C1, 14 Jul 2026). Use generate-recovery-link instead.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    },
  );
});
