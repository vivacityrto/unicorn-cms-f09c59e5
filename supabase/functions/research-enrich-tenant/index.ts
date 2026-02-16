/**
 * research-enrich-tenant: Scrapes tenant's public web presence and summarises via Perplexity.
 * 
 * Input: { tenant_id: number, website?: string, abn?: string, rto_code?: string }
 * Auth: SuperAdmin only
 */
import { corsHeaders } from "../_shared/cors.ts";
import { extractToken, verifyAuth, checkSuperAdmin } from "../_shared/auth-helpers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WHITELISTED_PATHS = ["/", "/about", "/courses", "/contact", "/programs", "/training"];

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

    if (!checkSuperAdmin(profile)) {
      return new Response(
        JSON.stringify({ ok: false, code: "FORBIDDEN", detail: "Super Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { tenant_id, website, abn, rto_code } = await req.json();

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", detail: "tenant_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!website && !rto_code) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", detail: "At least website or rto_code required" }),
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
        job_type: "tenant_onboarding",
        status: "running",
        created_by: user.id,
        input_json: { website, abn, rto_code },
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

    // Build URLs to scrape
    const urls: string[] = [];
    if (website) {
      let base = website.trim();
      if (!base.startsWith("http")) base = `https://${base}`;
      // Remove trailing slash
      base = base.replace(/\/+$/, "");
      for (const path of WHITELISTED_PATHS) {
        urls.push(`${base}${path}`);
      }
    }

    // Scrape URLs
    const scrapedContent: string[] = [];

    for (const url of urls.slice(0, 6)) {
      try {
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
            // Store source
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
          const errText = await fcResponse.text();
          console.error(`Scrape failed for ${url}:`, errText);
        }
      } catch (scrapeErr) {
        console.error(`Error scraping ${url}:`, scrapeErr);
      }
    }

    // Summarise via Perplexity
    const contextText = scrapedContent.join("\n\n---\n\n");
    const question = `Based on the following scraped content from an Australian RTO's website${rto_code ? ` (RTO Code: ${rto_code})` : ""}${abn ? ` (ABN: ${abn})` : ""}, provide a structured summary covering:

1. **Delivery Locations** — where they deliver training
2. **Course Offerings** — qualifications and courses listed
3. **Staffing Claims** — any staff or team information
4. **Public Compliance Statements** — any compliance or quality claims
5. **Key Contacts** — names, roles, contact details found

Be factual. Only report what is found on the pages. Flag anything that appears inconsistent or potentially outdated.`;

    const ppxResponse = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: `You are analysing an Australian RTO's public web presence. Ground your response only in the provided content. This is a compliance context — accuracy matters.\n\n${contextText}`,
          },
          { role: "user", content: question },
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
      summaryMd = "Enrichment summary unavailable — Perplexity API error.";
    }

    // Store finding
    await supabase.from("research_findings").insert({
      job_id: job.id,
      summary_md: summaryMd,
      citations_json: citations,
      review_status: "draft",
    });

    // Complete job
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
    console.error("research-enrich-tenant error:", err);
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL_ERROR", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
