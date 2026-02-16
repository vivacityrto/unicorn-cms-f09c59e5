/**
 * research-tas-context: TAS Context Assistant pipeline
 * 
 * Creates a research job, scrapes training.gov.au + client site,
 * analyses against Standards for RTOs 2025, and stores a structured brief.
 * 
 * Input: {
 *   tenant_id: number,
 *   stage_instance_id: number,
 *   qualification_code?: string,
 *   training_gov_url?: string,
 *   client_site_url?: string,
 *   delivery_mode?: string,
 *   audience_notes?: string,
 *   tenant_name?: string
 * }
 * Auth: Vivacity Team only
 */
import { corsHeaders } from "../_shared/cors.ts";
import { extractToken, verifyAuth, checkVivacityTeam } from "../_shared/auth-helpers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CLIENT_SCRAPE_PATHS = [
  "/courses",
  "/programs",
  "/qualifications",
  "/entry-requirements",
  "/fees",
  "/delivery",
  "/assessment",
  "/work-placement",
  "/policies",
  "/about",
];

async function computeHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(content));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function auditLog(supabase: any, userId: string, jobId: string, action: string, details?: any) {
  await supabase.from("research_audit_log").insert({
    user_id: userId,
    job_id: jobId,
    action,
    details: details || null,
  });
}

async function scrapeUrl(firecrawlKey: string, url: string): Promise<{ markdown: string; title: string } | null> {
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });

    if (response.status === 429 || response.status === 402) {
      await response.text();
      return null;
    }

    if (!response.ok) {
      await response.text();
      return null;
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || "";
    const title = data.data?.metadata?.title || url;

    if (markdown.length < 50) return null;
    return { markdown, title };
  } catch (err) {
    console.error(`Scrape error for ${url}:`, err);
    return null;
  }
}

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

    const {
      tenant_id,
      stage_instance_id,
      qualification_code,
      training_gov_url,
      client_site_url,
      delivery_mode,
      audience_notes,
      tenant_name,
    } = await req.json();

    if (!tenant_id || !stage_instance_id) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", detail: "tenant_id and stage_instance_id required" }),
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

    // Step 1: Create research job
    const { data: job, error: jobError } = await supabase
      .from("research_jobs")
      .insert({
        tenant_id,
        stage_instance_id,
        job_type: "tas_context_assistant",
        status: "queued",
        created_by: user.id,
        standards_version: "Standards for RTOs 2025",
        input_json: {
          qualification_code,
          training_gov_url,
          client_site_url,
          delivery_mode,
          audience_notes,
          tenant_name,
        },
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

    await auditLog(supabase, user.id, job.id, "tas_context_job_created", {
      tenant_id, stage_instance_id, qualification_code,
    });

    await supabase.from("research_jobs").update({ status: "running" }).eq("id", job.id);

    // Step 2: Scrape sources
    const scrapedContent: Array<{ url: string; title: string; markdown: string; sourceId?: string; role: string }> = [];

    // 2a: training.gov.au
    if (training_gov_url) {
      console.log(`Scraping training.gov.au: ${training_gov_url}`);
      const result = await scrapeUrl(firecrawlKey, training_gov_url);
      if (result) {
        const hash = await computeHash(result.markdown);
        const { data: src } = await supabase.from("research_sources").insert({
          job_id: job.id,
          url: training_gov_url,
          title: result.title,
          content_hash: hash,
          raw_markdown: result.markdown,
          retrieved_at: new Date().toISOString(),
        }).select("id").single();

        scrapedContent.push({
          url: training_gov_url,
          title: result.title,
          markdown: result.markdown.slice(0, 6000),
          sourceId: src?.id,
          role: "training_gov",
        });
      }
    }

    // 2b: Client site pages
    if (client_site_url) {
      let base = client_site_url.trim();
      if (!base.startsWith("http")) base = `https://${base}`;
      base = base.replace(/\/+$/, "");

      for (const path of CLIENT_SCRAPE_PATHS) {
        const url = `${base}${path}`;
        console.log(`Scraping client: ${url}`);
        const result = await scrapeUrl(firecrawlKey, url);
        if (result) {
          const hash = await computeHash(result.markdown);
          const { data: src } = await supabase.from("research_sources").insert({
            job_id: job.id,
            url,
            title: result.title,
            content_hash: hash,
            raw_markdown: result.markdown,
            retrieved_at: new Date().toISOString(),
          }).select("id").single();

          scrapedContent.push({
            url,
            title: result.title,
            markdown: result.markdown.slice(0, 4000),
            sourceId: src?.id,
            role: "client_site",
          });
        }
      }
    }

    await auditLog(supabase, user.id, job.id, "firecrawl_scrape_completed", {
      sources_count: scrapedContent.length,
    });

    if (scrapedContent.length === 0) {
      await supabase.from("research_jobs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        output_json: { error: "No content could be scraped" },
      }).eq("id", job.id);

      return new Response(
        JSON.stringify({ ok: false, code: "SCRAPE_FAILED", detail: "No content scraped" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Perplexity Analysis
    const contextText = scrapedContent
      .map((s, i) => `[Source ${i + 1}: ${s.title} — ${s.url}]\n${s.markdown}`)
      .join("\n\n---\n\n");

    const qualInfo = qualification_code ? `Qualification Code: ${qualification_code}` : "";
    const deliveryInfo = delivery_mode ? `Delivery Mode: ${delivery_mode}` : "";
    const audienceInfo = audience_notes ? `Audience Notes: ${audience_notes}` : "";

    const systemPrompt = `You are a compliance research assistant for Australian Registered Training Organisations (RTOs). You create structured context briefs to support Training and Assessment Strategy (TAS) development.

CRITICAL RULES:
- This brief highlights potential risk indicators only and does not determine compliance.
- Never state that an RTO is compliant or non-compliant.
- Every finding must include a specific source URL.
- Map risk indicators to relevant clauses from the Standards for RTOs 2025.
- Do not reference Standards for RTOs 2015.

Use the following scraped source material:

${contextText}`;

    const userPrompt = `Create a TAS Context Brief for ${tenant_name || "this RTO"}.
${qualInfo}
${deliveryInfo}
${audienceInfo}

Structure the brief with these sections:

## 1. Qualification Overview
- Qualification title and code if available
- Training package context

## 2. Packaging Summary
- Core and elective unit approach if available from training.gov.au
- Any packaging rules identified

## 3. Entry Requirements
- Published entry requirement cues from the public website
- Any gaps or unclear statements

## 4. Delivery and Assessment Considerations
- Delivery mode implications (${delivery_mode || "not specified"})
- Third-party and workplace delivery cues
- Assessment method signals from public content

## 5. Learner Cohort and Support
- LLND and support signals from public claims
- Target audience indicators

## 6. Evidence and Implementation Prompts
- What to confirm internally with the RTO
- What to validate with the client
- Items requiring additional evidence

## 7. Risk Indicators
For each risk:
- **Observed Claim**: The claim from the source
- **Risk Indicator**: Why this requires attention
- **Relevant 2025 Standard Clause**: The specific clause
- **Source**: URL where found

Also provide a structured JSON block:
\`\`\`json
[
  {
    "risk_category": "category",
    "standard_clause": "Clause X.X",
    "severity": "low|medium|high",
    "source_url": "url",
    "claim_excerpt": "text"
  }
]
\`\`\`

End with: "This brief highlights potential risk indicators only and does not determine compliance."`;

    console.log("Calling Perplexity for TAS context analysis");

    const ppxResponse = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
      }),
    });

    let summaryMd = "";
    let citations: any[] = [];
    let riskFlags: any[] = [];
    let briefJson: any = {};

    if (ppxResponse.ok) {
      const ppxData = await ppxResponse.json();
      summaryMd = ppxData.choices?.[0]?.message?.content || "";
      citations = (ppxData.citations || []).map((url: string, i: number) => ({
        index: i + 1,
        url,
        snippet: "",
        retrieved_at: new Date().toISOString(),
      }));

      // Extract risk flags JSON
      const jsonMatch = summaryMd.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch?.[1]) {
        try {
          riskFlags = JSON.parse(jsonMatch[1].trim());
        } catch (e) {
          console.error("Failed to parse risk flags JSON:", e);
        }
      }

      briefJson = {
        qualification_code: qualification_code || null,
        delivery_mode: delivery_mode || null,
        audience_notes: audience_notes || null,
        risk_flags: riskFlags,
        citations,
        sources_count: scrapedContent.length,
      };
    } else {
      const errText = await ppxResponse.text();
      console.error("Perplexity error:", errText);
      summaryMd = "Analysis unavailable — AI service error.";
    }

    await auditLog(supabase, user.id, job.id, "perplexity_analysis_completed", {
      citation_count: citations.length,
      risk_flag_count: riskFlags.length,
    });

    // Prepend header
    const now = new Date().toISOString();
    const headerMd = `# TAS Context Brief

**Tenant:** ${tenant_name || "Unknown"}  
${qualification_code ? `**Qualification:** ${qualification_code}\n` : ""}${delivery_mode ? `**Delivery Mode:** ${delivery_mode}\n` : ""}**Generated:** ${new Date(now).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" })}  
**Standards Reference:** Standards for RTOs 2025  
**Sources Analysed:** ${scrapedContent.length}

---

`;

    const fullBriefMd = headerMd + summaryMd;

    // Store finding
    const { data: finding } = await supabase
      .from("research_findings")
      .insert({
        job_id: job.id,
        summary_md: fullBriefMd,
        citations_json: citations,
        risk_flags_json: riskFlags,
        review_status: "draft",
      })
      .select("id")
      .single();

    // Create or update tas_context_briefs
    const { data: brief, error: briefError } = await supabase
      .from("tas_context_briefs")
      .insert({
        tenant_id,
        stage_instance_id,
        qualification_code: qualification_code || null,
        qualification_title: null,
        delivery_mode: delivery_mode || null,
        audience_notes: audience_notes || null,
        generated_from_job_id: job.id,
        brief_markdown: fullBriefMd,
        brief_json: briefJson,
        status: "draft",
        created_by_user_id: user.id,
      })
      .select("id")
      .single();

    if (briefError) {
      console.error("Brief creation error:", briefError);
    }

    // Link sources to brief
    if (brief) {
      const sourceLinks = scrapedContent
        .filter(s => s.sourceId)
        .map(s => ({
          tas_context_brief_id: brief.id,
          job_id: job.id,
          source_id: s.sourceId!,
          source_role: s.role,
        }));

      if (sourceLinks.length > 0) {
        await supabase.from("tas_context_sources").insert(sourceLinks);
      }

      await auditLog(supabase, user.id, job.id, "brief_created", { brief_id: brief.id });
    }

    // Complete job
    await supabase.from("research_jobs").update({
      status: "completed",
      completed_at: now,
      output_json: {
        finding_id: finding?.id,
        brief_id: brief?.id,
        sources_scraped: scrapedContent.length,
        citation_count: citations.length,
        risk_flag_count: riskFlags.length,
      },
    }).eq("id", job.id);

    return new Response(
      JSON.stringify({
        ok: true,
        job_id: job.id,
        brief_id: brief?.id,
        finding_id: finding?.id,
        summary_md: fullBriefMd,
        citations,
        risk_flags: riskFlags,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("research-tas-context error:", err);
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL_ERROR", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
