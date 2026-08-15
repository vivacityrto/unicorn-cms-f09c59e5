// kpi-email-log-sync
// Pulls the caller's Outlook Inbox + Sent Items and upserts rows into
// public.kpi_email_log. Computes response_minutes per conversationId by
// pairing the most recent inbound message with the next outbound reply.
//
// Auth: requires a valid Supabase JWT. Only internal Vivacity staff (rows
// in public.users with kpi_role IS NOT NULL or via is_vivacity_team_safe)
// may invoke. Uses the user's own oauth_tokens row.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID")!;
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;

// SLA thresholds (minutes). Tune via app_settings later if needed.
const SLA_MINUTES: Record<string, number> = {
  general_email: 12 * 60, // 12h
  client_message: 12 * 60, // 12h
};

type Folder = "inbox" | "sent";

interface GraphMessage {
  id: string;
  subject?: string;
  conversationId?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  receivedDateTime?: string;
  sentDateTime?: string;
  bodyPreview?: string;
}

interface TokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope?: string;
}

async function refreshIfNeeded(
  admin: SupabaseClient,
  userId: string,
  token: TokenRecord
): Promise<string> {
  const expires = new Date(token.expires_at).getTime();
  if (expires - Date.now() > 5 * 60 * 1000) return token.access_token;

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
      scope: token.scope || "openid profile email offline_access Mail.Read",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const t = await res.json();
  const newExpiry = new Date(Date.now() + t.expires_in * 1000).toISOString();
  await admin
    .from("oauth_tokens")
    .update({
      access_token: t.access_token,
      refresh_token: t.refresh_token || token.refresh_token,
      expires_at: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "microsoft");
  return t.access_token;
}

async function fetchFolder(
  accessToken: string,
  folder: Folder,
  top: number
): Promise<GraphMessage[]> {
  const folderPath = folder === "sent" ? "sentitems" : "inbox";
  const url = new URL(`https://graph.microsoft.com/v1.0/me/mailFolders/${folderPath}/messages`);
  url.searchParams.set("$top", String(Math.min(top, 999)));
  url.searchParams.set(
    "$select",
    "id,subject,conversationId,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview"
  );
  url.searchParams.set(
    "$orderby",
    folder === "sent" ? "sentDateTime desc" : "receivedDateTime desc"
  );
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Graph fetch ${folderPath} failed: ${await res.text()}`);
  const data = await res.json();
  return data.value ?? [];
}

/**
 * Crude classifier — production should consult a known-client domain list
 * from app_settings. For now: anything from a microsoftonline / outlook /
 * gmail public domain = general_email; everything else (i.e. likely a
 * client RTO domain) = client_message.
 */
function classify(address: string | undefined): "general_email" | "client_message" {
  const a = (address || "").toLowerCase();
  const publicDomains = ["outlook.com", "hotmail.com", "live.com", "gmail.com", "yahoo.com", "icloud.com"];
  if (!a) return "general_email";
  if (publicDomains.some((d) => a.endsWith("@" + d))) return "general_email";
  if (a.endsWith("@vivacity.com.au") || a.endsWith("@vivacitycoaching.com.au")) return "general_email";
  return "client_message";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Validate JWT and resolve caller
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Staff gate — must be internal Vivacity team
    const { data: staffCheck } = await admin.rpc("is_vivacity_team_safe", { p_user_id: userId });
    if (!staffCheck) {
      return new Response(JSON.stringify({ error: "Forbidden: staff only" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));

    // ---- Manual pair mode -------------------------------------------------
    if (body?.mode === "manual") {
      const inboundMessageId: string | undefined = body.inboundMessageId;
      const outboundMessageId: string | undefined = body.outboundMessageId;
      const emailType: "general_email" | "client_message" =
        body.emailType === "client_message" ? "client_message" : "general_email";

      if (!inboundMessageId || !outboundMessageId) {
        return new Response(
          JSON.stringify({ error: "inboundMessageId and outboundMessageId are required" }),
          { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      const { data: tokenRowM, error: tokErrM } = await admin
        .from("oauth_tokens")
        .select("access_token,refresh_token,expires_at,scope")
        .eq("user_id", userId)
        .eq("provider", "microsoft")
        .maybeSingle();
      if (tokErrM || !tokenRowM) {
        return new Response(
          JSON.stringify({ error: "Outlook not connected for this user" }),
          { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      const accessTokenM = await refreshIfNeeded(admin, userId, tokenRowM as TokenRecord);

      const select =
        "id,subject,conversationId,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview";
      const fetchMsg = async (id: string): Promise<GraphMessage> => {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}?$select=${select}`,
          { headers: { Authorization: `Bearer ${accessTokenM}` } }
        );
        if (!res.ok) throw new Error(`Graph fetch message ${id} failed: ${await res.text()}`);
        return (await res.json()) as GraphMessage;
      };

      const [inMsg, outMsg] = await Promise.all([
        fetchMsg(inboundMessageId),
        fetchMsg(outboundMessageId),
      ]);

      const receivedAt = inMsg.receivedDateTime ?? null;
      const sentAt = outMsg.sentDateTime ?? null;
      let responseMinutes: number | null = null;
      let slaMet: boolean | null = null;
      if (receivedAt && sentAt && new Date(sentAt) >= new Date(receivedAt)) {
        responseMinutes = Math.round(
          (new Date(sentAt).getTime() - new Date(receivedAt).getTime()) / 60000
        );
        slaMet = responseMinutes <= SLA_MINUTES[emailType];
      }
      const conversationId = inMsg.conversationId ?? outMsg.conversationId ?? null;

      const manualRows = [
        {
          user_uuid: userId,
          email_type: emailType,
          direction: "inbound",
          message_id: inMsg.id,
          conversation_id: conversationId,
          subject: inMsg.subject ?? null,
          from_address: inMsg.from?.emailAddress?.address ?? null,
          to_address: inMsg.toRecipients?.[0]?.emailAddress?.address ?? null,
          received_at: receivedAt,
          sent_at: null,
          responded_at: sentAt,
          response_minutes: responseMinutes,
          sla_met: slaMet,
          raw_folder: "inbox",
          metadata: { source: "manual" },
        },
        {
          user_uuid: userId,
          email_type: emailType,
          direction: "outbound",
          message_id: outMsg.id,
          conversation_id: conversationId,
          subject: outMsg.subject ?? null,
          from_address: outMsg.from?.emailAddress?.address ?? null,
          to_address: outMsg.toRecipients?.[0]?.emailAddress?.address ?? null,
          received_at: null,
          sent_at: sentAt,
          responded_at: null,
          response_minutes: null,
          sla_met: null,
          raw_folder: "sentitems",
          metadata: { source: "manual" },
        },
      ];

      const { error: upErrM } = await admin
        .from("kpi_email_log")
        .upsert(manualRows, { onConflict: "user_uuid,message_id" });
      if (upErrM) throw upErrM;

      return new Response(
        JSON.stringify({ ok: true, mode: "manual", inserted: 2 }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }
    // ---- end manual mode --------------------------------------------------

    const folders: Folder[] = Array.isArray(body.folders) ? body.folders : ["inbox", "sent"];
    const top: number = typeof body.top === "number" ? body.top : 200;

    // Load oauth token
    const { data: tokenRow, error: tokErr } = await admin
      .from("oauth_tokens")
      .select("access_token,refresh_token,expires_at,scope")
      .eq("user_id", userId)
      .eq("provider", "microsoft")
      .maybeSingle();
    if (tokErr || !tokenRow) {
      return new Response(
        JSON.stringify({ error: "Outlook not connected for this user" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const accessToken = await refreshIfNeeded(admin, userId, tokenRow as TokenRecord);

    // Fetch requested folders
    const inbox = folders.includes("inbox") ? await fetchFolder(accessToken, "inbox", top) : [];
    const sent = folders.includes("sent") ? await fetchFolder(accessToken, "sent", top) : [];

    // Build pairing index from sent (earliest outbound per conversation)
    const outboundByConv = new Map<string, GraphMessage>();
    for (const m of sent) {
      if (!m.conversationId) continue;
      const existing = outboundByConv.get(m.conversationId);
      if (!existing) outboundByConv.set(m.conversationId, m);
      else {
        const a = new Date(m.sentDateTime || 0).getTime();
        const b = new Date(existing.sentDateTime || 0).getTime();
        if (a < b) outboundByConv.set(m.conversationId, m);
      }
    }

    const rows: Array<Record<string, unknown>> = [];

    for (const m of inbox) {
      const fromAddr = m.from?.emailAddress?.address;
      const emailType = classify(fromAddr);
      const receivedAt = m.receivedDateTime ?? null;
      const reply = m.conversationId ? outboundByConv.get(m.conversationId) : undefined;
      const replyAt = reply?.sentDateTime ?? null;
      let responseMinutes: number | null = null;
      let slaMet: boolean | null = null;
      if (receivedAt && replyAt && new Date(replyAt) >= new Date(receivedAt)) {
        responseMinutes = Math.round(
          (new Date(replyAt).getTime() - new Date(receivedAt).getTime()) / 60000
        );
        slaMet = responseMinutes <= SLA_MINUTES[emailType];
      }
      rows.push({
        user_uuid: userId,
        email_type: emailType,
        direction: "inbound",
        message_id: m.id,
        conversation_id: m.conversationId ?? null,
        subject: m.subject ?? null,
        from_address: fromAddr ?? null,
        to_address: m.toRecipients?.[0]?.emailAddress?.address ?? null,
        received_at: receivedAt,
        sent_at: null,
        responded_at: replyAt,
        response_minutes: responseMinutes,
        sla_met: slaMet,
        raw_folder: "inbox",
      });
    }

    for (const m of sent) {
      const toAddr = m.toRecipients?.[0]?.emailAddress?.address;
      rows.push({
        user_uuid: userId,
        email_type: classify(toAddr),
        direction: "outbound",
        message_id: m.id,
        conversation_id: m.conversationId ?? null,
        subject: m.subject ?? null,
        from_address: m.from?.emailAddress?.address ?? null,
        to_address: toAddr ?? null,
        received_at: null,
        sent_at: m.sentDateTime ?? null,
        responded_at: null,
        response_minutes: null,
        sla_met: null,
        raw_folder: "sentitems",
      });
    }

    let inserted = 0;
    let updated = 0;
    // Upsert in chunks of 200
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error: upErr, count } = await admin
        .from("kpi_email_log")
        .upsert(chunk, { onConflict: "user_uuid,message_id", count: "exact" });
      if (upErr) throw upErr;
      // PostgREST doesn't split insert vs update counts; treat all as upserted
      inserted += count ?? chunk.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        inbox_count: inbox.length,
        sent_count: sent.length,
        inserted,
        updated,
      }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[kpi-email-log-sync] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
