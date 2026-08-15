// Mailgun delivery webhook. Public endpoint — Mailgun POSTs unauthenticated.
// Always returns HTTP 200 { ok: true } so Mailgun does not retry.
// Verifies HMAC-SHA256 signature when MAILGUN_WEBHOOK_SIGNING_KEY is set.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ok = (req: Request) =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

async function verifySignature(
  signingKey: string,
  timestamp: string,
  token: string,
  signature: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(String(timestamp) + String(token)),
  );
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === signature;
}

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const body = await req.json().catch(() => null) as any;
    if (!body || typeof body !== "object") {
      console.log("mailgun-webhook: invalid JSON body");
      return ok(req);
    }

    // Signature verification
    const signingKey = Deno.env.get("MAILGUN_WEBHOOK_SIGNING_KEY");
    const sigBlock = body.signature;
    if (signingKey) {
      if (
        !sigBlock?.timestamp || !sigBlock?.token || !sigBlock?.signature ||
        !(await verifySignature(
          signingKey,
          String(sigBlock.timestamp),
          String(sigBlock.token),
          String(sigBlock.signature),
        ))
      ) {
        console.log("mailgun-webhook: invalid signature, ignoring");
        return ok(req);
      }
    } else {
      console.warn(
        "mailgun-webhook: MAILGUN_WEBHOOK_SIGNING_KEY not set — skipping signature verification",
      );
    }

    const ed = body["event-data"] ?? {};
    const event: string | undefined = ed.event;
    const severity: string | undefined = ed.severity;
    const timestamp: number = typeof ed.timestamp === "number"
      ? ed.timestamp
      : Number(ed.timestamp);

    const headers = ed?.message?.headers ?? {};
    let messageId: string | undefined = headers["message-id"];
    if (!messageId || !event) {
      console.log("mailgun-webhook: missing event or message-id", { event });
      return ok(req);
    }

    messageId = String(messageId).trim();
    if (messageId.startsWith("<") && messageId.endsWith(">")) {
      messageId = messageId.slice(1, -1);
    }

    const status = mapEvent(event, severity);
    const isEngagement = event === "opened" || event === "clicked";
    if (!status && !isEngagement) {
      console.log("mailgun-webhook: ignored event", { event, severity });
      return ok(req);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: invite, error: lookupErr } = await supabase
      .from("user_invitations")
      .select("id, first_opened_at, first_clicked_at, open_count, click_count")
      .eq("mailgun_message_id", messageId)
      .limit(1)
      .maybeSingle();

    if (lookupErr) {
      console.log("mailgun-webhook: lookup error", lookupErr.message);
      return ok(req);
    }
    if (!invite) {
      console.log("mailgun-webhook: no invitation for message-id", messageId);
      return ok(req);
    }

    const eventAtIso = Number.isFinite(timestamp)
      ? new Date(timestamp * 1000).toISOString()
      : new Date().toISOString();

    // Branch A — terminal delivery outcome. Unchanged semantics.
    if (status) {
      const { error: updateErr } = await supabase
        .from("user_invitations")
        .update({
          delivery_status: status,
          delivery_event_at: eventAtIso,
        })
        .eq("id", invite.id);

      if (updateErr) {
        console.log("mailgun-webhook: update error", updateErr.message);
        return ok(req);
      }

      console.log("mailgun-webhook: updated invitation", {
        invitation_id: invite.id,
        delivery_status: status,
        event,
        severity,
      });
      return ok(req);
    }

    // Branch B — engagement (opened / clicked). Independent from delivery_status.
    const patch: Record<string, unknown> = {};
    if (event === "opened") {
      patch.open_count = (invite.open_count ?? 0) + 1;
      patch.first_opened_at = invite.first_opened_at ?? eventAtIso;
    } else if (event === "clicked") {
      patch.click_count = (invite.click_count ?? 0) + 1;
      patch.first_clicked_at = invite.first_clicked_at ?? eventAtIso;
    }

    const { error: engagementErr } = await supabase
      .from("user_invitations")
      .update(patch)
      .eq("id", invite.id);

    if (engagementErr) {
      console.log(
        "mailgun-webhook: engagement update error",
        engagementErr.message,
      );
      return ok(req);
    }

    console.log("mailgun-webhook: engagement", {
      invitation_id: invite.id,
      event,
      open_count: patch.open_count,
      click_count: patch.click_count,
    });
    return ok(req);
  } catch (err) {
    console.log("mailgun-webhook: unexpected error", (err as Error).message);
    return ok(req);
  }
});
