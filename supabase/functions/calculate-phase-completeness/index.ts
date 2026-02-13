import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Phase Completeness Checker
 * 
 * Rules-first completeness check for a given package_id + phase_id.
 * 1. Loads phase_requirements config for the framework + phase_key.
 * 2. Checks required docs exist in doc_files.
 * 3. Checks required fields are set on tenant/package profile.
 * 4. Counts open risks for the phase.
 * 5. Computes completeness_percent and status label.
 * 6. Calls ai-orchestrator for explanation text.
 * 7. Returns structured result with audit trail.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CompletenessResult {
  completeness_percent: number;
  missing_docs: string[];
  missing_fields: string[];
  open_risks_count: number;
  status: "not_ready" | "nearly_ready" | "ready_for_review";
  explanation_text: string | null;
  ai_event_id: string | null;
  confidence: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { package_id, phase_id, phase_key, tenant_id, framework } = body;

    if (!package_id || !phase_id || !phase_key || !tenant_id || !framework) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: package_id, phase_id, phase_key, tenant_id, framework" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Step 1: Load phase requirements ----
    const { data: requirements } = await supabase
      .from("phase_requirements")
      .select("*")
      .eq("framework", framework)
      .eq("phase_key", phase_key)
      .or(`tenant_id.is.null,tenant_id.eq.${tenant_id}`);

    // Merge all requirement configs (global + tenant-specific)
    const allRequiredDocTypes = new Set<string>();
    const allRequiredFields: Record<string, string> = {};

    for (const req of requirements || []) {
      for (const docType of req.required_doc_types || []) {
        allRequiredDocTypes.add(docType);
      }
      const fields = req.required_fields as Record<string, string> || {};
      for (const [key, label] of Object.entries(fields)) {
        allRequiredFields[key] = label;
      }
    }

    // ---- Step 2: Check required docs exist ----
    const { data: existingDocs } = await supabase
      .from("doc_files")
      .select("doc_type")
      .eq("tenant_id", tenant_id)
      .eq("phase_id", phase_id);

    const existingDocTypes = new Set((existingDocs || []).map(d => d.doc_type));
    const missingDocs: string[] = [];
    for (const requiredType of allRequiredDocTypes) {
      if (!existingDocTypes.has(requiredType)) {
        missingDocs.push(requiredType);
      }
    }

    // ---- Step 3: Check required fields on tenant profile ----
    const missingFields: string[] = [];
    if (Object.keys(allRequiredFields).length > 0) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenant_id)
        .single();

      if (tenant) {
        const tenantRecord = tenant as Record<string, unknown>;
        for (const [fieldKey, fieldLabel] of Object.entries(allRequiredFields)) {
          const value = tenantRecord[fieldKey];
          if (value === null || value === undefined || value === "") {
            missingFields.push(fieldLabel || fieldKey);
          }
        }
      }
    }

    // ---- Step 4: Count open risks for the phase ----
    // Check compliance_risks table if it exists, fall back to 0
    let openRisksCount = 0;
    try {
      const { count } = await supabase
        .from("compliance_risks")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenant_id)
        .eq("phase_id", phase_id)
        .in("status", ["open", "active", "new"]);
      openRisksCount = count || 0;
    } catch {
      // Table may not exist yet — graceful fallback
      openRisksCount = 0;
    }

    // ---- Step 5: Compute completeness ----
    const totalChecks = allRequiredDocTypes.size + Object.keys(allRequiredFields).length;
    const passedChecks = totalChecks - missingDocs.length - missingFields.length;
    const completenessPercent = totalChecks > 0 
      ? Math.round((passedChecks / totalChecks) * 100) 
      : 100; // If no requirements configured, treat as complete

    let status: CompletenessResult["status"];
    if (completenessPercent >= 100 && openRisksCount === 0) {
      status = "ready_for_review";
    } else if (completenessPercent >= 70) {
      status = "nearly_ready";
    } else {
      status = "not_ready";
    }

    // ---- Step 6: Call orchestrator for AI explanation ----
    let explanationText: string | null = null;
    let aiEventId: string | null = null;
    let confidence: number | null = null;

    const ruleResult = {
      completeness_percent: completenessPercent,
      missing_docs: missingDocs,
      missing_fields: missingFields,
      open_risks_count: openRisksCount,
      status,
      total_checks: totalChecks,
      passed_checks: passedChecks,
    };

    try {
      const orchestratorUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-orchestrator`;
      const orchestratorResponse = await fetch(orchestratorUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          tenant_id,
          actor_user_id: user.id,
          task_type: "phase_completeness_check",
          feature: "phase_completeness",
          input: {
            package_id,
            phase_id,
          },
          context: {
            rule_result: ruleResult,
            phase_key,
            framework,
          },
        }),
      });

      if (orchestratorResponse.ok) {
        const orchestratorData = await orchestratorResponse.json();
        aiEventId = orchestratorData.ai_event_id || null;
        confidence = orchestratorData.confidence || null;
        // Phase 1: explanation comes from rules; future: LLM-generated
        if (orchestratorData.output?.missing_items?.length > 0) {
          explanationText = `Phase is ${status.replace(/_/g, " ")}. ${missingDocs.length} missing document type(s) and ${missingFields.length} missing field(s) found. ${openRisksCount} open risk(s).`;
        }
      }
    } catch (err) {
      console.error("Orchestrator call failed (non-blocking):", err);
    }

    // Fallback explanation if orchestrator didn't provide one
    if (!explanationText) {
      if (status === "ready_for_review") {
        explanationText = "All required documents and fields are present. No open risks. Phase is ready for review.";
      } else {
        const parts: string[] = [];
        if (missingDocs.length > 0) parts.push(`${missingDocs.length} required document type(s) missing`);
        if (missingFields.length > 0) parts.push(`${missingFields.length} required field(s) not set`);
        if (openRisksCount > 0) parts.push(`${openRisksCount} open risk(s)`);
        explanationText = parts.length > 0 ? parts.join(". ") + "." : "No requirements configured for this phase.";
      }
    }

    const result: CompletenessResult = {
      completeness_percent: completenessPercent,
      missing_docs: missingDocs,
      missing_fields: missingFields,
      open_risks_count: openRisksCount,
      status,
      explanation_text: explanationText,
      ai_event_id: aiEventId,
      confidence,
    };

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Phase completeness check error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
