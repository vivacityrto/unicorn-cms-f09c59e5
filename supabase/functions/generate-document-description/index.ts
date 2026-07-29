import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { filename, category, framework } = await req.json();
    if (!filename || typeof filename !== "string") {
      return new Response(
        JSON.stringify({ description: "" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ description: "" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contextLines = [
      `Filename: ${filename}`,
      `Category: ${category || "Unknown"}`,
      `Framework: ${framework || "Unknown"}`,
    ].join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You write a concise one-to-two sentence description for a compliance document template, " +
              "given only its filename, category, and regulatory framework. Be factual and general — never " +
              "invent specific policy content, clauses, or details you cannot know from the filename alone. " +
              "Return ONLY the description text, no quotes, no prefixes, no explanations.",
          },
          {
            role: "user",
            content: `Write a one-to-two sentence description of this document template:\n\n${contextLines}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "write_description",
              description: "Return a one-to-two sentence description of the document template.",
              parameters: {
                type: "object",
                properties: {
                  description: {
                    type: "string",
                    description: "A factual, general one-to-two sentence description",
                  },
                },
                required: ["description"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "write_description" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 402) {
        return new Response(
          JSON.stringify({ description: "" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("AI gateway error:", response.status, await response.text());
      return new Response(
        JSON.stringify({ description: "" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        const description = (args.description || "").trim();
        return new Response(
          JSON.stringify({ description }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        // Fall through to plain-content fallback below
      }
    }

    const plainDescription = (data.choices?.[0]?.message?.content || "").trim();
    return new Response(
      JSON.stringify({ description: plainDescription }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-document-description error:", e);
    return new Response(
      JSON.stringify({ description: "" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
