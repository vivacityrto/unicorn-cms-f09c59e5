import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeCronInvoke } from "../_shared/cron-invoke-auth.ts";


const XERO_CLIENT_ID = (Deno.env.get("XERO_CLIENT_ID") ?? "").trim();
const XERO_CLIENT_SECRET = (Deno.env.get("XERO_CLIENT_SECRET") ?? "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CONTACT_ID_RE = /\/contact\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

// Conservative batch size for Xero's comma-separated ContactIDs filter -
// keeps URL length and per-call payload size sane without needing to
// discover Xero's actual practical limit the hard way.
const BATCH_SIZE = 25;

interface XeroInvoice {
  Contact?: { ContactID?: string | null } | null;
  Status?: string | null;
  DateString?: string | null;
  Date?: string | null;
  DueDateString?: string | null;
  DueDate?: string | null;
}

interface XeroInvoiceResponse {
  Invoices?: XeroInvoice[];
  pagination?: { pageCount?: number };
}

function json(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  // Cron-only system job. Auth is the shared invoke secret, not a
  // decoded-but-unverified JWT role claim (that path was a bypass).
  if (!(await authorizeCronInvoke(req))) {
    return json(req, 401, { error: "Unauthorized" });

  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const { data: tokenRow } = await supabaseAdmin
      .from("oauth_tokens")
      .select("*")
      .eq("provider", "xero")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tokenRow) {
      return json(req, 200, { synced: 0, failed: 0, skipped_reason: "Xero not connected" });
    }

    let accessToken = tokenRow.access_token as string;
    const tenantAccountId = tokenRow.provider_account_id as string | null;

    if (!tenantAccountId) {
      return json(req, 200, { synced: 0, failed: 0, skipped_reason: "Xero connection missing organisation id" });
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
        return json(req, 200, { synced: 0, failed: 0, skipped_reason: "Token refresh failed" });
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

    const { data: tenants, error: tenantsError } = await supabaseAdmin
      .from("tenants")
      .select("id, xero_contact_url")
      .not("xero_contact_url", "is", null);

    if (tenantsError) {
      console.error("[xero-invoice-sync-all] Failed to load tenants:", tenantsError);
      return json(req, 500, { error: "Failed to load tenants" });
    }

    // Multiple tenants could theoretically share a ContactID (shouldn't
    // happen, but cheap to guard for) - map contactId -> [tenantId, ...].
    const contactToTenants = new Map<string, number[]>();
    for (const t of tenants ?? []) {
      const match = (t.xero_contact_url as string | null)?.match(CONTACT_ID_RE);
      if (!match) continue;
      const list = contactToTenants.get(match[1]) ?? [];
      list.push(t.id);
      contactToTenants.set(match[1], list);
    }
    const contactIds = Array.from(contactToTenants.keys());

    let synced = 0;
    let failed = 0;

    for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
      const batch = contactIds.slice(i, i + BATCH_SIZE);

      // Xero caps each page at 100 items combined across every contact in
      // the request, not per contact - 25 contacts' invoices can easily
      // exceed that, silently dropping some contacts' data off page 1 if
      // pagination isn't followed (confirmed against real data: two
      // tenants with genuine PAID invoices came back null because their
      // invoices landed on page 2+).
      let invoices: XeroInvoice[] = [];
      let batchFailed = false;
      let page = 1;
      while (true) {
        const resp = await fetch(
          `https://api.xero.com/api.xro/2.0/Invoices?ContactIDs=${batch.join(",")}&order=Date%20DESC&page=${page}`,
          {
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Xero-tenant-id": tenantAccountId,
              "Accept": "application/json",
            },
          }
        );

        if (!resp.ok) {
          console.error("[xero-invoice-sync-all] Batch fetch failed:", resp.status, await resp.text());
          failed += batch.reduce((sum, cid) => sum + (contactToTenants.get(cid)?.length ?? 0), 0);
          batchFailed = true;
          break;
        }

        const data = await resp.json() as XeroInvoiceResponse;
        invoices = invoices.concat(data.Invoices ?? []);
        const pageCount = data.pagination?.pageCount ?? 1;
        if (page >= pageCount) break;
        page++;
      }
      if (batchFailed) continue;

      // Multiple contacts' invoices come back interleaved - find each
      // contact's most recent by date explicitly rather than relying on
      // the batch-level Date DESC order. DRAFT/VOIDED/DELETED carry no
      // real financial obligation (a voided invoice has AmountDue=0) -
      // excluded so one doesn't outrank a genuinely PAID/AUTHORISED
      // invoice just for having a later date (confirmed against real
      // data: Adelaide Aviation's most recent invoice was VOIDED,
      // masking a PAID one underneath it).
      const NON_ACTIONABLE_STATUSES = new Set(["DRAFT", "VOIDED", "DELETED"]);
      const mostRecentByContact = new Map<string, XeroInvoice>();
      for (const inv of invoices) {
        const cid = inv.Contact?.ContactID;
        if (!cid || NON_ACTIONABLE_STATUSES.has(inv.Status)) continue;
        const existing = mostRecentByContact.get(cid);
        const invDate = new Date(inv.DateString ?? inv.Date ?? 0).getTime();
        const existingDate = existing ? new Date(existing.DateString ?? existing.Date ?? 0).getTime() : -Infinity;
        if (invDate > existingDate) {
          mostRecentByContact.set(cid, inv);
        }
      }

      for (const cid of batch) {
        const mostRecent = mostRecentByContact.get(cid) ?? null;
        const paid = mostRecent ? mostRecent.Status === "PAID" : null;
        const dueDate = mostRecent && !paid ? (mostRecent.DueDateString ?? mostRecent.DueDate ?? null) : null;
        const tenantIds = contactToTenants.get(cid) ?? [];

        for (const tenantId of tenantIds) {
          const { error: updateError } = await supabaseAdmin.from("tenants").update({
            xero_invoice_paid: paid,
            xero_invoice_due_date: dueDate,
            xero_invoice_checked_at: new Date().toISOString(),
          }).eq("id", tenantId);

          if (updateError) {
            console.error("[xero-invoice-sync-all] Failed to update tenant", tenantId, updateError);
            failed++;
          } else {
            synced++;
          }
        }
      }
    }

    return json(req, 200, { synced, failed, total_contacts: contactIds.length });
  } catch (error) {
    console.error("[xero-invoice-sync-all] Unhandled error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(req, 500, { error: message });
  }
});
