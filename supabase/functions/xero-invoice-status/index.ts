import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Trimmed defensively - see xero-auth for why (trailing whitespace from
// pasting into Supabase's secrets UI breaks Basic Auth with no visible
// symptom except Xero's invalid_client rejection).
const XERO_CLIENT_ID = (Deno.env.get("XERO_CLIENT_ID") ?? "").trim();
const XERO_CLIENT_SECRET = (Deno.env.get("XERO_CLIENT_SECRET") ?? "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// The go.xero.com contact URLs already saved on tenants.xero_contact_url embed
// the real Xero ContactID as a GUID, e.g.
// https://go.xero.com/app/!6hi6G/contacts/contact/{ContactID}/... - no
// separate Contact-matching step needed.
const CONTACT_ID_RE = /\/contact\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // Auth: any Vivacity staff may check invoice status (read-only,
    // lower stakes than connecting/disconnecting the shared credential -
    // see xero-auth).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(401, { error: "Missing bearer token" });
    }
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return json(401, { error: "Invalid or expired token" });
    }
    const { data: callerProfile } = await supabaseAdmin
      .from("users")
      .select("is_vivacity_internal")
      .eq("user_uuid", user.id)
      .maybeSingle();
    if (!callerProfile?.is_vivacity_internal) {
      return json(403, { error: "Vivacity staff only" });
    }

    const body = await req.json().catch(() => ({}));
    const tenantId = body.tenant_id as number | undefined;
    if (!tenantId) {
      return json(400, { error: "tenant_id is required" });
    }

    const { data: tenantRow } = await supabaseAdmin
      .from("tenants")
      .select("xero_contact_url")
      .eq("id", tenantId)
      .maybeSingle();

    const contactMatch = tenantRow?.xero_contact_url?.match(CONTACT_ID_RE);
    if (!contactMatch) {
      return json(200, {
        connected: null,
        linked: false,
        error: "This client has no Xero Contact URL saved, so there is no Xero Contact to look up.",
      });
    }
    const contactId = contactMatch[1];

    const { data: tokenRow } = await supabaseAdmin
      .from("oauth_tokens")
      .select("*")
      .eq("provider", "xero")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tokenRow) {
      return json(200, { connected: false, linked: true, error: "Xero is not connected. Ask a Super Admin to connect it." });
    }

    let accessToken = tokenRow.access_token as string;
    const tenantAccountId = tokenRow.provider_account_id as string | null;

    if (!tenantAccountId) {
      return json(200, {
        connected: false,
        linked: true,
        error: "Xero connection is missing its organisation id - reconnect from Admin > Integrations > Xero.",
      });
    }

    // Refresh if expired (or about to expire within 60s). Xero rotates the
    // refresh token on every use - the new one must be saved immediately or
    // the next refresh will fail.
    const expiresAt = new Date(tokenRow.expires_at as string);
    if (expiresAt.getTime() - Date.now() < 60_000) {
      const basicAuth = btoa(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`);
      const refreshResp = await fetch("https://identity.xero.com/connect/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokenRow.refresh_token as string,
        }),
      });

      if (!refreshResp.ok) {
        const errText = await refreshResp.text();
        await supabaseAdmin.from("oauth_tokens")
          .update({ last_error: `Token refresh failed: ${errText}`, updated_at: new Date().toISOString() })
          .eq("provider", "xero");
        return json(200, {
          connected: false,
          linked: true,
          error: "Xero connection has expired and could not refresh. Ask a Super Admin to reconnect.",
        });
      }

      const refreshed = await refreshResp.json();
      accessToken = refreshed.access_token;
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

      await supabaseAdmin.from("oauth_tokens").update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: newExpiresAt.toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("provider", "xero");
    }

    const invoicesResp = await fetch(
      `https://api.xero.com/api.xro/2.0/Invoices?ContactIDs=${contactId}&order=Date%20DESC`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Xero-tenant-id": tenantAccountId,
          "Accept": "application/json",
        },
      }
    );

    if (!invoicesResp.ok) {
      const errText = await invoicesResp.text();
      await supabaseAdmin.from("oauth_tokens")
        .update({ last_error: `Invoice lookup failed (${invoicesResp.status}): ${errText}`, updated_at: new Date().toISOString() })
        .eq("provider", "xero");
      return json(200, { connected: true, linked: true, error: "Failed to fetch invoices from Xero." });
    }

    // Already requested with order=Date DESC. DRAFT/VOIDED/DELETED carry
    // no real financial obligation - a voided invoice has AmountDue=0,
    // it isn't "unpaid". Skip past those to find the most recent invoice
    // that's actually PAID/AUTHORISED/SUBMITTED (confirmed against real
    // Xero data: a VOIDED invoice was outranking a genuinely PAID one).
    const invoicesData = await invoicesResp.json();
    const allInvoices = invoicesData.Invoices || [];
    const NON_ACTIONABLE_STATUSES = new Set(["DRAFT", "VOIDED", "DELETED"]);
    const mostRecent = allInvoices.find((inv: any) => !NON_ACTIONABLE_STATUSES.has(inv.Status)) ?? null;

    // Staff only need "is the most recent invoice paid, and if not, when
    // was it due" - not itemised detail (amounts, invoice numbers,
    // references). Deliberately not returning that to the frontend at
    // all, not just hiding it in the UI.
    const mostRecentPaid = mostRecent ? mostRecent.Status === "PAID" : null;
    const mostRecentDueDate = mostRecent && !mostRecentPaid
      ? (mostRecent.DueDateString ?? mostRecent.DueDate ?? null)
      : null;

    await supabaseAdmin.from("oauth_tokens")
      .update({ last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
      .eq("provider", "xero");

    // Write through to the cache columns Manage Tenants reads (that list
    // page loads every tenant at once and cannot do a live Xero call per
    // row) - a manual "Check Xero" click refreshes the cache immediately,
    // same as the scheduled sync-all job does for everyone else.
    await supabaseAdmin.from("tenants").update({
      xero_invoice_paid: mostRecentPaid,
      xero_invoice_due_date: mostRecentDueDate,
      xero_invoice_checked_at: new Date().toISOString(),
    }).eq("id", tenantId);

    return json(200, {
      connected: true,
      linked: true,
      has_invoices: !!mostRecent,
      most_recent_paid: mostRecentPaid,
      most_recent_due_date: mostRecentDueDate,
    });
  } catch (error) {
    console.error("[xero-invoice-status] Unhandled error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(500, { error: message });
  }
});
