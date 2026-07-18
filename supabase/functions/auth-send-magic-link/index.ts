/**
 * RETIRED — Unicorn security audit (magic-link follow-up, 18 Jul 2026).
 *
 * Previously accepted { email } with zero caller authentication and called
 * supabase.auth.admin.generateLink + Mailgun. Live probe on
 * yxkgdalkbrriasiyyrwk: unauthenticated POST reached EMAIL_SEND_FAILED
 * (Mailgun Forbidden) — i.e. generateLink ran without a user JWT.
 *
 * No in-repo callers. Login magic-link uses supabase.auth.signInWithOtp.
 * Survivor for gated edge sends: send-magic-link.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error:
        "This function has been retired (unauthenticated magic-link sender). Use send-magic-link or supabase.auth.signInWithOtp instead.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
