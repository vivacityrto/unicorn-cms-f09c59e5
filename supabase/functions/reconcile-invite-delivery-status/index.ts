// Reconcile invite delivery status by pulling from Mailgun's Events API.
// Additive fallback to the mailgun-webhook push path — both write the same
// enum values to user_invitations.delivery_status / delivery_event_at, so
// last-write-wins is fine.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronInvoke } from "../_shared/cron-invoke-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY") ?? "";
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN") ?? "";
const MAILGUN_REGION = (Deno.env.get("MAILGUN_REGION") || "eu").toLowerCase();

const BATCH_SIZE = 50;
const DELAY_BETWEEN_CALLS_MS = 250;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-invoke-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Same mapping as mailgun-webhook/index.ts — keep in sync.
function mapEvent(
  event: string,
  severity: string | undefined,
): "delivered" | "bounced" | "failed" | "complained" | null {
  if (event === "delivered") return "delivered";
  if (event === "complained") return "complained";
  if (event === "failed") {
    if (severity === "permanent") return "bounced";
    if (severity === "temporary") return "failed";
  }
  return null;
}

function stripAngleBrackets(id: string): string {
  let out = String(id).trim();
  if (out.startsWith("<") && out.endsWith(">")) out = out.slice(1, -1);
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface MailgunEventItem {
  event?: string;
  severity?: string;
  timestamp?: number;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!(await authorizeCronInvoke(req))) {
    return json(401, { error: "Unauthorized" });
  }

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    return json(500, {
      error: "Mailgun env not configured",
      missing: {
        MAILGUN_API_KEY: !MAILGUN_API_KEY,
        MAILGUN_DOMAIN: !MAILGUN_DOMAIN,
      },
    });
  }

  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString();

  const { data: pending, error: selectErr } = await supabase
    .from("user_invitations")
    .select(
      "id, email, mailgun_message_id, last_sent_at, first_opened_at, first_clicked_at, open_count, click_count",
    )
    .is("delivery_status", null)
    .not("mailgun_message_id", "is", null)
    .gt("last_sent_at", sevenDaysAgo)
    .order("last_sent_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (selectErr) {
    console.log(
      "[reconcile-invite-delivery-status] select error:",
      selectErr.message,
    );
    return json(500, { error: selectErr.message });
  }

  const rows = pending ?? [];
  const apiBase = MAILGUN_REGION === "eu"
    ? "https://api.eu.mailgun.net"
    : "https://api.mailgun.net";
  const basicAuth = "Basic " + btoa(`api:${MAILGUN_API_KEY}`);

  let checked = 0;
  let updated = 0;
  let openedUpdated = 0;
  let clickedUpdated = 0;
  let stillPending = 0;
  let errors = 0;

  for (const row of rows) {
    checked++;
    const rawId = row.mailgun_message_id as string | null;
    if (!rawId) {
      stillPending++;
      continue;
    }
    const messageId = stripAngleBrackets(rawId);

    try {
      const url = `${apiBase}/v3/${MAILGUN_DOMAIN}/events?message-id=${
        encodeURIComponent(messageId)
      }`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: basicAuth,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        console.log(
          `[reconcile-invite-delivery-status] mailgun ${res.status} for invitation=${row.id}: ${
            bodyText.slice(0, 200)
          }`,
        );
        errors++;
        await sleep(DELAY_BETWEEN_CALLS_MS);
        continue;
      }

      const body = await res.json().catch(() => null) as
        | { items?: MailgunEventItem[] }
        | null;
      const items = body?.items ?? [];

      let mapped:
        | {
          status: "delivered" | "bounced" | "failed" | "complained";
          timestamp: number;
        }
        | null = null;
      let openedCount = 0;
      let firstOpenedTs: number | null = null;
      let clickedCount = 0;
      let firstClickedTs: number | null = null;

      for (const item of items) {
        const evt = item.event ?? "";
        const ts = typeof item.timestamp === "number"
          ? item.timestamp
          : Number(item.timestamp);
        const s = mapEvent(evt, item.severity);
        if (s && !mapped) {
          mapped = { status: s, timestamp: ts };
        }
        if (evt === "opened") {
          openedCount++;
          if (Number.isFinite(ts) && (firstOpenedTs === null || ts < firstOpenedTs)) {
            firstOpenedTs = ts;
          }
        } else if (evt === "clicked") {
          clickedCount++;
          if (Number.isFinite(ts) && (firstClickedTs === null || ts < firstClickedTs)) {
            firstClickedTs = ts;
          }
        }
      }

      const patch: Record<string, unknown> = {};
      if (mapped) {
        patch.delivery_status = mapped.status;
        patch.delivery_event_at = Number.isFinite(mapped.timestamp)
          ? new Date(mapped.timestamp * 1000).toISOString()
          : new Date().toISOString();
      }
      if (openedCount > 0) {
        patch.open_count = openedCount;
        if (!row.first_opened_at && firstOpenedTs !== null) {
          patch.first_opened_at = new Date(firstOpenedTs * 1000).toISOString();
        }
      }
      if (clickedCount > 0) {
        patch.click_count = clickedCount;
        if (!row.first_clicked_at && firstClickedTs !== null) {
          patch.first_clicked_at = new Date(firstClickedTs * 1000).toISOString();
        }
      }

      if (Object.keys(patch).length === 0) {
        stillPending++;
        await sleep(DELAY_BETWEEN_CALLS_MS);
        continue;
      }

      const { error: updateErr } = await supabase
        .from("user_invitations")
        .update(patch)
        .eq("id", row.id);

      if (updateErr) {
        console.log(
          `[reconcile-invite-delivery-status] update error for invitation=${row.id}: ${updateErr.message}`,
        );
        errors++;
      } else {
        if (mapped) updated++;
        if (openedCount > 0) openedUpdated++;
        if (clickedCount > 0) clickedUpdated++;
        console.log(
          `[reconcile-invite-delivery-status] updated invitation=${row.id} email=${row.email} status=${mapped?.status ?? "(unchanged)"} opens=${openedCount} clicks=${clickedCount}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `[reconcile-invite-delivery-status] threw for invitation=${row.id}: ${msg}`,
      );
      errors++;
    }

    await sleep(DELAY_BETWEEN_CALLS_MS);
  }

  const summary = {
    checked,
    updated,
    opened_updated: openedUpdated,
    clicked_updated: clickedUpdated,
    still_pending: stillPending,
    errors,
    duration_ms: Date.now() - startedAt,
  };
  console.log(
    "[reconcile-invite-delivery-status] run complete:",
    summary,
  );

  return json(200, { ok: true, summary });
});
