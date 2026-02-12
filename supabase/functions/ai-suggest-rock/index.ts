import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Cache-Control": "no-store",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { rock_level, tenant_id, parent_rock_id, function_id, owner_id } =
      await req.json();

    if (!rock_level || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "rock_level and tenant_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context based on rock level
    let contextParts: string[] = [];

    if (rock_level === "company") {
      // Fetch VTO
      const { data: vto } = await supabase
        .from("eos_vto")
        .select("ten_year_target, three_year_measurables, one_year_goals, one_year_measurables, core_values")
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .maybeSingle();

      if (vto) {
        if (vto.ten_year_target)
          contextParts.push(`10-Year Target: ${vto.ten_year_target}`);
        if (vto.three_year_measurables)
          contextParts.push(`3-Year Measurables: ${JSON.stringify(vto.three_year_measurables)}`);
        if (vto.one_year_goals)
          contextParts.push(`1-Year Goals: ${JSON.stringify(vto.one_year_goals)}`);
        if (vto.one_year_measurables)
          contextParts.push(`1-Year Measurables: ${JSON.stringify(vto.one_year_measurables)}`);
      }

      // Fetch existing company rocks this quarter
      const now = new Date();
      const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
      const currentYear = now.getFullYear();

      const { data: existingRocks } = await supabase
        .from("eos_rocks")
        .select("title, description")
        .eq("tenant_id", tenant_id)
        .eq("rock_level", "company")
        .eq("quarter_year", currentYear)
        .eq("quarter_number", currentQuarter)
        .is("archived_at", null);

      if (existingRocks?.length) {
        contextParts.push(
          `Existing company rocks this quarter:\\n${existingRocks.map((r) => `- ${r.title}`).join("\\n")}`
        );
      }
    } else if (rock_level === "team") {
      // Fetch parent company rock
      if (parent_rock_id) {
        const { data: parentRock } = await supabase
          .from("eos_rocks")
          .select("title, description")
          .eq("id", parent_rock_id)
          .maybeSingle();

        if (parentRock) {
          contextParts.push(`Parent Company Rock: ${parentRock.title}`);
          if (parentRock.description)
            contextParts.push(`Parent Description: ${parentRock.description}`);
        }
      }

      // Fetch function name
      if (function_id) {
        const { data: func } = await supabase
          .from("accountability_functions")
          .select("name")
          .eq("id", function_id)
          .maybeSingle();

        if (func) contextParts.push(`Team Function: ${func.name}`);
      }

      // Existing team rocks for this function
      if (function_id) {
        const { data: existingRocks } = await supabase
          .from("eos_rocks")
          .select("title")
          .eq("tenant_id", tenant_id)
          .eq("rock_level", "team")
          .eq("function_id", function_id)
          .is("archived_at", null)
          .limit(10);

        if (existingRocks?.length) {
          contextParts.push(
            `Existing team rocks for this function:\\n${existingRocks.map((r) => `- ${r.title}`).join("\\n")}`
          );
        }
      }
    } else if (rock_level === "individual") {
      // Fetch parent team rock
      if (parent_rock_id) {
        const { data: parentRock } = await supabase
          .from("eos_rocks")
          .select("title, description")
          .eq("id", parent_rock_id)
          .maybeSingle();

        if (parentRock) {
          contextParts.push(`Parent Team Rock: ${parentRock.title}`);
          if (parentRock.description)
            contextParts.push(`Parent Description: ${parentRock.description}`);
        }
      }

      // Owner's existing individual rocks
      if (owner_id) {
        const { data: existingRocks } = await supabase
          .from("eos_rocks")
          .select("title")
          .eq("tenant_id", tenant_id)
          .eq("rock_level", "individual")
          .eq("owner_id", owner_id)
          .is("archived_at", null)
          .limit(10);

        if (existingRocks?.length) {
          contextParts.push(
            `This person's existing individual rocks:\\n${existingRocks.map((r) => `- ${r.title}`).join("\\n")}`
          );
        }
      }
    }

    const levelLabel =
      rock_level === "company"
        ? "Company"
        : rock_level === "team"
        ? "Team"
        : "Individual";

    const systemPrompt = `You are a strategic business consultant helping create EOS (Entrepreneurial Operating System) Rocks.\nRocks are 90-day priorities that are specific, measurable, and achievable.\nYou must suggest a single ${levelLabel} Rock based on the context provided.\nMake the rock SMART: Specific, Measurable, Attainable, Realistic, and Timely.\nKeep language professional but concise. Do not repeat context back verbatim.`;

    const userPrompt = contextParts.length
      ? `Based on this context, suggest a ${levelLabel} Rock:\\n\\n${contextParts.join("\\n\\n")}`
      : `Suggest a strong ${levelLabel} Rock for an organisation running on EOS. Since no specific context is available, suggest something commonly valuable for this level.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "suggest_rock",
                description:
                  "Return a suggested EOS Rock with title, description, issue, outcome, and milestones.",
                parameters: {
                  type: "object",
                  properties: {
                    title: {
                      type: "string",
                      description: "Rock title, max 100 characters",
                    },
                    description: {
                      type: "string",
                      description: "What does success look like, max 300 characters",
                    },
                    issue: {
                      type: "string",
                      description: "What problem or opportunity this addresses, max 200 characters",
                    },
                    outcome: {
                      type: "string",
                      description: "What will be different when complete, max 200 characters",
                    },
                    milestones: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          text: { type: "string" },
                        },
                        required: ["text"],
                        additionalProperties: false,
                      },
                      description: "3-5 milestones for tracking progress",
                    },
                  },
                  required: [
                    "title",
                    "description",
                    "issue",
                    "outcome",
                    "milestones",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "suggest_rock" },
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits in workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return structured output");
    }

    const suggestion = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(suggestion), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-suggest-rock error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
