/**
 * regulator-watch-check: Cron-triggered edge function that checks regulator watchlist URLs for changes.
 * 
 * For each active watchlist entry:
 * 1. Scrapes via Firecrawl
 * 2. Compares content_hash with last_content_hash
 * 3. If changed, creates a research_job and calls Perplexity to summarise changes
 * 4. Updates last_checked_at and last_content_hash
 * 
 * Auth: Service-level (cron) or SuperAdmin
 */
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Optional auth check for manual triggers (cron calls won't have auth)
    const authHeader = req.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      // If a token is provided, verify it's a SuperAdmin
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && user) {
        const { data: profile } = await supabase
          .from("users")
          .select("unicorn_role")
          .eq("user_uuid", user.id)
          .single();
        if (!profile || profile.unicorn_role !== "Super Admin") {
          return new Response(
            JSON.stringify({ ok: false, code: "FORBIDDEN", detail: "Super Admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");

    if (!firecrawlKey) {
      console.error("FIRECRAWL_API_KEY not configured");
      return new Response(
        JSON.stringify({ ok: false, code: "CONFIG_ERROR", detail: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch active watchlist entries
    const { data: entries, error: fetchError } = await supabase
      .from("regulator_watchlist")
      .select("*")
      .eq("is_active", true);

    if (fetchError) {
      console.error("Fetch watchlist error:", fetchError);
      return new Response(
        JSON.stringify({ ok: false, code: "DB_ERROR", detail: "Failed to fetch watchlist" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No active watchlist entries", checked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      name: string;
      url: string;
      changed: boolean;
      error?: string;
      job_id?: string;
    }> = [];

    for (const entry of entries) {
      try {
        console.log(`Checking: ${entry.name} (${entry.url})`);

        // Scrape via Firecrawl
        const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: entry.url,
            formats: ["markdown"],
            onlyMainContent: true,
          }),
        });

        if (fcResponse.status === 429 || fcResponse.status === 402) {
          const errBody = await fcResponse.text();
          console.error(`Firecrawl rate/billing error for ${entry.name}:`, errBody);
          results.push({ name: entry.name, url: entry.url, changed: false, error: `Firecrawl ${fcResponse.status}` });
          continue;
        }

        const fcData = await fcResponse.json();
        if (!fcResponse.ok) {
          console.error(`Firecrawl error for ${entry.name}:`, fcData);
          results.push({ name: entry.name, url: entry.url, changed: false, error: "Scrape failed" });
          continue;
        }

        const markdown = fcData.data?.markdown || fcData.markdown || "";

        // Compute hash
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(markdown));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const contentHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        const hasChanged = entry.last_content_hash !== null && contentHash !== entry.last_content_hash;

        // Update watchlist entry
        await supabase
          .from("regulator_watchlist")
          .update({
            last_checked_at: new Date().toISOString(),
            last_content_hash: contentHash,
          })
          .eq("id", entry.id);

        if (hasChanged) {
          console.log(`Change detected for: ${entry.name}`);

          // Create research job
          const { data: job, error: jobError } = await supabase
            .from("research_jobs")
            .insert({
              job_type: "regulator_watch",
              status: "running",
              created_by: entry.created_by,
              input_json: { watchlist_entry_id: entry.id, url: entry.url, name: entry.name },
            })
            .select("id")
            .single();

          if (jobError || !job) {
            console.error("Failed to create research job:", jobError);
            results.push({ name: entry.name, url: entry.url, changed: true, error: "Job creation failed" });
            continue;
          }

          // Store source
          await supabase.from("research_sources").insert({
            job_id: job.id,
            url: entry.url,
            title: entry.name,
            content_hash: contentHash,
            raw_markdown: markdown,
            retrieved_at: new Date().toISOString(),
          });

          // If Perplexity is available, summarise the changes
          if (perplexityKey) {
            try {
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
                      content: "You are monitoring Australian VET regulator websites for changes. Summarise what has changed on this page compared to what an RTO compliance team would have expected. Be specific about new requirements, deadlines, or policy changes.",
                    },
                    {
                      role: "user",
                      content: `The page "${entry.name}" at ${entry.url} has been updated. Here is the current content:\n\n${markdown.slice(0, 8000)}`,
                    },
                  ],
                  temperature: 0.2,
                }),
              });

              if (ppxResponse.ok) {
                const ppxData = await ppxResponse.json();
                const summary = ppxData.choices?.[0]?.message?.content || "";
                const citations = (ppxData.citations || []).map((url: string, i: number) => ({
                  index: i + 1,
                  url,
                  retrieved_at: new Date().toISOString(),
                }));

                await supabase.from("research_findings").insert({
                  job_id: job.id,
                  summary_md: summary,
                  citations_json: citations,
                  review_status: "draft",
                });

                await supabase
                  .from("research_jobs")
                  .update({ status: "completed", completed_at: new Date().toISOString() })
                  .eq("id", job.id);
              } else {
                const errText = await ppxResponse.text();
                console.error("Perplexity error:", errText);
                await supabase
                  .from("research_jobs")
                  .update({ status: "completed", completed_at: new Date().toISOString(), output_json: { perplexity_skipped: true } })
                  .eq("id", job.id);
              }
            } catch (ppxErr) {
              console.error("Perplexity call failed:", ppxErr);
              await supabase
                .from("research_jobs")
                .update({ status: "completed", completed_at: new Date().toISOString(), output_json: { perplexity_error: String(ppxErr) } })
                .eq("id", job.id);
            }
          } else {
            await supabase
              .from("research_jobs")
              .update({ status: "completed", completed_at: new Date().toISOString(), output_json: { perplexity_unavailable: true } })
              .eq("id", job.id);
          }

          results.push({ name: entry.name, url: entry.url, changed: true, job_id: job.id });
        } else {
          results.push({ name: entry.name, url: entry.url, changed: false });
        }
      } catch (entryErr) {
        console.error(`Error checking ${entry.name}:`, entryErr);
        results.push({ name: entry.name, url: entry.url, changed: false, error: String(entryErr) });
      }
    }

    const changedCount = results.filter(r => r.changed).length;
    console.log(`Regulator watch complete. Checked: ${results.length}, Changed: ${changedCount}`);

    return new Response(
      JSON.stringify({ ok: true, checked: results.length, changed: changedCount, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("regulator-watch-check error:", err);
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL_ERROR", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
