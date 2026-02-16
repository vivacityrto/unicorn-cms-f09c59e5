/**
 * research-public-snapshot: Generates a public offering snapshot or template review
 * for a tenant by scraping their public website and analysing via Perplexity.
 * 
 * Input: { tenant_id: number, job_type: 'public_offering_snapshot' | 'template_review', website?: string, rto_code?: string, template_context?: string }
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
        JSON.stringify({ ok: false, code: "UNAUTHORIZED", detail: "No token" }),
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

    const { tenant_id, job_type, website, rto_code, template_context } = await req.json();

    if (!tenant_id || !job_type) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", detail: "tenant_id and job_type required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validTypes = ["public_offering_snapshot", "template_review"];
    if (!validTypes.includes(job_type)) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", detail: `job_type must be one of: ${validTypes.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");

    if (!firecrawlKey || !perplexityKey) {
      return new Response(
        JSON.stringify({ ok: false, code: "CONFIG_ERROR", detail: "API keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create research job
    const { data: job, error: jobError } = await supabase
      .from("research_jobs")
      .insert({
        tenant_id,
        job_type,
        status: "running",
        created_by: user.id,
        input_json: { website, rto_code, template_context },
      })
      .select("id")
      .single();

    if (jobError || !job) {
      console.error("Job creation error:", jobError);
      return new Response(
        JSON.stringify({ ok: false, code: "DB_ERROR", detail: "Failed to create job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Scrape website if provided
    const scrapedContent: string[] = [];

    if (website) {
      let base = website.trim();
      if (!base.startsWith("http")) base = `https://${base}`;
      base = base.replace(/\/+$/, "");

      const paths = job_type === "public_offering_snapshot"
        ? ["/", "/courses", "/programs", "/qualifications", "/training"]
        : ["/", "/about", "/policies", "/students"];

      for (const path of paths) {
        try {
          const url = `${base}${path}`;
          const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${firecrawlKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
          });

          if (fcResponse.ok) {
            const fcData = await fcResponse.json();
            const markdown = fcData.data?.markdown || fcData.markdown || "";
            const title = fcData.data?.metadata?.title || url;

            if (markdown) {
              const encoder = new TextEncoder();
              const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(markdown));
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              const contentHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

              await supabase.from("research_sources").insert({
                job_id: job.id,
                url,
                title,
                content_hash: contentHash,
                raw_markdown: markdown,
                retrieved_at: new Date().toISOString(),
              });

              scrapedContent.push(`[${title}]\n${markdown.slice(0, 3000)}`);
            }
          } else {
            await fcResponse.text(); // consume body
          }
        } catch (scrapeErr) {
          console.error(`Scrape error:`, scrapeErr);
        }
      }
    }

    // Build prompt based on job type
    const contextText = scrapedContent.join("\n\n---\n\n");

    let systemPrompt: string;
    let userPrompt: string;

    if (job_type === "public_offering_snapshot") {
      systemPrompt = `You are analysing an Australian RTO's public course offerings. Ground your analysis in the provided website content. This is for compliance review.\n\n${contextText}`;
      userPrompt = `Provide a structured snapshot of this RTO's${rto_code ? ` (RTO Code: ${rto_code})` : ""} public offerings:

1. **Qualifications Listed** — all qualifications/courses found with codes if available
2. **Delivery Modes** — online, face-to-face, blended, workplace, etc.
3. **Delivery Locations** — states, cities, campuses mentioned
4. **Entry Requirements** — any prerequisites mentioned
5. **Duration & Fees** — any pricing or duration info
6. **Gaps & Concerns** — missing information, outdated content, compliance risks

Be factual. Only report what is found. Flag anything suspicious or missing.`;
    } else {
      // template_review
      systemPrompt = `You are reviewing an RTO's compliance documents against their public website claims. Ground your analysis in facts.\n\n${contextText}`;
      userPrompt = `Review this RTO's public presence against the following template/document context:

${template_context || "(No template context provided)"}

Identify:
1. **Alignment** — where public claims match template expectations
2. **Gaps** — where the template expects something not evidenced publicly
3. **Risks** — inconsistencies between public statements and template requirements
4. **Recommendations** — specific areas to investigate during consulting

Be specific and cite which page each finding comes from.`;
    }

    const ppxResponse = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
      }),
    });

    let summaryMd = "";
    let citations: any[] = [];

    if (ppxResponse.ok) {
      const ppxData = await ppxResponse.json();
      summaryMd = ppxData.choices?.[0]?.message?.content || "";
      citations = (ppxData.citations || []).map((url: string, i: number) => ({
        index: i + 1,
        url,
        retrieved_at: new Date().toISOString(),
      }));
    } else {
      const errText = await ppxResponse.text();
      console.error("Perplexity error:", errText);
      summaryMd = "Analysis unavailable — Perplexity API error.";
    }

    await supabase.from("research_findings").insert({
      job_id: job.id,
      summary_md: summaryMd,
      citations_json: citations,
      review_status: "draft",
    });

    await supabase
      .from("research_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        output_json: { pages_scraped: scrapedContent.length, citation_count: citations.length },
      })
      .eq("id", job.id);

    return new Response(
      JSON.stringify({ ok: true, job_id: job.id, summary_md: summaryMd, citations }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("research-public-snapshot error:", err);
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL_ERROR", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
