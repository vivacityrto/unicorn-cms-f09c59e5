/**
 * academy-ai-generate – Unicorn 2.0
 *
 * AI content generation for Academy Builder.
 * Actions:
 *   - generate_descriptions: Generate short_description and description for a course
 *   - generate_questions: Generate assessment questions from course context
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth check
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || serviceKey);

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await anonClient.auth.getUser(token);
      userId = user?.id ?? null;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action } = body;

    if (action === "generate_descriptions") {
      const { title, target_audience, difficulty_level, tags } = body;

      if (!title) {
        return new Response(
          JSON.stringify({ error: "Title is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userPrompt = `Generate descriptions for a course with the following details:\n\nTitle: ${title}\nTarget Audience: ${target_audience || "Not specified"}\nDifficulty: ${difficulty_level || "Not specified"}\nTags: ${(tags || []).join(", ") || "None"}\n\nReturn ONLY a JSON object in this exact format, no markdown, no preamble:\n{"short_description": "1-2 sentences, max 30 words, punchy and specific", "description": "3-4 paragraphs, professional but human, explains what learners will gain and why it matters for their RTO"}`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "You write course descriptions for Vivacity Academy — a professional training platform for Australian RTOs (Registered Training Organisations). Your writing is warm, authoritative, and never corporate. You always write in flowing prose, never bullet points. You understand the VET sector deeply.",
            },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", status, t);
        return new Response(JSON.stringify({ error: "AI generation failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiResult = await response.json();
      const content = aiResult.choices?.[0]?.message?.content || "";

      // Parse JSON from response (strip markdown fences if present)
      let parsed;
      try {
        const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "generate_questions") {
      const { title, target_audience, context_text } = body;

      if (!title || !context_text) {
        return new Response(
          JSON.stringify({ error: "Title and context are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userPrompt = `Generate 8 multiple-choice questions for a course called '${title}' aimed at '${target_audience || "training professionals"}'.\n\nCourse content context:\n${context_text}\n\nReturn ONLY a JSON array, no markdown, no preamble, in this exact format:\n[{"question_text": "...", "explanation": "Brief explanation of why the correct answer is right, shown to learners who got it wrong", "options": [{"value": "A", "label": "...", "is_correct": true}, {"value": "B", "label": "...", "is_correct": false}, {"value": "C", "label": "...", "is_correct": false}, {"value": "D", "label": "...", "is_correct": false}]}]`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "You write multiple-choice assessment questions for professional training courses in the Australian VET (Vocational Education and Training) sector. Questions must be clear, unambiguous, and test genuine understanding — not trick questions. Each question must have exactly 4 options with only one correct answer.",
            },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", status, t);
        return new Response(JSON.stringify({ error: "AI generation failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiResult = await response.json();
      const content = aiResult.choices?.[0]?.message?.content || "";

      let parsed;
      try {
        const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!Array.isArray(parsed)) {
        return new Response(JSON.stringify({ error: "Invalid AI response format" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ questions: parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("academy-ai-generate error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
