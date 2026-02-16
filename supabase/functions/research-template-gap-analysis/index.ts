/**
 * research-template-gap-analysis – Phase 8
 * Analyses a Vivacity master template against Standards for RTOs 2025 clauses.
 * Uses Perplexity sonar-pro for clause mapping analysis.
 * Never auto-edits templates. Returns structured gap analysis only.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!
    ).auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { template_id, template_version_id, template_content, template_name, template_category, tenant_id } = await req.json();

    if (!template_content || !tenant_id) {
      return new Response(JSON.stringify({ error: "template_content and tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Create research_job
    const { data: job, error: jobErr } = await supabase
      .from("research_jobs")
      .insert({
        tenant_id,
        job_type: "template_gap_analysis",
        status: "processing",
        created_by: user.id,
        input_json: {
          template_id,
          template_version_id,
          template_name,
          template_category,
          standards_version: "Standards for RTOs 2025",
        },
        standards_version: "Standards for RTOs 2025",
      })
      .select("id")
      .single();

    if (jobErr) throw new Error(`Job creation failed: ${jobErr.message}`);

    // 2. Call Perplexity for clause mapping analysis
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY not configured");

    const truncatedContent = template_content.substring(0, 25000);

    const systemPrompt = `You are a compliance document analyst specialising in Australian vocational education regulation. You will analyse a template document against the Standards for Registered Training Organisations (RTOs) 2025.

Your task:
1. Map the template content to each relevant clause in the Standards for RTOs 2025.
2. For each clause, determine coverage status: "explicit" (directly addressed), "implicit" (indirectly addressed), "weak" (poorly/vaguely addressed), or "missing" (not addressed).
3. Provide a confidence level: "high", "medium", or "low".
4. For explicit/implicit/weak clauses, provide a supporting excerpt from the template.
5. For weak/missing clauses, provide an improvement note explaining what should be strengthened.
6. Identify language that may be outdated, lacks operational clarity, or may create regulatory ambiguity.

You MUST return a JSON object with this exact structure:
{
  "clauses": [
    {
      "clause": "1.1",
      "coverage_status": "explicit|implicit|weak|missing",
      "confidence": "high|medium|low",
      "excerpt": "relevant text from template or null",
      "improvement_note": "suggestion or null"
    }
  ],
  "summary": "Executive summary of the analysis in markdown format",
  "high_risk_gaps": ["list of clause numbers that are missing and high-risk"],
  "language_concerns": [
    {
      "excerpt": "problematic text",
      "concern": "explanation of the issue",
      "clause": "related clause number"
    }
  ]
}

IMPORTANT:
- Only reference Standards for RTOs 2025.
- Do not provide compliance verdicts.
- Include this disclaimer in the summary: "This analysis identifies potential clause coverage gaps only and does not determine compliance."
- Focus on the clauses most relevant to the template category.
- Be thorough but practical — focus on material gaps.`;

    const perplexityResponse = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analyse this ${template_category || "compliance"} template titled "${template_name || "Untitled"}" against the Standards for RTOs 2025:\n\n${truncatedContent}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!perplexityResponse.ok) {
      const errText = await perplexityResponse.text();
      console.error("Perplexity error:", perplexityResponse.status, errText);
      await supabase.from("research_jobs").update({ status: "failed" }).eq("id", job.id);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await perplexityResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";
    const citations = aiData.citations || [];

    // Parse JSON from response
    let analysis: any;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      analysis = null;
    }

    if (!analysis || !analysis.clauses) {
      await supabase.from("research_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        output_json: { raw_response: rawContent, citations },
      }).eq("id", job.id);

      return new Response(JSON.stringify({
        error: "Could not parse structured analysis",
        raw_response: rawContent,
        job_id: job.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Create template_analysis_jobs record
    const { data: analysisJob, error: ajErr } = await supabase
      .from("template_analysis_jobs")
      .insert({
        template_id,
        template_version_id,
        research_job_id: job.id,
        generated_by_user_id: user.id,
        status: "draft",
      })
      .select("id")
      .single();

    if (ajErr) throw new Error(`Analysis job creation failed: ${ajErr.message}`);

    // 4. Insert clause mappings
    const clauseMappings = (analysis.clauses || []).map((c: any) => ({
      template_analysis_job_id: analysisJob.id,
      standard_clause: c.clause,
      coverage_status: c.coverage_status,
      confidence_level: c.confidence || "medium",
      supporting_excerpt: c.excerpt || null,
      improvement_note: c.improvement_note || null,
    }));

    if (clauseMappings.length > 0) {
      const { error: cmErr } = await supabase.from("template_clause_mappings").insert(clauseMappings);
      if (cmErr) console.error("Clause mapping insert error:", cmErr);
    }

    // 5. Create gap summary
    const explicit = clauseMappings.filter((c: any) => c.coverage_status === "explicit").length;
    const weak = clauseMappings.filter((c: any) => c.coverage_status === "weak").length;
    const missing = clauseMappings.filter((c: any) => c.coverage_status === "missing").length;
    const highRiskGaps = (analysis.high_risk_gaps || []).length;

    const summaryMd = analysis.summary || "Analysis complete. Review clause mappings for details.";

    await supabase.from("template_gap_summary").insert({
      template_analysis_job_id: analysisJob.id,
      total_clauses_checked: clauseMappings.length,
      explicit_count: explicit,
      weak_count: weak,
      missing_count: missing,
      high_risk_gaps_count: highRiskGaps,
      summary_markdown: summaryMd,
    });

    // 6. Store research findings
    await supabase.from("research_findings").insert({
      job_id: job.id,
      source_label: "perplexity_template_analysis",
      content_markdown: summaryMd,
      retrieved_at: new Date().toISOString(),
      citations_json: citations,
      risk_flags_json: (analysis.high_risk_gaps || []).map((clause: string) => ({
        standard_clause: clause,
        category: "template_gap",
        severity: "high",
        theme: "Missing clause coverage in template",
      })),
    });

    // 7. Complete research job
    await supabase.from("research_jobs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      output_json: { analysis_job_id: analysisJob.id, language_concerns: analysis.language_concerns || [] },
    }).eq("id", job.id);

    // 8. Audit log
    await supabase.from("audit_events").insert({
      entity: "template_analysis_job",
      entity_id: analysisJob.id,
      action: "gap_analysis_completed",
      user_id: user.id,
      details: {
        template_id,
        template_name,
        clauses_checked: clauseMappings.length,
        missing_count: missing,
        weak_count: weak,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      analysis_job_id: analysisJob.id,
      research_job_id: job.id,
      summary: {
        total_clauses: clauseMappings.length,
        explicit: explicit,
        weak: weak,
        missing: missing,
        high_risk_gaps: highRiskGaps,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Template gap analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
