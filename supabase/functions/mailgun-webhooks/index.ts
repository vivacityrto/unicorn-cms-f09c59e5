// Mailgun email-events webhook (email_events / email_sends).
// Public endpoint — Mailgun POSTs unauthenticated.
// Fail-closed: MAILGUN_WEBHOOK_SIGNING_KEY is required at module load.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isWebhookTimestampFresh,
  verifyMailgunSignature,
} from "../_shared/webhook-signature.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SIGNING_KEY = (Deno.env.get("MAILGUN_WEBHOOK_SIGNING_KEY") ?? "").trim();

if (!SIGNING_KEY) {
  console.error(
    "mailgun-webhooks: MAILGUN_WEBHOOK_SIGNING_KEY is not set — refusing all requests",
  );
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  if (!SIGNING_KEY) {
    return json(500, { ok: false, error: "Webhook is not configured" });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json(401, { ok: false, error: "Invalid signature" });
    }

    // Mailgun "JSON" webhooks shape: { signature: {...}, "event-data": {...} }
    const signature = (body as { signature?: Record<string, string> }).signature ??
      {};
    const eventData =
      (body as { "event-data"?: Record<string, unknown>; event_data?: Record<string, unknown> })
        ["event-data"] ??
        (body as { event_data?: Record<string, unknown> }).event_data ??
        {};

    if (!signature.timestamp || !signature.token || !signature.signature) {
      return json(401, { ok: false, error: "Invalid signature" });
    }

    if (!isWebhookTimestampFresh(signature.timestamp)) {
      console.log("mailgun-webhooks: stale timestamp, rejecting");
      return json(401, { ok: false, error: "Stale timestamp" });
    }

    const valid = await verifyMailgunSignature(
      SIGNING_KEY,
      String(signature.timestamp),
      String(signature.token),
      String(signature.signature),
    );
    if (!valid) {
      return json(401, { ok: false, error: "Invalid signature" });
    }

    const supabaseSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const event = String(eventData?.event || "");
    const headers = (eventData?.message as { headers?: Record<string, string> } | undefined)
      ?.headers || {};
    let messageId: string | null = null;
    if (headers["message-id"]) messageId = headers["message-id"];
    else if (headers["Message-Id"]) messageId = headers["Message-Id"];

    // Insert event
    if (messageId) {
      const { error: insErr } = await supabaseSrv.from("email_events").insert({
        mailgun_message_id: messageId,
        event,
        payload: body,
      } as any);
      if (insErr) console.error("mailgun-webhooks: insert email_events failed", insErr);
    }

    // Mark failed for complaints/bounces
    if (messageId && (event === "complained" || event === "bounced")) {
      const { error: upErr } = await supabaseSrv
        .from("email_sends")
        .update({ status: "failed", error: event })
        .eq("mailgun_message_id", messageId);
      if (upErr) console.error("mailgun-webhooks: update email_sends failed", upErr);
    }

    // Note: Writing to audit_log requires an authenticated user per RLS, which we don't have in a public webhook.
    // We therefore record all webhook events in email_events and update email_sends; audit entries can be reviewed via these tables.

    return json(200, { ok: true });
  } catch (err: any) {
    console.error("mailgun-webhooks: unexpected error", err);
    return json(500, { ok: false, error: err?.message || "Internal error" });
  }
});
