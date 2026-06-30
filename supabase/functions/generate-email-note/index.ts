import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email_id } = await req.json();
    if (!email_id || typeof email_id !== "string") {
      return new Response(JSON.stringify({ error: "email_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: email, error: emailErr } = await serviceClient
      .from("email_messages")
      .select("subject, sender_name, sender_email, received_at, body_html, body_preview")
      .eq("id", email_id)
      .maybeSingle();

    if (emailErr || !email) {
      return new Response(JSON.stringify({ error: "Email not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bodyText =
      (email.body_html ? htmlToPlainText(email.body_html) : "") ||
      (email.body_preview ?? "");
    const truncatedBody = bodyText.slice(0, 8000);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
        return new Response(JSON.stringify({ error: "AI rate limit reached. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "AI returned empty result" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap title to 8 words
    const words = title.split(/\s+/).filter(Boolean);
    if (words.length > 8) title = words.slice(0, 8).join(" ");
    if (!title) title = (email.subject ?? "Email note").slice(0, 80);

    return new Response(JSON.stringify({ title, note_content }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-email-note error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
