import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { content } = await req.json();
    if (!content || typeof content !== "string" || content.trim().length < 5) {
      return new Response(
        JSON.stringify({ title: "" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ title: "" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
              "You extract a brief title from note content. Return ONLY the title text, nothing else. The title must be under 10 words, be descriptive of the content, and use sentence case. No quotes, no prefixes, no explanations.",
          },
          {
            role: "user",
            content: `Extract a brief title (under 10 words) from this note:\n\n${content.slice(0, 2000)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_title",
              description: "Return a brief title extracted from the note content.",
              parameters: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "A brief title under 10 words in sentence case",
                  },
                },
                required: ["title"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_title" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 402) {
        // Silently fail for rate limits / payment — title is optional
        return new Response(
          JSON.stringify({ title: "" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("AI gateway error:", response.status, await response.text());
      return new Response(
        JSON.stringify({ title: "" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    
    // Parse tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        const extractedTitle = (args.title || "").trim();
        // Enforce 10-word limit
        const words = extractedTitle.split(/\s+/);
        const title = words.length > 10 ? words.slice(0, 10).join(" ") : extractedTitle;
        return new Response(
          JSON.stringify({ title }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        // Fall through
      }
    }

    // Fallback: try plain content response
    const plainTitle = (data.choices?.[0]?.message?.content || "").trim();
    const words = plainTitle.split(/\s+/);
    const title = words.length > 10 ? words.slice(0, 10).join(" ") : plainTitle;

    return new Response(
      JSON.stringify({ title }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("extract-note-title error:", e);
    return new Response(
      JSON.stringify({ title: "" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
