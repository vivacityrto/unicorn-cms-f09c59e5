import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// No corsHeaders needed - Xero calls this server-to-server, never from a browser.

const XERO_WEBHOOK_KEY = (Deno.env.get("XERO_WEBHOOK_KEY") ?? "").trim();
const XERO_CLIENT_ID = (Deno.env.get("XERO_CLIENT_ID") ?? "").trim();
const XERO_CLIENT_SECRET = (Deno.env.get("XERO_CLIENT_SECRET") ?? "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CONTACT_ID_RE = /\/contact\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

async function computeSignature(rawBody: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(rawBody));
  return btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Xero requires a bare 200 (no body needed) within 5 seconds, and
  // authenticates purely via this HMAC signature - there is no Supabase
  // auth header at all, hence verify_jwt = false in config.toml. This
  // same check handles both real events and Xero's "intent to receive"
  // validation ping (an empty events array) identically.
  const rawBody = await req.text();
  const signature = req.headers.get("x-xero-signature") ?? "";

  if (!XERO_WEBHOOK_KEY) {
    console.error("[xero-webhook] XERO_WEBHOOK_KEY not configured - cannot verify signature");
    return new Response("Not configured", { status: 401 });
  }

  const expectedSignature = await computeSignature(rawBody, XERO_WEBHOOK_KEY);
  if (signature !== expectedSignature) {
    console.error("[xero-webhook] Signature mismatch");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: { events?: Array<Record<string, unknown>> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Signature was valid but body isn't JSON - still ack with 200 so
    // Xero doesn't mark the webhook unhealthy over a shape we don't
    // understand; nothing to process either way.
    return new Response("ok", { status: 200 });
  }

  const events = payload.events ?? [];
  if (events.length === 0) {
    // Intent-to-receive validation ping - signature check above is the
    // entire validation Xero requires here.
    return new Response("ok", { status: 200 });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const invoiceEvents = events.filter((e) => e.eventCategory === "INVOICE");

  if (invoiceEvents.length > 0) {
    try {
      await processInvoiceEvents(supabaseAdmin, invoiceEvents);
    } catch (error) {
      // Log and still ack 200 - Xero interprets a non-2xx as delivery
      // failure and retries/eventually disables the webhook. A processing
      // bug on our side shouldn't cascade into losing webhook health;
      // the scheduled sync-all job is the reconciliation fallback for
      // anything missed here.
      console.error("[xero-webhook] Failed to process invoice events:", error);
    }
  }

  return new Response("ok", { status: 200 });
});

async function processInvoiceEvents(
  supabaseAdmin: ReturnType<typeof createClient>,
  invoiceEvents: Array<Record<string, unknown>>
) {
  const { data: tokenRow } = await supabaseAdmin
    .from("oauth_tokens")
    .select("*")
    .eq("provider", "xero")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tokenRow) {
    console.warn("[xero-webhook] Xero not connected, skipping invoice events");
    return;
  }

  let accessToken = tokenRow.access_token as string;
  const tenantAccountId = tokenRow.provider_account_id as string | null;
  if (!tenantAccountId) {
    console.warn("[xero-webhook] Xero connection missing organisation id, skipping");
    return;
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
      console.error("[xero-webhook] Token refresh failed:", errText);
      return;
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

  // Webhook events only carry an invoice ID, not the invoice or its
  // contact - step 1 is just to learn which contact(s) were touched.
  // A batch can contain multiple events for the same contact (or the
  // same invoice edited twice), so dedupe before re-checking anyone.
  const touchedContactIds = new Set<string>();
  for (const event of invoiceEvents) {
    const invoiceId = event.resourceId as string | undefined;
    if (!invoiceId) continue;

    const invResp = await fetch(`https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-tenant-id": tenantAccountId,
        "Accept": "application/json",
      },
    });

    if (!invResp.ok) {
      console.error("[xero-webhook] Failed to fetch invoice", invoiceId, invResp.status);
      continue;
    }

    const invData = await invResp.json();
    const contactId = invData.Invoices?.[0]?.Contact?.ContactID;
    if (contactId) touchedContactIds.add(contactId);
  }

  // Step 2: the event told us *an* invoice changed, not necessarily the
  // contact's most recent one - re-derive "most recent" the same way
  // xero-invoice-status/xero-invoice-sync-all do, rather than trusting
  // the notified invoice is automatically the current one.
  for (const contactId of touchedContactIds) {
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
      console.error("[xero-webhook] Failed to re-fetch invoices for contact", contactId, invoicesResp.status);
      continue;
    }

    // DRAFT/VOIDED/DELETED carry no real financial obligation - skip
    // past those rather than letting one outrank a genuinely
    // PAID/AUTHORISED invoice just for having a later date.
    const invoicesData = await invoicesResp.json();
    const mostRecent = (invoicesData.Invoices ?? []).find(
      (inv: any) => !["DRAFT", "VOIDED", "DELETED"].includes(inv.Status)
    ) ?? null;
    const paid = mostRecent ? mostRecent.Status === "PAID" : null;
    const dueDate = mostRecent && !paid ? (mostRecent.DueDateString ?? mostRecent.DueDate ?? null) : null;

    const { data: matchingTenants } = await supabaseAdmin
      .from("tenants")
      .select("id, xero_contact_url")
      .ilike("xero_contact_url", `%${contactId}%`);

    for (const tenant of matchingTenants ?? []) {
      const match = (tenant.xero_contact_url as string | null)?.match(CONTACT_ID_RE);
      if (match?.[1]?.toLowerCase() !== contactId.toLowerCase()) continue; // guard against ILIKE substring false-positives

      await supabaseAdmin.from("tenants").update({
        xero_invoice_paid: paid,
        xero_invoice_due_date: dueDate,
        xero_invoice_checked_at: new Date().toISOString(),
      }).eq("id", tenant.id);
    }
  }
}
