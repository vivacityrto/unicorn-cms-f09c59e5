/**
 * academy-ai-generate – Unicorn 2.0
 *
 * AI content generation for Academy Builder.
 * Actions:
 *   - generate_descriptions: Generate short_description and description for a course
 *   - generate_classification: Infer target audience, difficulty and tags from a recording
 *   - generate_questions: Generate assessment questions from course context
 *   - generate_workshop_segments: Split a long workshop recording into topic segments
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAi(
  apiKey: string,
  system: string,
  user: string,
): Promise<{ ok: true; content: string } | { ok: false; status: number; error: string }> {
  const response = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) return { ok: false, status: 429, error: "Rate limit exceeded, please try again later." };
    if (response.status === 402) return { ok: false, status: 402, error: "AI credits exhausted. Please add funds." };
    const t = await response.text();
    console.error("AI gateway error:", response.status, t);
    return { ok: false, status: 500, error: "AI generation failed" };
  }

  const aiResult = await response.json();
  return { ok: true, content: aiResult.choices?.[0]?.message?.content || "" };
}

function parseJson(content: string): unknown | null {
  try {
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

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

    if (action === "generate_classification") {
      const { title, transcript, webinar_series, existing_tags } = body;

      if (!title) {
        return new Response(
          JSON.stringify({ error: "Title is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Vivacity Academy's tag catalog is manually curated (see
      // docs/audit-log/entries/2026-08-13-academy-tag-cleanup.md — 190 tags
      // collapsed to 162 after a cleanup pass). Every prior Quick Add run
      // invented fresh tags with no awareness of that catalog, which is how
      // it grew near-duplicates in the first place. Passing the existing
      // list lets the AI reuse a real tag instead of coining another variant.
      const existingTagList: string[] = Array.isArray(existing_tags)
        ? existing_tags.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 300)
        : [];
      const tagGuidance = existingTagList.length
        ? `\n\nExisting tag catalog (reuse one of these whenever it genuinely fits — only coin a new tag when none of these capture the topic):\n${existingTagList.join(", ")}`
        : "";

      const ai = await callAi(
        LOVABLE_API_KEY,
        "You classify professional training content for Vivacity Academy, which serves Australian RTOs. You answer strictly with JSON.",
        `Classify this recording.\n\nTitle: ${title}\nSeries: ${webinar_series || "Not specified"}\nTranscript (may be truncated):\n${String(transcript || "").slice(0, 20000)}${tagGuidance}\n\nReturn ONLY JSON, no markdown:\n{"target_audience": ["ceo","compliance_manager","trainer","administrator"], "difficulty_level": "beginner|intermediate|advanced", "tags": ["3-6 short lowercase topical tags, lowercase with spaces not hyphens, preferring the existing catalog above where it fits"]}\nChoose only audiences that genuinely apply.`,
      );
      if (!ai.ok) {
        return new Response(JSON.stringify({ error: ai.error }), {
          status: ai.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parsedCls = parseJson(ai.content) as Record<string, unknown> | null;
      if (!parsedCls) {
        return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(parsedCls), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "generate_workshop_segments") {
      const { title, transcript_timestamped, duration_seconds } = body;
      const total = Number(duration_seconds) > 0 ? Math.floor(Number(duration_seconds)) : null;
      const timed = String(transcript_timestamped || "").trim();

      // Fallback: no timestamped transcript to reason over — split into even blocks.
      const evenSplit = () => {
        if (!total) return null;
        const target = 15 * 60;
        const count = Math.max(1, Math.min(12, Math.round(total / target) || 1));
        const span = Math.floor(total / count);
        return Array.from({ length: count }, (_, i) => ({
          suggested_title: `${title || "Workshop"} — Part ${i + 1}`,
          start_seconds: i * span,
          end_seconds: i === count - 1 ? total : (i + 1) * span,
          summary: "Automatic even split — no timestamped transcript was available. Please review the boundaries.",
        }));
      };

      if (!timed) {
        const fb = evenSplit();
        if (!fb) {
          return new Response(
            JSON.stringify({ error: "No timestamped transcript or duration available to split this recording" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ segments: fb, used_fallback: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ai = await callAi(
        LOVABLE_API_KEY,
        "You segment long workshop recordings for Australian RTO compliance training into standalone teaching topics. Each segment must be self-contained enough to be its own short course. You answer strictly with JSON.",
        `Split this workshop recording into distinct topic segments.\n\nTitle: ${title || "Workshop"}\nTotal duration (seconds): ${total ?? "unknown"}\n\nTimestamped transcript:\n${timed.slice(0, 60000)}\n\nRules:\n- Between 2 and 10 segments.\n- Segments must be in chronological order, must not overlap, and should cover the whole recording.\n- Each segment should be at least 3 minutes long.\n- Titles are specific and learner-facing (no "Part 1").\n\nReturn ONLY JSON, no markdown:\n{"segments": [{"suggested_title": "...", "start_seconds": 0, "end_seconds": 600, "summary": "1-2 sentences on what this segment covers"}]}`,
      );
      if (!ai.ok) {
        return new Response(JSON.stringify({ error: ai.error }), {
          status: ai.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const parsedSeg = parseJson(ai.content) as { segments?: unknown[] } | null;
      const rawSegs = Array.isArray(parsedSeg?.segments) ? parsedSeg!.segments : [];
      const segments = rawSegs
        .map((r) => {
          const o = r as Record<string, unknown>;
          return {
            suggested_title: String(o?.suggested_title ?? "").trim(),
            start_seconds: Math.max(0, Math.floor(Number(o?.start_seconds ?? 0))),
            end_seconds: Math.max(0, Math.floor(Number(o?.end_seconds ?? 0))),
            summary: String(o?.summary ?? "").trim(),
          };
        })
        .filter((sg) => sg.suggested_title && sg.end_seconds > sg.start_seconds)
        .sort((a, b) => a.start_seconds - b.start_seconds);

      if (segments.length === 0) {
        const fb = evenSplit();
        if (!fb) {
          return new Response(JSON.stringify({ error: "AI could not segment this recording" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ segments: fb, used_fallback: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ segments, used_fallback: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      const { title, target_audience, context_text, question_count } = body;

      if (!title || !context_text) {
        return new Response(
          JSON.stringify({ error: "Title and context are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const parsedCount = Number(question_count);
      const questionCount = Number.isFinite(parsedCount)
        ? Math.min(20, Math.max(3, Math.round(parsedCount)))
        : 8;

      const userPrompt = `Generate exactly ${questionCount} multiple-choice questions for a course called '${title}' aimed at '${target_audience || "training professionals"}'.\n\nCourse content context:\n${context_text}\n\nReturn ONLY a JSON array of exactly ${questionCount} objects, no markdown, no preamble, in this exact format:\n[{"question_text": "...", "explanation": "Brief explanation of why the correct answer is right, shown to learners who got it wrong", "options": [{"value": "A", "label": "...", "is_correct": true}, {"value": "B", "label": "...", "is_correct": false}, {"value": "C", "label": "...", "is_correct": false}, {"value": "D", "label": "...", "is_correct": false}]}]`;

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
