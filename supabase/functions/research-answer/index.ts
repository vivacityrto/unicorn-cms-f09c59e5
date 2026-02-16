/**
 * research-answer: Calls Perplexity to synthesise an answer with citations.
 * Stores summary + citations in research_findings with review_status = 'draft'.
 * 
 * Input: { job_id: string, question: string, context_sources?: string[] }
 * Auth: Vivacity Team only
 */
import { corsHeaders } from "../_shared/cors.ts";
import { extractToken, verifyAuth, checkVivacityTeam } from "../_shared/auth-helpers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = extractToken(req);
    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, code: "UNAUTHORIZED", detail: "No token provided" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { user, profile, error: authError } = await verifyAuth(supabase, token);
    if (authError || !user || !profile) {
      return new Response(
        JSON.stringify({ ok: false, code: "UNAUTHORIZED", detail: authError || "Auth failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!checkVivacityTeam(profile)) {
      return new Response(
        JSON.stringify({ ok: false, code: "FORBIDDEN", detail: "Vivacity Team access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { job_id, question, context_sources } = await req.json();

    if (!job_id || !question) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", detail: "job_id and question required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!apiKey) {
      console.error("PERPLEXITY_API_KEY not configured");
      return new Response(
        JSON.stringify({ ok: false, code: "CONFIG_ERROR", detail: "Perplexity not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update job status to running
    await supabase
      .from("research_jobs")
      .update({ status: "running" })
      .eq("id", job_id);

    // Build context from scraped sources if provided
    let systemPrompt = "You are a compliance research assistant for Australian RTOs. Provide accurate, well-cited answers. Always include source references.";

    if (context_sources && Array.isArray(context_sources) && context_sources.length > 0) {
      // Fetch scraped content from research_sources
      const { data: sources } = await supabase
        .from("research_sources")
        .select("url, title, raw_markdown")
        .in("id", context_sources);

      if (sources && sources.length > 0) {
        const contextText = sources
          .map((s, i) => `[Source ${i + 1}: ${s.title || s.url}]\n${(s.raw_markdown || "").slice(0, 4000)}`)
          .join("\n\n---\n\n");

        systemPrompt += `\n\nUse the following scraped source material to ground your answer:\n\n${contextText}`;
      }
    }

    console.log("Calling Perplexity for question:", question.slice(0, 100));

    const ppxResponse = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        temperature: 0.2,
      }),
    });

    if (ppxResponse.status === 429 || ppxResponse.status === 402) {
      const errBody = await ppxResponse.text();
      console.error(`Perplexity rate/billing error (${ppxResponse.status}):`, errBody);
      await supabase
        .from("research_jobs")
        .update({ status: "failed", output_json: { error: `Perplexity ${ppxResponse.status}` } })
        .eq("id", job_id);

      return new Response(
        JSON.stringify({ ok: false, code: "RATE_LIMITED", detail: `Perplexity returned ${ppxResponse.status}` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ppxData = await ppxResponse.json();

    if (!ppxResponse.ok) {
      console.error("Perplexity API error:", ppxData);
      await supabase
        .from("research_jobs")
        .update({ status: "failed", output_json: { error: ppxData } })
        .eq("id", job_id);

      return new Response(
        JSON.stringify({ ok: false, code: "API_ERROR", detail: "Perplexity request failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const answerText = ppxData.choices?.[0]?.message?.content || "";
    const citations = (ppxData.citations || []).map((url: string, index: number) => ({
      index: index + 1,
      url,
      retrieved_at: new Date().toISOString(),
    }));

    // Store finding
    const { data: finding, error: findingError } = await supabase
      .from("research_findings")
      .insert({
        job_id,
        summary_md: answerText,
        citations_json: citations,
        review_status: "draft",
      })
      .select("id")
      .single();

    if (findingError) {
      console.error("Insert finding error:", findingError);
      await supabase
        .from("research_jobs")
        .update({ status: "failed", output_json: { error: "DB insert failed" } })
        .eq("id", job_id);

      return new Response(
        JSON.stringify({ ok: false, code: "DB_ERROR", detail: "Failed to store finding" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update job as completed
    await supabase
      .from("research_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        output_json: { finding_id: finding.id, citation_count: citations.length },
      })
      .eq("id", job_id);

    return new Response(
      JSON.stringify({
        ok: true,
        finding_id: finding.id,
        summary_md: answerText,
        citations,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("research-answer error:", err);
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL_ERROR", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
