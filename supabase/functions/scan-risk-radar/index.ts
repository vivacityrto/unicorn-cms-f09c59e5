import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Risk Radar v1 - Scan for compliance risks
 * 
 * Rules-first detection:
 *   - missing_required_doc: Required doc types not present
 *   - hours_over_80pct: Consultation hours > 80% consumed
 *   - stale_activity_30d: No activity in 30+ days
 *   - delivery_mode_unknown: Delivery mode not set
 * 
 * Then calls ai-orchestrator (risk_explain_v1) for explanation text.
 * Never claims compliance failure — only "risk to review".
 * Upserts results into risk_items table.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DetectedRisk {
  risk_code: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  detected_by: "rule";
  data: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    const { tenant_id, package_id, phase_id, framework } = body;

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const detectedRisks: DetectedRisk[] = [];

    // ---- Rule 1: missing_required_doc ----
    if (phase_id && framework) {
      const { data: requirements } = await supabase
        .from("phase_requirements")
        .select("required_doc_types")
        .eq("framework", framework)
        .or(`tenant_id.is.null,tenant_id.eq.${tenant_id}`);

      if (requirements && requirements.length > 0) {
        const allRequired = new Set<string>();
        for (const r of requirements) {
          for (const dt of r.required_doc_types || []) allRequired.add(dt);
        }

        const { data: existingDocs } = await supabase
          .from("doc_files")
          .select("doc_type")
          .eq("tenant_id", tenant_id)
          .eq("phase_id", phase_id);

        const existingTypes = new Set((existingDocs || []).map((d: any) => d.doc_type));
        const missing = [...allRequired].filter(t => !existingTypes.has(t));

        if (missing.length > 0) {
          detectedRisks.push({
            risk_code: "missing_required_doc",
            title: "Missing required documents",
            description: `${missing.length} required document type(s) not found: ${missing.join(", ")}. This is a risk to review.`,
            severity: missing.length >= 3 ? "high" : "medium",
            detected_by: "rule",
            data: { missing_types: missing },
          });
        }
      }
    }

    // ---- Rule 2: hours_over_80pct ----
    if (package_id) {
      const { data: pkgInstance } = await supabase
        .from("package_instances")
        .select("consult_hours_total, consult_hours_used")
        .eq("id", package_id)
        .single();

      if (pkgInstance && pkgInstance.consult_hours_total > 0) {
        const used = pkgInstance.consult_hours_used || 0;
        const total = pkgInstance.consult_hours_total;
        const pct = (used / total) * 100;

        if (pct >= 80) {
          detectedRisks.push({
            risk_code: "hours_over_80pct",
            title: "Consultation hours nearing limit",
            description: `${Math.round(pct)}% of consultation hours consumed (${used}/${total}h). Review usage or request additional hours.`,
            severity: pct >= 95 ? "high" : "medium",
            detected_by: "rule",
            data: { used, total, pct: Math.round(pct) },
          });
        }
      }
    }

    // ---- Rule 3: stale_activity_30d ----
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let hasRecentActivity = false;

    try {
      const { count } = await supabase
        .from("consult_logs")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenant_id)
        .gte("created_at", thirtyDaysAgo);
      hasRecentActivity = (count || 0) > 0;
    } catch { /* table may not exist */ }

    if (!hasRecentActivity) {
      const { count: auditCount } = await supabase
        .from("audit_events")
        .select("*", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo)
        .limit(1);
      hasRecentActivity = (auditCount || 0) > 0;
    }

    if (!hasRecentActivity) {
      detectedRisks.push({
        risk_code: "stale_activity_30d",
        title: "No recent activity detected",
        description: "No recorded activity in the last 30 days. This phase may stall if left unattended.",
        severity: "medium",
        detected_by: "rule",
        data: { days_inactive: 30 },
      });
    }

    // ---- Rule 4: delivery_mode_unknown ----
    if (package_id) {
      let deliveryModeSet = false;
      try {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("delivery_mode")
          .eq("id", tenant_id)
          .single();
        deliveryModeSet = !!(tenant && (tenant as any).delivery_mode);
      } catch { /* graceful fallback */ }

      if (!deliveryModeSet) {
        detectedRisks.push({
          risk_code: "delivery_mode_unknown",
          title: "Delivery mode not specified",
          description: "No delivery mode set for this engagement. Documents may not be properly tailored.",
          severity: "low",
          detected_by: "rule",
          data: {},
        });
      }
    }

    // ---- Upsert detected risks ----
    const upsertedRisks: any[] = [];

    for (const risk of detectedRisks) {
      const { data: existing } = await supabase
        .from("risk_items")
        .select("risk_item_id")
        .eq("tenant_id", tenant_id)
        .eq("risk_code", risk.risk_code)
        .eq("status", "open")
        .maybeSingle();

      if (existing) {
        const { data: updated } = await supabase
          .from("risk_items")
          .update({ title: risk.title, description: risk.description, severity: risk.severity })
          .eq("risk_item_id", existing.risk_item_id)
          .select()
          .single();
        if (updated) upsertedRisks.push(updated);
      } else {
        const { data: inserted } = await supabase
          .from("risk_items")
          .insert({
            tenant_id,
            package_id: package_id || null,
            phase_id: phase_id || null,
            risk_code: risk.risk_code,
            title: risk.title,
            description: risk.description,
            severity: risk.severity,
            status: "open",
            detected_by: risk.detected_by,
          })
          .select()
          .single();
        if (inserted) upsertedRisks.push(inserted);
      }
    }

    // ---- AI explanations (non-blocking) ----
    for (const risk of upsertedRisks) {
      try {
        const orchestratorUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-orchestrator`;
        const res = await fetch(orchestratorUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader },
          body: JSON.stringify({
            tenant_id,
            actor_user_id: user.id,
            task_type: "risk_explain_v1",
            feature: "risk_radar",
            input: {
              risk_id: risk.risk_item_id,
              risk_type: risk.risk_code,
              risk_data: { title: risk.title, description: risk.description, severity: risk.severity },
            },
          }),
        });

        if (res.ok) {
          const aiResult = await res.json();
          if (aiResult.output) {
            await supabase
              .from("risk_items")
              .update({
                explanation_text: aiResult.output.explanation || null,
                suggested_action: aiResult.output.suggested_actions?.[0] || null,
                ai_event_id: aiResult.ai_event_id || null,
              })
              .eq("risk_item_id", risk.risk_item_id);
          }
        }
      } catch (err) {
        console.error(`AI explanation failed for risk ${risk.risk_item_id}:`, err);
      }
    }

    // Return all risks for tenant
    const query = supabase
      .from("risk_items")
      .select("*")
      .eq("tenant_id", tenant_id)
      .order("created_at", { ascending: false });

    if (package_id) query.eq("package_id", package_id);

    const { data: allRisks } = await query;

    return new Response(
      JSON.stringify({ detected_count: detectedRisks.length, risks: allRisks || [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Risk radar error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
