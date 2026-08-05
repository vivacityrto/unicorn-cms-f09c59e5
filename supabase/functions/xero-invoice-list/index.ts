import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const XERO_CLIENT_ID = (Deno.env.get("XERO_CLIENT_ID") ?? "").trim();
const XERO_CLIENT_SECRET = (Deno.env.get("XERO_CLIENT_SECRET") ?? "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CONTACT_ID_RE = /\/contact\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseXeroDate(xeroDateStr: string | undefined | null): string | null {
  if (!xeroDateStr) return null;
  const match = xeroDateStr.match(/\/Date\((\d+)/);
  return match ? new Date(parseInt(match[1], 10)).toISOString() : null;
}

// Allow-list, not block-list - safer for "everything except money" than
// trying to remember every dollar-bearing field to strip. Line item
// Description is deliberately excluded even though it's not a money
// *field* - Xero line item descriptions embed dollar figures as free
// text (e.g. "TOTAL AMOUNT PAYABLE: $40,425"), which would leak the
// exact thing this is meant to exclude. ItemCode/Item name convey what
// the line is for without that.
function redactInvoice(inv: any) {
  return {
    invoiceId: inv.InvoiceID,
    invoiceNumber: inv.InvoiceNumber ?? null,
    type: inv.Type ?? null,
    status: inv.Status ?? null,
    reference: inv.Reference ?? null,
    contactName: inv.Contact?.Name ?? null,
    date: inv.DateString ?? null,
    dueDate: inv.DueDateString ?? null,
    updatedAt: inv.UpdatedDateUTCString ?? null,
    fullyPaidOn: parseXeroDate(inv.FullyPaidOnDate),
    sentToContact: inv.SentToContact ?? null,
    hasAttachments: inv.HasAttachments ?? null,
    repeatingInvoiceId: inv.RepeatingInvoiceID ?? null,
    currencyCode: inv.CurrencyCode ?? null,
    lineItems: (inv.LineItems ?? []).map((li: any) => ({
      itemCode: li.ItemCode ?? null,
      itemName: li.Item?.Name ?? null,
      quantity: li.Quantity ?? null,
      accountCode: li.AccountCode ?? null,
    })),
    payments: (inv.Payments ?? []).map((p: any) => ({
      date: parseXeroDate(p.Date),
      reference: p.Reference || null,
    })),
    creditNotesCount: (inv.CreditNotes ?? []).length,
    prepaymentsCount: (inv.Prepayments ?? []).length,
    overpaymentsCount: (inv.Overpayments ?? []).length,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // Auth: any Vivacity staff, same gate as xero-invoice-status - the
    // Integrator-only restriction was dropped once the response was
    // confirmed to have every money field stripped (see redactInvoice),
    // leaving no more sensitive than the paid/unpaid pill everyone can
    // already see.
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
      return json(200, { connected: null, linked: false, error: "This client has no Xero Contact URL saved." });
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
      return json(200, { connected: false, linked: true, error: "Xero is not connected." });
    }

    let accessToken = tokenRow.access_token as string;
    const tenantAccountId = tokenRow.provider_account_id as string | null;

    if (!tenantAccountId) {
      return json(200, { connected: false, linked: true, error: "Xero connection is missing its organisation id." });
    }

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
        return json(200, { connected: false, linked: true, error: "Xero connection has expired and could not refresh." });
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

    // Follow pagination - Xero caps each page at 100 items (see
    // xero-invoice-sync-all for where this bit us at batch scale).
    let allInvoices: any[] = [];
    let page = 1;
    while (true) {
      const resp = await fetch(
        `https://api.xero.com/api.xro/2.0/Invoices?ContactIDs=${contactId}&order=Date%20DESC&page=${page}`,
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Xero-tenant-id": tenantAccountId,
            "Accept": "application/json",
          },
        }
      );

      if (!resp.ok) {
        const errText = await resp.text();
        return json(200, { connected: true, linked: true, error: `Failed to fetch invoices from Xero: ${errText}` });
      }

      const data = await resp.json();
      allInvoices = allInvoices.concat(data.Invoices ?? []);
      const pageCount = data.pagination?.pageCount ?? 1;
      if (page >= pageCount) break;
      page++;
    }

    // DELETED invoices aren't meaningful to show (draft/voided still are -
    // seeing a voided invoice in the list is exactly what surfaced the
    // earlier paid/unpaid bug, so this view should show the full history).
    const invoices = allInvoices
      .filter((inv: any) => inv.Status !== "DELETED")
      .map(redactInvoice);

    return json(200, { connected: true, linked: true, invoices });
  } catch (error) {
    console.error("[xero-invoice-list] Unhandled error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(500, { error: message });
  }
});
