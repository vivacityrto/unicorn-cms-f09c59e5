/**
 * research-public-snapshot: Phase 2 – Public Compliance Risk Snapshot
 * 
 * Scrapes a tenant's public website, analyses claims against Standards for RTOs 2025,
 * and generates structured risk indicators. Never makes compliance determinations.
 * 
 * Input: { tenant_id: number, website: string, rto_code?: string, tenant_name?: string }
 * Auth: Vivacity Team only
 */
import { corsHeaders } from "../_shared/cors.ts";
import { extractToken, verifyAuth, checkVivacityTeam } from "../_shared/auth-helpers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SCRAPE_PATHS = [
  "/",
  "/courses",
  "/programs",
  "/qualifications",
  "/training",
  "/entry-requirements",
  "/about",
  "/assessment",
  "/delivery",
  "/work-placement",
];

// Keywords to detect in page content for extended scraping
const COMPLIANCE_KEYWORDS = ["LLND", "assessment", "delivery", "entry requirement", "work placement", "third-party"];

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

    const { tenant_id, website, rto_code, tenant_name } = await req.json();

    if (!tenant_id || !website) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", detail: "tenant_id and website required" }),
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
        job_type: "public_compliance_snapshot",
        status: "queued",
        created_by: user.id,
        standards_version: "Standards for RTOs 2025",
        input_json: { website, rto_code, tenant_name },
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

    await auditLog(supabase, user.id, job.id, "job_created", { tenant_id, website, rto_code });

    // Update to running
    await supabase.from("research_jobs").update({ status: "running" }).eq("id", job.id);
    await auditLog(supabase, user.id, job.id, "scrape_started", { paths: SCRAPE_PATHS });

    // Step 2: Scrape tenant website
    let base = website.trim();
    if (!base.startsWith("http")) base = `https://${base}`;
    base = base.replace(/\/+$/, "");

    // Restrict to domain only
    const domain = new URL(base).hostname;

    const scrapedContent: Array<{ url: string; title: string; markdown: string }> = [];

    for (const path of SCRAPE_PATHS) {
      try {
        const url = `${base}${path}`;
        console.log(`Scraping: ${url}`);

        const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
        });

        if (fcResponse.status === 429 || fcResponse.status === 402) {
          console.error(`Firecrawl rate/billing error for ${url}`);
          continue;
        }

        if (fcResponse.ok) {
          const fcData = await fcResponse.json();
          const markdown = fcData.data?.markdown || fcData.markdown || "";
          const title = fcData.data?.metadata?.title || url;

          if (markdown && markdown.length > 50) {
            const contentHash = await computeHash(markdown);

            await supabase.from("research_sources").insert({
              job_id: job.id,
              url,
              title,
              content_hash: contentHash,
              raw_markdown: markdown,
              retrieved_at: new Date().toISOString(),
            });

            scrapedContent.push({ url, title, markdown: markdown.slice(0, 4000) });
          }
        } else {
          await fcResponse.text(); // consume body
        }
      } catch (scrapeErr) {
        console.error(`Scrape error for path ${path}:`, scrapeErr);
      }
    }

    if (scrapedContent.length === 0) {
      await supabase.from("research_jobs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        output_json: { error: "No content could be scraped from the website" },
      }).eq("id", job.id);

      return new Response(
        JSON.stringify({ ok: false, code: "SCRAPE_FAILED", detail: "No content scraped" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Perplexity Analysis against Standards for RTOs 2025
    const contextText = scrapedContent
      .map((s, i) => `[Source ${i + 1}: ${s.title} — ${s.url}]\n${s.markdown}`)
      .join("\n\n---\n\n");

    const systemPrompt = `You are a compliance risk analyst for Australian Registered Training Organisations (RTOs). You analyse public website content against the Standards for Registered Training Organisations (RTOs) 2025.

CRITICAL RULES:
- This analysis highlights potential risk indicators only and does not determine compliance.
- Never state that an RTO is non-compliant. Only highlight areas of potential risk.
- Every finding must include a specific source URL and claim excerpt.
- Map each finding to a relevant clause from the Standards for RTOs 2025.
- Do not reference Standards for RTOs 2015.

Use the following scraped website content to ground your analysis:

${contextText}`;

    const userPrompt = `Analyse the public website content for ${tenant_name || "this RTO"}${rto_code ? ` (RTO Code: ${rto_code})` : ""} and produce a Public Compliance Risk Snapshot.

Extract all public claims relating to:
1. Course duration
2. Delivery mode (online, face-to-face, blended, workplace)
3. Assessment methods
4. Entry requirements
5. Language, Literacy, Numeracy and Digital (LLND) requirements
6. Work placement arrangements
7. Third-party arrangements

For each identified risk indicator, provide:
- **Observed Claim**: The exact or paraphrased claim from the website
- **Why This May Present Risk**: Why this claim could be problematic
- **Relevant 2025 Standard Clause**: The specific clause reference
- **Source Link**: The URL where the claim was found

Also provide a structured JSON block at the end with this format:
\`\`\`json
[
  {
    "risk_category": "category name",
    "standard_clause": "Clause X.X",
    "severity": "low|medium|high",
    "source_url": "url",
    "claim_excerpt": "exact text from page"
  }
]
\`\`\`

End your analysis with: "This analysis highlights potential risk indicators only and does not determine compliance."`;

    console.log("Calling Perplexity for compliance snapshot analysis");

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

    if (ppxResponse.ok) {
      const ppxData = await ppxResponse.json();
      summaryMd = ppxData.choices?.[0]?.message?.content || "";
      citations = (ppxData.citations || []).map((url: string, i: number) => ({
        index: i + 1,
        url,
        snippet: "",
        retrieved_at: new Date().toISOString(),
      }));

      // Extract risk_flags_json from the response
      const jsonMatch = summaryMd.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch?.[1]) {
        try {
          riskFlags = JSON.parse(jsonMatch[1].trim());
        } catch (e) {
          console.error("Failed to parse risk flags JSON:", e);
        }
      }

      await auditLog(supabase, user.id, job.id, "analysis_completed", {
        citation_count: citations.length,
        risk_flag_count: riskFlags.length,
      });
    } else {
      const errText = await ppxResponse.text();
      console.error("Perplexity error:", errText);
      summaryMd = "Analysis unavailable — AI service error.";
    }

    // Prepend structured header
    const now = new Date().toISOString();
    const headerMd = `# Public Compliance Risk Snapshot

**Tenant:** ${tenant_name || "Unknown"}${rto_code ? `  \n**RTO Code:** ${rto_code}` : ""}  
**Generated:** ${new Date(now).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" })}  
**Standards Reference:** Standards for RTOs 2025  
**Pages Analysed:** ${scrapedContent.length}

---

`;

    const fullSummary = headerMd + summaryMd;

    // Store finding
    const { data: finding, error: findingError } = await supabase
      .from("research_findings")
      .insert({
        job_id: job.id,
        summary_md: fullSummary,
        citations_json: citations,
        risk_flags_json: riskFlags,
        review_status: "draft",
      })
      .select("id")
      .single();

    if (findingError) {
      console.error("Insert finding error:", findingError);
    }

    // Complete job
    await supabase.from("research_jobs").update({
      status: "completed",
      completed_at: now,
      output_json: {
        finding_id: finding?.id,
        pages_scraped: scrapedContent.length,
        citation_count: citations.length,
        risk_flag_count: riskFlags.length,
      },
    }).eq("id", job.id);

    return new Response(
      JSON.stringify({
        ok: true,
        job_id: job.id,
        finding_id: finding?.id,
        summary_md: fullSummary,
        citations,
        risk_flags: riskFlags,
      }),
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
