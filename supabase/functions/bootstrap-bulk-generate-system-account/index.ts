// bootstrap-bulk-generate-system-account
//
// NEUTRALIZED. This was a ONE-TIME provisioning function that created the
// dedicated bulk-generate-documents-worker system account
// (bulk-generate-automation@vivacity.com.au) and its Vault-backed session.
// That provisioning already happened successfully; this endpoint no longer
// does anything and is kept only as an inert placeholder for the slug.
//
// See docs/audit-log/entries/2026-08-19-bulk-generate-system-account-auto-refresh.md
// for what it did while live: created the auth user + users row (Team
// Member, is_vivacity_internal), signed in once, and stored the resulting
// session via set_bulk_generate_system_session (gated by requireSuperAdmin,
// idempotent on re-invocation).

import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });
  return new Response(
    JSON.stringify({ error: 'This one-time provisioning function has already run and is now disabled.' }),
    { status: 410, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
  );
});
