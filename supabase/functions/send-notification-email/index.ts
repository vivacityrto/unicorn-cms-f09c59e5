/**
 * send-notification-email
 *
 * Internal/system only (other functions + cron). Gateway verify_jwt is
 * not authorization — the anon key satisfies it. Gated by
 * requireInternalEmailSecret (constant-time shared-secret compare).
 *
 * From address comes from Deno.env. Link destinations are constructed
 * server-side from APP_BASE_URL + validated ids. Merge fields are
 * HTML-escaped before interpolation.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeadersFor, INTERNAL_EMAIL_EXTRA_HEADERS, requireInternalEmailSecret } from "../_shared/requireCaller.ts";
import { EMAIL_LOGO_ALT, EMAIL_LOGO_URL } from "../_shared/app-base-url.ts";
import { escapeHtml } from "../_shared/escape-html.ts";
import { envFromAddress } from "../_shared/email-merge.ts";
import { normalizeAppBaseUrl, resolveEmailUrl } from "../_shared/email-urls.ts";

const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN") || "mg.unicorn-cms.au";
const MAILGUN_REGION = Deno.env.get("MAILGUN_REGION") || "EU";
const MAILGUN_API_BASE = MAILGUN_REGION.toUpperCase() === "EU"
  ? "https://api.eu.mailgun.net"
  : "https://api.mailgun.net";

interface NotificationEmailRequest {
  to: string;
  type: "task_due_soon" | "task_overdue" | "meeting_reminder_24h" | "meeting_reminder_10m" | "daily_digest";
  data?: Record<string, unknown>;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = corsHeadersFor(req, INTERNAL_EMAIL_EXTRA_HEADERS);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = requireInternalEmailSecret(req);
  if (caller instanceof Response) return caller;

  try {
    const { to, type, data }: NotificationEmailRequest = await req.json();
    if (!to || !type) {
      return new Response(JSON.stringify({ error: "to and type are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!MAILGUN_API_KEY) {
      throw new Error("Mailgun API key not configured");
    }

    const { subject, html } = generateEmailContent(type, data ?? {});

    const formData = new FormData();
    formData.append("from", envFromAddress());
    formData.append("to", to);
    formData.append("subject", subject);
    formData.append("html", html);

    const response = await fetch(
      `${MAILGUN_API_BASE}/v3/${MAILGUN_DOMAIN}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Mailgun error:", error);
      throw new Error("Failed to send email");
    }

    const result = await response.json();
    return new Response(
      JSON.stringify({ success: true, message_id: result.id }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error: unknown) {
    console.error("Error in send-notification-email:", error);
    const message = error instanceof Error ? error.message : "Failed to send email";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
};

function generateEmailContent(
  type: string,
  data: Record<string, unknown>,
): { subject: string; html: string } {
  const base = normalizeAppBaseUrl(Deno.env.get("APP_BASE_URL"));
  const taskUrl = resolveEmailUrl("task_url", base, data);
  const meetingUrl = resolveEmailUrl("meeting_url", base, data);
  const dashboardUrl = resolveEmailUrl("dashboard_url", base, data);

  const taskName = escapeHtml(data.task_name);
  const dueDate = escapeHtml(data.due_date);
  const description = data.description ? escapeHtml(data.description) : "";
  const daysOverdue = escapeHtml(data.days_overdue);
  const meetingTitle = escapeHtml(data.meeting_title);
  const meetingDate = escapeHtml(data.meeting_date);
  const meetingTime = escapeHtml(data.meeting_time);
  const duration = escapeHtml(data.duration_minutes);
  const meetingType = data.meeting_type ? escapeHtml(data.meeting_type) : "";
  const participants = data.participants ? escapeHtml(data.participants) : "";
  const digestDate = escapeHtml(data.date);

  switch (type) {
    case "task_due_soon":
      return {
        subject: `Task Due Soon: ${String(data.task_name ?? "")}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                <img src="${EMAIL_LOGO_URL}" alt="${EMAIL_LOGO_ALT}" style="height: 40px; margin-bottom: 12px;" />
                <h1 style="margin: 0;">Task Due Soon</h1>
              </div>
              <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <h2 style="color: #6109A1; margin-top: 0;">${taskName}</h2>
                <p><strong>Due Date:</strong> ${dueDate}</p>
                ${description ? `<p>${description}</p>` : ""}
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${escapeHtml(taskUrl)}" style="display: inline-block; padding: 14px 28px; background: #23C0DD; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">View Task</a>
                </div>
                <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
                  This is an automated reminder from Unicorn 2.0. To manage your notification preferences, visit your settings.
                </p>
              </div>
            </body>
          </html>
        `,
      };

    case "task_overdue":
      return {
        subject: `Overdue Task: ${String(data.task_name ?? "")}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #D51C49 0%, #8B0000 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                <img src="${EMAIL_LOGO_URL}" alt="${EMAIL_LOGO_ALT}" style="height: 40px; margin-bottom: 12px;" />
                <h1 style="margin: 0;">Task Overdue</h1>
              </div>
              <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <h2 style="color: #D51C49; margin-top: 0;">${taskName}</h2>
                <p><strong>Was Due:</strong> ${dueDate}</p>
                <p><strong>Days Overdue:</strong> ${daysOverdue}</p>
                ${description ? `<p>${description}</p>` : ""}
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${escapeHtml(taskUrl)}" style="display: inline-block; padding: 14px 28px; background: #D51C49; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Complete Task</a>
                </div>
                <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
                  This is an automated reminder from Unicorn 2.0. To manage your notification preferences, visit your settings.
                </p>
              </div>
            </body>
          </html>
        `,
      };

    case "meeting_reminder_24h":
    case "meeting_reminder_10m":
      return {
        subject: `Meeting Reminder: ${String(data.meeting_title ?? "")}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                <img src="${EMAIL_LOGO_URL}" alt="${EMAIL_LOGO_ALT}" style="height: 40px; margin-bottom: 12px;" />
                <h1 style="margin: 0;">Meeting Reminder</h1>
              </div>
              <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <h2 style="color: #6109A1; margin-top: 0;">${meetingTitle}</h2>
                <p><strong>When:</strong> ${meetingDate} at ${meetingTime}</p>
                <p><strong>Duration:</strong> ${duration} minutes</p>
                ${meetingType ? `<p><strong>Type:</strong> ${meetingType}</p>` : ""}
                ${participants ? `<p><strong>Participants:</strong> ${participants}</p>` : ""}
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${escapeHtml(meetingUrl)}" style="display: inline-block; padding: 14px 28px; background: #23C0DD; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">View Meeting Details</a>
                </div>
                <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
                  This is an automated reminder from Unicorn 2.0. To manage your notification preferences, visit your settings.
                </p>
              </div>
            </body>
          </html>
        `,
      };

    case "daily_digest": {
      const tasksDue = Array.isArray(data.tasks_due) ? data.tasks_due : [];
      const tasksOverdue = Array.isArray(data.tasks_overdue) ? data.tasks_overdue : [];
      const meetingsToday = Array.isArray(data.meetings_today) ? data.meetings_today : [];
      return {
        subject: `Your Daily Summary - ${String(data.date ?? "")}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                <img src="${EMAIL_LOGO_URL}" alt="${EMAIL_LOGO_ALT}" style="height: 40px; margin-bottom: 12px;" />
                <h1 style="margin: 0;">Daily Summary</h1>
                <p style="margin: 10px 0 0 0;">${digestDate}</p>
              </div>
              <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                ${tasksDue.length > 0 ? `
                  <h3 style="color: #6109A1;">Tasks Due Today</h3>
                  <ul>
                    ${tasksDue.map((task: { name?: unknown }) => `<li>${escapeHtml(task?.name)}</li>`).join("")}
                  </ul>
                ` : ""}
                ${tasksOverdue.length > 0 ? `
                  <h3 style="color: #D51C49;">Overdue Tasks</h3>
                  <ul>
                    ${tasksOverdue.map((task: { name?: unknown; days_overdue?: unknown }) => `<li>${escapeHtml(task?.name)} (${escapeHtml(task?.days_overdue)} days overdue)</li>`).join("")}
                  </ul>
                ` : ""}
                ${meetingsToday.length > 0 ? `
                  <h3 style="color: #23C0DD;">Meetings Today</h3>
                  <ul>
                    ${meetingsToday.map((meeting: { title?: unknown; time?: unknown }) => `<li>${escapeHtml(meeting?.title)} at ${escapeHtml(meeting?.time)}</li>`).join("")}
                  </ul>
                ` : ""}
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${escapeHtml(dashboardUrl)}" style="display: inline-block; padding: 14px 28px; background: #23C0DD; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">View Dashboard</a>
                </div>
                <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
                  This is your daily digest from Unicorn 2.0. To manage your notification preferences, visit your settings.
                </p>
              </div>
            </body>
          </html>
        `,
      };
    }

    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

serve(handler);
