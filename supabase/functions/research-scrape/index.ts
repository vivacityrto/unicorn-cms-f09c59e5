/**
 * research-scrape: Calls Firecrawl to scrape URLs, stores results in research_sources.
 * 
 * Input: { job_id: string, urls: string[] }
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

    const { job_id, urls } = await req.json();

    if (!job_id || !Array.isArray(urls) || urls.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", detail: "job_id and urls[] required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cap at 10 URLs per request
    if (urls.length > 10) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", detail: "Maximum 10 URLs per request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      console.error("FIRECRAWL_API_KEY not configured");
      return new Response(
        JSON.stringify({ ok: false, code: "CONFIG_ERROR", detail: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update job status to running
    await supabase
      .from("research_jobs")
      .update({ status: "running" })
      .eq("id", job_id);

    const results: Array<{ url: string; success: boolean; source_id?: string; error?: string }> = [];

    for (const rawUrl of urls) {
      let formattedUrl = rawUrl.trim();
      if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
        formattedUrl = `https://${formattedUrl}`;
      }

      try {
        console.log(`Scraping: ${formattedUrl}`);

        const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: formattedUrl,
            formats: ["markdown"],
            onlyMainContent: true,
          }),
        });

        if (fcResponse.status === 429 || fcResponse.status === 402) {
          const errBody = await fcResponse.text();
          console.error(`Firecrawl rate/billing error (${fcResponse.status}):`, errBody);
          results.push({ url: formattedUrl, success: false, error: `Firecrawl ${fcResponse.status}` });
          continue;
        }

        const fcData = await fcResponse.json();

        if (!fcResponse.ok) {
          console.error("Firecrawl error:", fcData);
          results.push({ url: formattedUrl, success: false, error: fcData.error || "Scrape failed" });
          continue;
        }

        const markdown = fcData.data?.markdown || fcData.markdown || "";
        const title = fcData.data?.metadata?.title || fcData.metadata?.title || null;

        // Simple content hash
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(markdown));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const contentHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        const { data: source, error: insertError } = await supabase
          .from("research_sources")
          .insert({
            job_id,
            url: formattedUrl,
            title,
            content_hash: contentHash,
            raw_markdown: markdown,
            retrieved_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("Insert source error:", insertError);
          results.push({ url: formattedUrl, success: false, error: "DB insert failed" });
        } else {
          results.push({ url: formattedUrl, success: true, source_id: source.id });
        }
      } catch (urlError) {
        console.error(`Error scraping ${formattedUrl}:`, urlError);
        results.push({ url: formattedUrl, success: false, error: String(urlError) });
      }
    }

    // Update job status
    const allSucceeded = results.every(r => r.success);
    const anySucceeded = results.some(r => r.success);
    const finalStatus = allSucceeded ? "completed" : anySucceeded ? "completed" : "failed";

    await supabase
      .from("research_jobs")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        output_json: { scrape_results: results },
      })
      .eq("id", job_id);

    return new Response(
      JSON.stringify({ ok: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("research-scrape error:", err);
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL_ERROR", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
