/**
 * regulator-watch-check: Scheduled scan of regulator watchlist URLs.
 *
 * For each active entry due for check:
 * 1. Scrapes via Firecrawl
 * 2. Compares content_hash
 * 3. If changed → creates research_job, regulator_change_event, runs Perplexity analysis
 * 4. Updates last_checked_at and last_content_hash
 *
 * Auth: Service-level (cron) or SuperAdmin manual trigger
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

    // Auth check for manual triggers
    const authHeader = req.headers.get("Authorization");
    let actorUserId: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && user) {
        actorUserId = user.id;
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
      return new Response(
        JSON.stringify({ ok: false, code: "CONFIG_ERROR", detail: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch active entries due for check
    const { data: entries, error: fetchError } = await supabase
      .from("regulator_watchlist")
      .select("*")
      .eq("is_active", true);

    if (fetchError) {
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

    // Filter entries due for check
    const now = Date.now();
    const dueEntries = entries.filter((e: any) => {
      if (!e.last_checked_at) return true;
      const freqDays = e.check_frequency_days || 7;
      const lastChecked = new Date(e.last_checked_at).getTime();
      return lastChecked + freqDays * 86400000 <= now;
    });

    if (dueEntries.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No entries due for check", checked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      name: string; url: string; changed: boolean;
      error?: string; job_id?: string; impact_level?: string;
    }> = [];

    for (const entry of dueEntries) {
      try {
        console.log(`Checking: ${entry.name} (${entry.url})`);

        // Scrape via Firecrawl
        const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: entry.url, formats: ["markdown"], onlyMainContent: true }),
        });

        if (fcResponse.status === 429 || fcResponse.status === 402) {
          results.push({ name: entry.name, url: entry.url, changed: false, error: `Firecrawl ${fcResponse.status}` });
          continue;
        }

        const fcData = await fcResponse.json();
        if (!fcResponse.ok) {
          results.push({ name: entry.name, url: entry.url, changed: false, error: "Scrape failed" });
          continue;
        }

        const markdown = fcData.data?.markdown || fcData.markdown || "";
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(markdown));
        const contentHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, "0")).join("");

        const hasChanged = entry.last_content_hash !== null && contentHash !== entry.last_content_hash;

        // Update watchlist entry
        await supabase
          .from("regulator_watchlist")
          .update({ last_checked_at: new Date().toISOString(), last_content_hash: contentHash })
          .eq("id", entry.id);

        // Audit log: scrape executed
        await supabase.from("research_audit_log").insert({
          actor_user_id: actorUserId || entry.created_by,
          action: "scrape_executed",
          entity_type: "regulator_watchlist",
          entity_id: entry.id,
          metadata_json: { url: entry.url, hash: contentHash, changed: hasChanged },
        });

        if (!hasChanged) {
          results.push({ name: entry.name, url: entry.url, changed: false });
          continue;
        }

        console.log(`Change detected: ${entry.name}`);

        // Create research job
        const { data: job, error: jobError } = await supabase
          .from("research_jobs")
          .insert({
            job_type: "regulator_watch",
            status: "running",
            created_by: actorUserId || entry.created_by,
            standards_version: "Standards for RTOs 2025",
            input_json: { watchlist_entry_id: entry.id, url: entry.url, name: entry.name, category: entry.category },
          })
          .select("id")
          .single();

        if (jobError || !job) {
          results.push({ name: entry.name, url: entry.url, changed: true, error: "Job creation failed" });
          continue;
        }

        // Store source
        await supabase.from("research_sources").insert({
          job_id: job.id, url: entry.url, title: entry.name,
          content_hash: contentHash, raw_markdown: markdown, retrieved_at: new Date().toISOString(),
        });

        // Audit: change detected
        await supabase.from("research_audit_log").insert({
          actor_user_id: actorUserId || entry.created_by,
          action: "change_detected",
          entity_type: "research_job",
          entity_id: job.id,
          metadata_json: { watchlist_id: entry.id, previous_hash: entry.last_content_hash, new_hash: contentHash },
        });

        // Perplexity analysis
        let impactLevel = "moderate";
        let changeSummaryMd = "";
        let affectedAreas: any[] = [];
        let citations: any[] = [];

        if (perplexityKey) {
          try {
            const ppxResponse = await fetch("https://api.perplexity.ai/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${perplexityKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "sonar-pro",
                messages: [
                  {
                    role: "system",
                    content: `You monitor Australian VET regulator websites for changes relevant to the Standards for RTOs 2025. Analyse the updated content and produce a structured response.

Your response MUST include:
1. A markdown summary of what changed
2. Impact classification: low (wording only), moderate (clarification), high (operational change), critical (compliance requirement shift)
3. Affected areas mapped to Standards for RTOs 2025 clauses
4. A JSON block with affected_areas

Format your response as:
## Change Summary
[markdown summary]

## Impact Level
[low|moderate|high|critical]

## Affected Areas
[list mapping to 2025 Standard clauses]

\`\`\`json
{"impact_level":"...", "affected_areas":[{"area":"...","standard_clause":"Clause X.X","impact_type":"..."}]}
\`\`\`

End with: "This summary identifies potential operational impacts only. Human review required."`,
                  },
                  {
                    role: "user",
                    content: `The page "${entry.name}" (category: ${entry.category || "guidance"}) at ${entry.url} has been updated. Content:\n\n${markdown.slice(0, 10000)}`,
                  },
                ],
                temperature: 0.2,
              }),
            });

            if (ppxResponse.ok) {
              const ppxData = await ppxResponse.json();
              changeSummaryMd = ppxData.choices?.[0]?.message?.content || "";
              citations = (ppxData.citations || []).map((url: string, i: number) => ({
                index: i + 1, url, retrieved_at: new Date().toISOString(),
              }));

              // Extract impact level and affected areas from response
              const jsonMatch = changeSummaryMd.match(/```json\s*([\s\S]*?)\s*```/);
              if (jsonMatch) {
                try {
                  const parsed = JSON.parse(jsonMatch[1]);
                  impactLevel = parsed.impact_level || "moderate";
                  affectedAreas = parsed.affected_areas || [];
                } catch { /* keep defaults */ }
              }

              // Store finding
              await supabase.from("research_findings").insert({
                job_id: job.id,
                summary_md: changeSummaryMd,
                citations_json: citations,
                risk_flags_json: affectedAreas.map((a: any) => ({
                  risk_category: a.area || "Regulator Change",
                  standard_clause: a.standard_clause || "Unknown",
                  severity: impactLevel,
                  source_url: entry.url,
                  claim_excerpt: a.impact_type || "",
                })),
                review_status: "draft",
              });

              await supabase.from("research_audit_log").insert({
                actor_user_id: actorUserId || entry.created_by,
                action: "analysis_completed",
                entity_type: "research_job",
                entity_id: job.id,
                metadata_json: { impact_level: impactLevel },
              });
            }
          } catch (ppxErr) {
            console.error("Perplexity error:", ppxErr);
          }
        }

        // Complete job
        await supabase
          .from("research_jobs")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", job.id);

        // Create change event
        await supabase.from("regulator_change_events").insert({
          watchlist_id: entry.id,
          research_job_id: job.id,
          previous_hash: entry.last_content_hash,
          new_hash: contentHash,
          impact_level: impactLevel,
          review_status: "pending",
          change_summary_md: changeSummaryMd,
          affected_areas_json: affectedAreas,
        });

        results.push({ name: entry.name, url: entry.url, changed: true, job_id: job.id, impact_level: impactLevel });
      } catch (entryErr) {
        console.error(`Error checking ${entry.name}:`, entryErr);
        results.push({ name: entry.name, url: entry.url, changed: false, error: String(entryErr) });
      }
    }

    const changedCount = results.filter(r => r.changed).length;
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
