/**
 * send-test-email
 *
 * Super-admin-only preview of a system_emails template with dummy merge
 * fields. Does not accept a caller-supplied From or destination URL.
 *
 * Three historical UUID-slug copies existed on the hosted project with
 * verify_jwt=false and no caller gate. Two are retired (410 stub). This
 * named slug is the keeper.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsForRequest, handleCorsPreflight, requireCaller } from "../_shared/requireCaller.ts";
import { sanitizeMergeVars } from "../_shared/email-merge.ts";
import { escapeHtml } from "../_shared/escape-html.ts";
import { normalizeAppBaseUrl } from "../_shared/email-urls.ts";

function mergeTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => data[key] ?? "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);

  const caller = await requireCaller(req, { kind: "super_admin" });
  if (!caller.ok) return caller.response;
  const { corsHeaders, supabase } = caller;

  try {
    const { emailId, recipientEmail } = await req.json();

    if (!emailId || !recipientEmail) {
      return new Response(
        JSON.stringify({ error: "Email ID and recipient email are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const { data: rows, error } = await supabase
      .from("system_emails")
      .select("*")
      .eq("id", emailId)
      .limit(1);

    if (error) {
      return new Response(
        JSON.stringify({ error: "Database error" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const emailTemplate = rows?.[0];
    if (!emailTemplate) {
      return new Response(
        JSON.stringify({ error: "Email template not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const dummyData: Record<string, unknown> = {};
    const fields: unknown[] = Array.isArray(emailTemplate.merge_fields)
      ? emailTemplate.merge_fields
      : [];
    for (const field of fields) {
      if (typeof field === "string") dummyData[field] = `Test ${field}`;
    }

    const safe = sanitizeMergeVars(dummyData, normalizeAppBaseUrl(Deno.env.get("APP_BASE_URL")));
    const subject = mergeTemplate(String(emailTemplate.subject_template ?? ""), safe);
    const body = mergeTemplate(String(emailTemplate.body_template ?? ""), safe);

    console.log(`Test email preview for ${recipientEmail}:`, { subject });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Test email preview for ${escapeHtml(recipientEmail)}`,
        preview: { subject, body },
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to preview email";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsForRequest(req) } },
    );
  }
});
