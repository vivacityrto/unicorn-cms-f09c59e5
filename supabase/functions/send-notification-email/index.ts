import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { EMAIL_LOGO_ALT, EMAIL_LOGO_URL } from "../_shared/app-base-url.ts";

const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN") || "mg.unicorn-cms.au";
const MAILGUN_FROM_EMAIL = Deno.env.get("MAILGUN_FROM_EMAIL") || "no-reply@mg.unicorn-cms.au";
const MAILGUN_FROM_NAME = Deno.env.get("MAILGUN_FROM_NAME") || "Unicorn CMS";
const MAILGUN_REGION = Deno.env.get("MAILGUN_REGION") || "EU";
const MAILGUN_API_BASE = MAILGUN_REGION === "EU"
  ? "https://api.eu.mailgun.net"
  : "https://api.mailgun.net";

interface NotificationEmailRequest {
  to: string;
  type: "task_due_soon" | "task_overdue" | "meeting_reminder_24h" | "meeting_reminder_10m" | "daily_digest";
  data: Record<string, any>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const { to, type, data }: NotificationEmailRequest = await req.json();

    if (!MAILGUN_API_KEY) {
      throw new Error("Mailgun API key not configured");
    }

    const { subject, html } = generateEmailContent(type, data);

    const formData = new FormData();
    formData.append("from", `${MAILGUN_FROM_NAME} <${MAILGUN_FROM_EMAIL}>`);
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
      throw new Error(`Failed to send email: ${error}`);
    }

    const result = await response.json();
    console.log("Email sent successfully:", result);

    return new Response(
      JSON.stringify({ success: true, message_id: result.id }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      },
    );
  } catch (error: any) {
    console.error("Error in send-notification-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      },
    );
  }
};

function generateEmailContent(type: string, data: Record<string, any>): { subject: string; html: string } {
  switch (type) {
    case "task_due_soon":
      return {
        subject: `📋 Task Due Soon: ${data.task_name}`,
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
                <h1 style="margin: 0;">📋 Task Due Soon</h1>
              </div>
              <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <h2 style="color: #6109A1; margin-top: 0;">${data.task_name}</h2>
                <p><strong>Due Date:</strong> ${data.due_date}</p>
                ${data.description ? `<p>${data.description}</p>` : ""}
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${data.task_url}" style="display: inline-block; padding: 14px 28px; background: #23C0DD; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">View Task</a>
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
        subject: `⚠️ Overdue Task: ${data.task_name}`,
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
                <h1 style="margin: 0;">⚠️ Task Overdue</h1>
              </div>
              <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <h2 style="color: #D51C49; margin-top: 0;">${data.task_name}</h2>
                <p><strong>Was Due:</strong> ${data.due_date}</p>
                <p><strong>Days Overdue:</strong> ${data.days_overdue}</p>
                ${data.description ? `<p>${data.description}</p>` : ""}
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${data.task_url}" style="display: inline-block; padding: 14px 28px; background: #D51C49; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Complete Task</a>
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
      return {
        subject: `🔔 Meeting Tomorrow: ${data.meeting_title}`,
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
                <h1 style="margin: 0;">🔔 Meeting Reminder</h1>
              </div>
              <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <h2 style="color: #6109A1; margin-top: 0;">${data.meeting_title}</h2>
                <p><strong>When:</strong> ${data.meeting_date} at ${data.meeting_time}</p>
                <p><strong>Duration:</strong> ${data.duration_minutes} minutes</p>
                ${data.meeting_type ? `<p><strong>Type:</strong> ${data.meeting_type}</p>` : ""}
                ${data.participants ? `<p><strong>Participants:</strong> ${data.participants}</p>` : ""}
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${data.meeting_url}" style="display: inline-block; padding: 14px 28px; background: #23C0DD; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">View Meeting Details</a>
                </div>
                <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
                  This is an automated reminder from Unicorn 2.0. To manage your notification preferences, visit your settings.
                </p>
              </div>
            </body>
          </html>
        `,
      };

    case "daily_digest":
      return {
        subject: `📊 Your Daily Summary - ${data.date}`,
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
                <h1 style="margin: 0;">📊 Daily Summary</h1>
                <p style="margin: 10px 0 0 0;">${data.date}</p>
              </div>
              <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                ${data.tasks_due?.length > 0 ? `
                  <h3 style="color: #6109A1;">Tasks Due Today</h3>
                  <ul>
                    ${data.tasks_due.map((task: any) => `<li>${task.name}</li>`).join("")}
                  </ul>
                ` : ""}
                ${data.tasks_overdue?.length > 0 ? `
                  <h3 style="color: #D51C49;">Overdue Tasks</h3>
                  <ul>
                    ${data.tasks_overdue.map((task: any) => `<li>${task.name} (${task.days_overdue} days overdue)</li>`).join("")}
                  </ul>
                ` : ""}
                ${data.meetings_today?.length > 0 ? `
                  <h3 style="color: #23C0DD;">Meetings Today</h3>
                  <ul>
                    ${data.meetings_today.map((meeting: any) => `<li>${meeting.title} at ${meeting.time}</li>`).join("")}
                  </ul>
                ` : ""}
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${data.dashboard_url}" style="display: inline-block; padding: 14px 28px; background: #23C0DD; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">View Dashboard</a>
                </div>
                <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
                  This is your daily digest from Unicorn 2.0. To manage your notification preferences, visit your settings.
                </p>
              </div>
            </body>
          </html>
        `,
      };

    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

serve(handler);
