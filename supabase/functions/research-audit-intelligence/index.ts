/**
 * research-audit-intelligence: Phase 5 – Audit Intelligence Pack Generator
 *
 * Generates a structured context brief for audit preparation using Perplexity.
 * Maps findings to Standards for RTOs 2025. Never makes compliance determinations.
 *
 * Input: { tenant_id, audit_type, delivery_mode?, cricos_flag?, known_risks?, special_notes?, tenant_name? }
 * Auth: Vivacity Team only
 */
import { corsHeaders } from "../_shared/cors.ts";
import { extractToken, verifyAuth, checkVivacityTeam } from "../_shared/auth-helpers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function auditLog(supabase: any, userId: string, jobId: string, action: string, details?: any) {
  await supabase.from("research_audit_log").insert({
    user_id: userId,
    job_id: jobId,
    action,
    details: details || null,
  });
}

const AUDIT_TYPE_LABELS: Record<string, string> = {
  initial_registration: "Initial Registration",
  re_registration: "Re-registration",
  extension_to_scope: "Extension to Scope",
  strategic_review: "Strategic Compliance Review",
  post_audit_response: "Post-Audit Rectification",
};

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

    const { tenant_id, audit_type, delivery_mode, cricos_flag, known_risks, special_notes, tenant_name } = await req.json();

    if (!tenant_id || !audit_type) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", detail: "tenant_id and audit_type required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!perplexityKey) {
      return new Response(
        JSON.stringify({ ok: false, code: "CONFIG_ERROR", detail: "Perplexity API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Create research job
    const inputJson = { audit_type, delivery_mode, cricos_flag, known_risks, special_notes, tenant_name };
    const { data: job, error: jobError } = await supabase
      .from("research_jobs")
      .insert({
        tenant_id,
        job_type: "audit_intelligence_pack",
        status: "queued",
        created_by: user.id,
        standards_version: "Standards for RTOs 2025",
        input_json: inputJson,
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

    await auditLog(supabase, user.id, job.id, "pack_generated", { tenant_id, audit_type });
    await supabase.from("research_jobs").update({ status: "running" }).eq("id", job.id);

    // Step 2: Perplexity Analysis
    const auditLabel = AUDIT_TYPE_LABELS[audit_type] || audit_type;
    const cricosContext = cricos_flag ? "\n- This is a CRICOS provider delivering to international students." : "";
    const deliveryContext = delivery_mode ? `\n- Primary delivery mode: ${delivery_mode}` : "";
    const riskContext = known_risks ? `\n- Known risk themes to investigate: ${known_risks}` : "";
    const notesContext = special_notes ? `\n- Special notes: ${special_notes}` : "";

    const systemPrompt = `You are an expert compliance intelligence analyst for Australian Registered Training Organisations (RTOs). You provide structured audit preparation intelligence mapped exclusively to the Standards for Registered Training Organisations (RTOs) 2025.

CRITICAL RULES:
- This pack provides contextual preparation guidance only and does not predict audit outcomes.
- Never state compliance or non-compliance status.
- Every theme must include source references.
- Map all findings to specific clauses from the Standards for RTOs 2025.
- Do not reference Standards for RTOs 2015.
- Use language like "risk indicator", "requires confirmation", "check evidence".`;

    const userPrompt = `Generate an Audit Intelligence Pack for an RTO preparing for: ${auditLabel}

Context:${deliveryContext}${cricosContext}${riskContext}${notesContext}

Produce the following structured sections:

## A) Executive Brief
A short, high-signal context summary of the current regulatory landscape relevant to this audit type. Focus on what ASQA is currently prioritising.

## B) Focus Areas
Identify 5-8 key focus themes. For each:
- **Focus Theme**: Name of the area
- **Why It Is Receiving Attention**: Current regulator focus reasoning
- **Relevant 2025 Standard Clause**: Specific clause reference
- **Evidence Areas to Scrutinise**: What evidence to prepare

## C) Sector Risk Trends
Identify 3-5 sector-wide risk trends. For each:
- theme
- affected_provider_types (e.g., online RTOs, CRICOS providers)
- operational_risk_area

## D) Preparation Checklist
Provide 8-12 checklist items mapped to Standards for RTOs 2025 clauses. Each item should be actionable.

## E) Citations
Include source references for each theme.

Also provide structured JSON blocks:

\`\`\`json:focus_areas
[
  {
    "theme": "...",
    "attention_reason": "...",
    "standard_clause": "Clause X.X",
    "evidence_areas": ["..."]
  }
]
\`\`\`

\`\`\`json:risk_trends
[
  {
    "theme": "...",
    "affected_provider_types": ["..."],
    "operational_risk_area": "..."
  }
]
\`\`\`

\`\`\`json:checklist
[
  {
    "item": "...",
    "standard_clause": "Clause X.X",
    "priority": "high|medium|low"
  }
]
\`\`\`

End with: "This pack provides contextual preparation guidance only and does not predict audit outcomes."`;

    console.log("Calling Perplexity for audit intelligence analysis");

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
    let focusAreas: any[] = [];
    let riskTrends: any[] = [];
    let checklist: any[] = [];
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

      // Extract structured JSON blocks
      const focusMatch = summaryMd.match(/```json:focus_areas\s*([\s\S]*?)```/);
      if (focusMatch?.[1]) {
        try { focusAreas = JSON.parse(focusMatch[1].trim()); } catch (e) { console.error("Parse focus_areas:", e); }
      }

      const trendsMatch = summaryMd.match(/```json:risk_trends\s*([\s\S]*?)```/);
      if (trendsMatch?.[1]) {
        try { riskTrends = JSON.parse(trendsMatch[1].trim()); } catch (e) { console.error("Parse risk_trends:", e); }
      }

      const checklistMatch = summaryMd.match(/```json:checklist\s*([\s\S]*?)```/);
      if (checklistMatch?.[1]) {
        try { checklist = JSON.parse(checklistMatch[1].trim()); } catch (e) { console.error("Parse checklist:", e); }
      }

      // Also try generic json block for risk flags
      const genericMatch = summaryMd.match(/```json\s*([\s\S]*?)```/);
      if (genericMatch?.[1] && !focusMatch) {
        try { riskFlags = JSON.parse(genericMatch[1].trim()); } catch (_) { /* ignore */ }
      }

      // Build risk_flags from focus areas for research_findings compatibility
      riskFlags = focusAreas.map(fa => ({
        risk_category: fa.theme,
        standard_clause: fa.standard_clause,
        severity: "medium",
        source_url: "",
        claim_excerpt: fa.attention_reason,
      }));

      await auditLog(supabase, user.id, job.id, "analysis_completed", {
        citation_count: citations.length,
        focus_area_count: focusAreas.length,
        checklist_count: checklist.length,
      });
    } else {
      const errText = await ppxResponse.text();
      console.error("Perplexity error:", errText);
      summaryMd = "Analysis unavailable — AI service error.";
    }

    // Build header
    const now = new Date().toISOString();
    const headerMd = `# Audit Intelligence Pack

**Tenant:** ${tenant_name || "Unknown"}  
**Audit Type:** ${auditLabel}  
**Generated:** ${new Date(now).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" })}  
**Standards Reference:** Standards for RTOs 2025${delivery_mode ? `  \n**Delivery Mode:** ${delivery_mode}` : ""}${cricos_flag ? `  \n**CRICOS Provider:** Yes` : ""}

---

`;

    const fullSummary = headerMd + summaryMd;

    // Store finding
    const { data: finding } = await supabase
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

    // Create audit_intelligence_packs record
    const { data: pack } = await supabase
      .from("audit_intelligence_packs")
      .insert({
        tenant_id,
        research_job_id: job.id,
        audit_type,
        delivery_mode: delivery_mode || null,
        cricos_flag: cricos_flag || false,
        generated_by_user_id: user.id,
        summary_markdown: fullSummary,
        focus_areas_json: focusAreas,
        risk_trends_json: riskTrends,
        preparation_checklist_json: checklist,
        status: "draft",
      })
      .select("id")
      .single();

    // Complete job
    await supabase.from("research_jobs").update({
      status: "completed",
      completed_at: now,
      output_json: {
        finding_id: finding?.id,
        pack_id: pack?.id,
        citation_count: citations.length,
        focus_area_count: focusAreas.length,
        checklist_count: checklist.length,
      },
    }).eq("id", job.id);

    return new Response(
      JSON.stringify({
        ok: true,
        job_id: job.id,
        pack_id: pack?.id,
        finding_id: finding?.id,
        summary_md: fullSummary,
        focus_areas: focusAreas,
        risk_trends: riskTrends,
        checklist,
        citations,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("research-audit-intelligence error:", err);
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL_ERROR", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
