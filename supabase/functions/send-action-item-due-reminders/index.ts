/**
 * send-action-item-due-reminders
 *
 * Nightly cron job (see migration for `send-action-item-due-reminders-nightly`
 * pg_cron schedule). For every open client_action_items row with a due_date
 * and a configured notify_offset_days array, checks whether today is exactly
 * N days before the due date for any configured N, and if so emails every
 * configured recipient (notify_staff_user_ids + notify_tenant_user_ids) —
 * deduped against client_action_item_reminder_log so nobody is ever emailed
 * twice for the same (action item, offset, due date). due_date is part of
 * the dedupe key so an edited due date that later crosses the same offset
 * threshold again correctly fires a fresh reminder.
 *
 * Cron-only function: verify_jwt = false (see supabase/config.toml).
 * Caller must present the cron invoke secret or the service_role JWT
 * private.cron_function_jwt() already sends — see _shared/cron-auth.ts.
 * Uses the service-role client for all DB access.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { cronUnauthorizedResponse, isCronAuthorized } from "../_shared/cron-auth.ts";

const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN");
const MAILGUN_REGION = (Deno.env.get("MAILGUN_REGION") || "us").toLowerCase();
const MAILGUN_FROM_EMAIL = Deno.env.get("MAILGUN_FROM_EMAIL") || "noreply@vivacity.com.au";
const MAILGUN_FROM_NAME = Deno.env.get("MAILGUN_FROM_NAME") || "Vivacity Unicorn";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://unicorn-cms.au";

const MAILGUN_BASE_URL =
  MAILGUN_REGION === "eu" ? "https://api.eu.mailgun.net/v3" : "https://api.mailgun.net/v3";

interface ActionItemRow {
  id: string;
  tenant_id: number;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string;
  notify_staff_user_ids: string[];
  notify_tenant_user_ids: string[];
  notify_offset_days: number[];
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "#64748b",
  normal: "#2563eb",
  medium: "#2563eb",
  high: "#ea580c",
  urgent: "#dc2626",
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDueDate(dueDate: string): string {
  const d = new Date(`${dueDate}T00:00:00`);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function offsetLabel(offsetDays: number): string {
  if (offsetDays === 1) return "tomorrow";
  return `in ${offsetDays} days`;
}

function buildReminderEmailHtml(opts: {
  recipientName: string;
  tenantName: string;
  item: ActionItemRow;
  offsetDays: number;
}): string {
  const { recipientName, tenantName, item, offsetDays } = opts;
  const priorityColor = PRIORITY_COLORS[item.priority] || "#64748b";
  const actionUrl = `${APP_BASE_URL.replace(/\/$/, "")}/tenant/${item.tenant_id}?tab=actions`;

  return `
<div style="font-family:Calibri,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#7130A0,#ED1878);padding:20px 28px;border-radius:8px 8px 0 0;">
    <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">Unicorn</span>
  </div>
  <div style="border:1px solid #DFD8E8;border-top:none;border-radius:0 0 8px 8px;padding:28px;">
    <p style="margin:0 0 4px;color:#44235F;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
      Action item due ${offsetLabel(offsetDays)}
    </p>
    <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:19px;">${escapeHtml(item.title)}</h2>
    <p style="margin:0 0 20px;color:#333;font-size:14px;">
      Hi ${escapeHtml(recipientName)}, this is a reminder that an action item for <strong>${escapeHtml(tenantName)}</strong> is due <strong>${formatDueDate(item.due_date)}</strong>.
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:24px;">
      ${item.description ? `<tr><td style="padding:6px 12px 6px 0;font-weight:600;color:#44235F;vertical-align:top;width:110px;">Description</td><td style="padding:6px 0;color:#333;">${escapeHtml(item.description)}</td></tr>` : ""}
      <tr><td style="padding:6px 12px 6px 0;font-weight:600;color:#44235F;vertical-align:top;">Priority</td><td style="padding:6px 0;"><span style="display:inline-block;padding:2px 10px;border-radius:10px;background:${priorityColor};color:#fff;font-size:12px;font-weight:600;text-transform:capitalize;">${escapeHtml(item.priority)}</span></td></tr>
      <tr><td style="padding:6px 12px 6px 0;font-weight:600;color:#44235F;vertical-align:top;">Due Date</td><td style="padding:6px 0;color:#333;">${formatDueDate(item.due_date)}</td></tr>
    </table>
    <a href="${actionUrl}" style="display:inline-block;background:#7130A0;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:14px;font-weight:600;">View in Unicorn</a>
    <p style="margin:28px 0 0;color:#888;font-size:11px;">This is an automated reminder from Unicorn 2.0 by Vivacity Coaching &amp; Consulting.</p>
  </div>
</div>`;
}

async function sendMailgun(to: string, subject: string, html: string): Promise<string | null> {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error("Missing Mailgun configuration");
    return null;
  }
  const formData = new FormData();
  formData.append("from", `${MAILGUN_FROM_NAME} <${MAILGUN_FROM_EMAIL}>`);
  formData.append("to", to);
  formData.append("subject", subject);
  formData.append("html", html);

  const res = await fetch(`${MAILGUN_BASE_URL}/${MAILGUN_DOMAIN}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: formData,
  });

  if (!res.ok) {
    console.error("Mailgun send failed", res.status, await res.text());
    return null;
  }
  const result = await res.json();
  return result?.id ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!isCronAuthorized(req)) {
    return cronUnauthorizedResponse(corsHeaders);
  }

  const supabase = createServiceClient();
  let sent = 0;
  let skippedAlreadySent = 0;
  let skippedNoEmail = 0;
  const errors: string[] = [];

  try {
    const { data: items, error: itemsErr } = await supabase
      .from("client_action_items")
      .select(
        "id, tenant_id, title, description, priority, status, due_date, notify_staff_user_ids, notify_tenant_user_ids, notify_offset_days",
      )
      .not("due_date", "is", null)
      .not("status", "in", "(done,cancelled)");

    if (itemsErr) throw itemsErr;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const item of (items || []) as ActionItemRow[]) {
      const dueDate = new Date(`${item.due_date}T00:00:00`);
      const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);

      const matchingOffsets = (item.notify_offset_days || []).filter((o) => o === daysUntilDue);
      if (matchingOffsets.length === 0) continue;

      const recipientIds = [
        ...(item.notify_staff_user_ids || []).map((id) => ({ id, kind: "staff" as const })),
        ...(item.notify_tenant_user_ids || []).map((id) => ({ id, kind: "tenant_user" as const })),
      ];
      if (recipientIds.length === 0) continue;

      const { data: recipientUsers } = await supabase
        .from("users")
        .select("user_uuid, first_name, email")
        .in("user_uuid", recipientIds.map((r) => r.id));

      const { data: tenantRow } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", item.tenant_id)
        .maybeSingle();
      const tenantName = tenantRow?.name || `Tenant #${item.tenant_id}`;

      for (const offsetDays of matchingOffsets) {
        for (const { id: recipientId, kind } of recipientIds) {
          const recipientUser = (recipientUsers || []).find((u) => u.user_uuid === recipientId);
          if (!recipientUser?.email) {
            skippedNoEmail++;
            continue;
          }

          // Dedupe: has this exact (item, offset, recipient, due_date) already
          // been sent? due_date is part of the key so a genuinely new due
          // date that later crosses the same offset threshold fires again.
          const { data: existingLog } = await supabase
            .from("client_action_item_reminder_log")
            .select("id")
            .eq("action_item_id", item.id)
            .eq("offset_days", offsetDays)
            .eq("recipient_user_id", recipientId)
            .eq("due_date", item.due_date)
            .maybeSingle();

          if (existingLog) {
            skippedAlreadySent++;
            continue;
          }

          const html = buildReminderEmailHtml({
            recipientName: recipientUser.first_name || "there",
            tenantName,
            item,
            offsetDays,
          });
          const subject = `Reminder: "${item.title}" is due ${offsetLabel(offsetDays)} — ${tenantName}`;

          try {
            const messageId = await sendMailgun(recipientUser.email, subject, html);
            if (!messageId) {
              errors.push(`Mailgun send failed for ${recipientUser.email} (item ${item.id}, offset ${offsetDays})`);
              continue;
            }

            await supabase.from("client_action_item_reminder_log").insert({
              action_item_id: item.id,
              offset_days: offsetDays,
              recipient_user_id: recipientId,
              recipient_kind: kind,
              email: recipientUser.email,
              mailgun_message_id: messageId,
              due_date: item.due_date,
            });
            sent++;
          } catch (sendErr: any) {
            errors.push(`${recipientUser.email} (item ${item.id}, offset ${offsetDays}): ${sendErr?.message || sendErr}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, skippedAlreadySent, skippedNoEmail, errors }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (e: any) {
    console.error("send-action-item-due-reminders error:", e);
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
