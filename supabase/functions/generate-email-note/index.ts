import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const AI_DESTINATION = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";
const EXTERNAL_FORWARD_FLAG = "ai_email_note_external_forward_enabled";

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function decodeHtmlEntities(v: string) {
  return v
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToPlainText(html?: string | null) {
  if (!html) return "";
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<li>/gi, "• ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Client privacy terms do not name Lovable AI Gateway / Google Gemini as a
 * subprocessor for correspondence content. Forwarding an email body is
 * therefore gated on an explicit per-tenant opt-in
 * (`ai_email_note_external_forward_enabled`), default OFF.
 */
async function tenantAllowsExternalEmailForward(
  serviceClient: ReturnType<typeof createClient>,
  tenantId: number
): Promise<boolean> {
  const { data: override } = await serviceClient
    .from("ai_feature_overrides")
    .select("enabled")
    .eq("tenant_id", tenantId)
    .eq("flag_name", EXTERNAL_FORWARD_FLAG)
    .maybeSingle();

  if (override) return override.enabled === true;

  const { data: settings } = await serviceClient
    .from("app_settings")
    .select(EXTERNAL_FORWARD_FLAG)
    .limit(1)
    .maybeSingle();

  return (settings as Record<string, unknown> | null)?.[EXTERNAL_FORWARD_FLAG] === true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(req, 401, { error: "Missing authorization" });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json(req, 401, { error: "Unauthorized" });
    }

    const { email_id } = await req.json();
    if (!email_id || typeof email_id !== "string") {
      return json(req, 400, { error: "email_id is required" });
    }

    // IDOR: read the row as the caller so email_messages RLS applies
    // (owner / vivacity team / superadmin). Service role would bypass it.
    // emails_restrict_staff_only is the equivalent RESTRICTIVE backstop on
    // public.emails (stage templates); this function reads email_messages.
    const { data: email, error: emailErr } = await userClient
      .from("email_messages")
      .select(
        "id, tenant_id, subject, sender_name, sender_email, received_at, body_html, body_preview"
      )
      .eq("id", email_id)
      .maybeSingle();

    if (emailErr || !email) {
      return json(req, 404, { error: "Email not found" });
    }

    const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (!(await tenantAllowsExternalEmailForward(serviceClient, email.tenant_id))) {
      return json(req, 403, {
        code: "AI_FORWARD_NOT_OPTED_IN",
        error:
          "Forwarding this email to an external AI provider is not covered by the client's privacy terms and has not been opted in for this tenant.",
      });
    }

    const bodyText =
      (email.body_html ? htmlToPlainText(email.body_html) : "") ||
      (email.body_preview ?? "");
    const truncatedBody = bodyText.slice(0, 8000);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json(req, 500, { error: "AI not configured" });
    }

    const { error: auditErr } = await serviceClient.from("client_audit_log").insert({
      tenant_id: email.tenant_id,
      actor_user_id: userData.user.id,
      action: "ai.email_forwarded_external",
      entity_type: "email_message",
      entity_id: email_id,
      details: {
        caller_id: userData.user.id,
        email_id,
        destination: AI_DESTINATION,
        destination_provider: "lovable_ai_gateway",
        model: AI_MODEL,
      },
    });
    if (auditErr) {
      console.error("Audit log insert failed:", auditErr.message);
      return json(req, 500, { error: "Failed to record audit log" });
    }

    const userPrompt = `You are a professional consultant's note-taking assistant. Convert the following email into a structured consultation note.

Email subject: ${email.subject ?? "(no subject)"}
From: ${email.sender_name ?? ""} (${email.sender_email ?? ""})

Email content:
${truncatedBody}

Write a professional note suitable for a client CRM. Include:
- A brief summary of what the email is about (1-2 sentences)
- Key points discussed or information shared
- Any action items or follow-ups mentioned
- Any decisions or outcomes noted

Write in first-person professional tone as if the consultant wrote this note after reading the email. Keep it concise but complete. Do not include greetings or email formatting. Plain text only, no markdown.

Also produce a brief title under 8 words in sentence case derived from the subject.`;

    const aiResp = await fetch(AI_DESTINATION, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: "You convert emails into structured consultation notes for a CRM." },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_note",
              description: "Return the structured consultation note and a brief title.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Brief title under 8 words, sentence case" },
                  note_content: { type: "string", description: "The full consultation note in plain text" },
                },
                required: ["title", "note_content"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_note" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return json(req, 429, { error: "AI rate limit reached. Please try again shortly." });
      }
      if (aiResp.status === 402) {
        return json(req, 402, { error: "AI credits exhausted. Please add credits." });
      }
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      return json(req, 500, { error: "AI generation failed" });
    }

    const data = await aiResp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let title = "";
    let note_content = "";
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        title = (args.title || "").trim();
        note_content = (args.note_content || "").trim();
      } catch (e) {
        console.error("Failed to parse tool args:", e);
      }
    }
    if (!note_content) {
      note_content = (data.choices?.[0]?.message?.content || "").trim();
    }
    if (!note_content) {
      return json(req, 500, { error: "AI returned empty result" });
    }

    // Cap title to 8 words
    const words = title.split(/\s+/).filter(Boolean);
    if (words.length > 8) title = words.slice(0, 8).join(" ");
    if (!title) title = (email.subject ?? "Email note").slice(0, 80);

    return json(req, 200, { title, note_content });
  } catch (e) {
    console.error("generate-email-note error:", e);
    return json(req, 500, { error: (e as Error).message || "Unknown error" });
  }
});
