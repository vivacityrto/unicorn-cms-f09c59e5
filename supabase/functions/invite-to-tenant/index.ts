/**
 * RETIRED — dead-code cleanup follow-up (28 Aug 2026).
 *
 * Superseded by invite-user: this function's own prior source noted it had
 * no VIVACITY invite_as branch, unlike invite-user, meaning it was the
 * narrower/earlier of the two. Every tenant-invite UI (TenantInviteDialog,
 * useInviteMutations, etc.) calls invite-user, not this function — zero
 * frontend references found. A migration comment (20260818040717) names
 * this as one of three "current INSERT paths" into user_invitations, but
 * that's descriptive of the trigger fix, not a functional dependency: the
 * trigger trusts NEW.invited_by regardless of which function set it, so
 * removing this caller doesn't affect invite-user or activate-ghost-user.
 * Zero production invocations in the last 24h. Carl confirmed retirement.
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
      error: "This function has been retired (28 Aug 2026) — superseded by invite-user.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
