/**
 * RETIRED — Unicorn security audit follow-up (18 Jul 2026).
 *
 * Previously accepted { email } from Vivacity Super Admins and called
 * supabase.auth.admin.generateLink(type: "recovery"). Auth-gated orphan —
 * no in-repo callers. Superseded by generate-recovery-link /
 * send-password-reset (admin.team_users.manage / full).
 *
 * Neutralization: HTTP 410 stub (FUNCTION_RETIRED), same pattern as
 * auth-send-magic-link / create-session / C1.
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
        "This function has been retired (orphaned admin password-reset sender). Use generate-recovery-link instead.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    },
  );
});
