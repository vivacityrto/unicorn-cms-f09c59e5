import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all active tenants
    const { data: tenants, error: tErr } = await supabase
      .from("tenants")
      .select("id")
      .eq("status", "active");
    if (tErr) throw tErr;

    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
    const d60 = new Date(now.getTime() - 60 * 86400000).toISOString();

    const results: any[] = [];

    for (const tenant of tenants || []) {
      const tid = tenant.id;

      // ── 1) Risk Velocity Score ──
      const { data: recentRisks } = await supabase
        .from("risk_events")
        .select("severity, created_at")
        .eq("tenant_id", tid)
        .gte("created_at", d60);

      const severityWeight: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
      let currentWeighted = 0, priorWeighted = 0;
      (recentRisks || []).forEach((r: any) => {
        const w = severityWeight[r.severity] || 1;
        if (r.created_at >= d30) currentWeighted += w;
        else priorWeighted += w;
      });
      const velocityRaw = priorWeighted > 0
        ? ((currentWeighted - priorWeighted) / priorWeighted) * 100
        : currentWeighted > 0 ? 100 : 0;
      const riskVelocityScore = Math.min(100, Math.max(0, velocityRaw));

      // ── 2) Risk Concentration Score ──
      const { data: clauseRisks } = await supabase
        .from("risk_events")
        .select("standard_clause")
        .eq("tenant_id", tid)
        .not("standard_clause", "is", null);

      const clauseCounts: Record<string, number> = {};
      (clauseRisks || []).forEach((r: any) => {
        clauseCounts[r.standard_clause] = (clauseCounts[r.standard_clause] || 0) + 1;
      });
      const totalClauseRisks = Object.values(clauseCounts).reduce((a, b) => a + b, 0);
      const maxClauseFreq = Math.max(0, ...Object.values(clauseCounts));
      const concentrationRaw = totalClauseRisks > 0
        ? (maxClauseFreq / totalClauseRisks) * 100
        : 0;
      const riskConcentrationScore = Math.min(100, concentrationRaw);

      // ── 3) Stagnation Score ──
      const { data: lastTaskUpdate } = await supabase
        .from("tasks")
        .select("updated_at")
        .eq("tenant_id", tid)
        .order("updated_at", { ascending: false })
        .limit(1);

      const { data: lastConsult } = await supabase
        .from("consult_logs")
        .select("created_at")
        .eq("tenant_id", tid)
        .order("created_at", { ascending: false })
        .limit(1);

      const daysSinceTask = lastTaskUpdate?.[0]
        ? Math.floor((now.getTime() - new Date(lastTaskUpdate[0].updated_at).getTime()) / 86400000)
        : 90;
      const daysSinceConsult = lastConsult?.[0]
        ? Math.floor((now.getTime() - new Date(lastConsult[0].created_at).getTime()) / 86400000)
        : 90;

      const avgInactivity = (daysSinceTask + daysSinceConsult) / 2;
      const stagnationScore = Math.min(100, (avgInactivity / 60) * 100);

      // ── 4) Evidence Instability Score ──
      // Check for repeated mandatory gaps in last 60 days
      const { data: gapChecks } = await supabase
        .from("evidence_gap_checks")
        .select("gap_details_json, created_at")
        .eq("tenant_id", tid)
        .gte("created_at", d60)
        .order("created_at", { ascending: false })
        .limit(10);

      const gapCategories: Record<string, number> = {};
      (gapChecks || []).forEach((gc: any) => {
        const gaps = gc.gap_details_json || [];
        if (Array.isArray(gaps)) {
          gaps.forEach((g: any) => {
            if (g.category) gapCategories[g.category] = (gapCategories[g.category] || 0) + 1;
          });
        }
      });
      const recurringGaps = Object.values(gapCategories).filter(c => c >= 2).length;
      const evidenceInstabilityScore = Math.min(100, recurringGaps * 25);

      // ── 5) Regulator Exposure Score ──
      const { data: regUpdates } = await supabase
        .from("regulator_change_events")
        .select("affected_clauses_json")
        .gte("detected_at", d60);

      const regClauses = new Set<string>();
      (regUpdates || []).forEach((ru: any) => {
        const clauses = ru.affected_clauses_json || [];
        if (Array.isArray(clauses)) clauses.forEach((c: string) => regClauses.add(c));
      });

      const tenantRiskClauses = new Set(Object.keys(clauseCounts));
      let overlapCount = 0;
      regClauses.forEach(c => { if (tenantRiskClauses.has(c)) overlapCount++; });
      const regulatorExposureScore = Math.min(100, overlapCount * 20);

      // ── 6) Composite Risk Index ──
      const compositeRiskIndex = Math.round(
        riskVelocityScore * 0.25 +
        riskConcentrationScore * 0.20 +
        stagnationScore * 0.20 +
        evidenceInstabilityScore * 0.20 +
        regulatorExposureScore * 0.15
      );

      // ── 7) Status ──
      let forecastRiskStatus = "stable";
      if (compositeRiskIndex > 70) forecastRiskStatus = "high";
      else if (compositeRiskIndex > 50) forecastRiskStatus = "elevated";
      else if (compositeRiskIndex > 30) forecastRiskStatus = "emerging";

      // Key risk drivers
      const drivers: string[] = [];
      if (riskVelocityScore > 50) drivers.push("Increasing risk velocity");
      if (riskConcentrationScore > 60) drivers.push(`Risk concentrated on ${Object.entries(clauseCounts).sort(([,a],[,b]) => b - a)[0]?.[0] || "unknown clause"}`);
      if (stagnationScore > 50) drivers.push(`No activity for ${Math.round(avgInactivity)} days`);
      if (evidenceInstabilityScore > 40) drivers.push(`${recurringGaps} recurring evidence gap categories`);
      if (regulatorExposureScore > 30) drivers.push(`${overlapCount} regulator update overlaps`);

      // Insert forecast
      const { error: insertErr } = await supabase
        .from("tenant_risk_forecasts")
        .insert({
          tenant_id: tid,
          forecast_date: today,
          risk_velocity_score: riskVelocityScore,
          risk_concentration_score: riskConcentrationScore,
          stagnation_score: stagnationScore,
          evidence_instability_score: evidenceInstabilityScore,
          regulator_exposure_score: regulatorExposureScore,
          composite_risk_index: compositeRiskIndex,
          forecast_risk_status: forecastRiskStatus,
          key_risk_drivers_json: drivers,
        });

      if (!insertErr) {
        // Insert history record
        await supabase.from("risk_forecast_history").insert({
          tenant_id: tid,
          snapshot_date: today,
          composite_risk_index: compositeRiskIndex,
        });
      }

      results.push({ tenant_id: tid, composite_risk_index: compositeRiskIndex, status: forecastRiskStatus });
    }

    // Refresh materialized view
    await supabase.rpc("refresh_materialized_view", { view_name: "v_risk_forecast_trends" }).catch(() => {
      // If RPC doesn't exist, skip — view will be stale until manual refresh
    });

    return new Response(JSON.stringify({ success: true, forecasts: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("run-tenant-risk-forecast error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
