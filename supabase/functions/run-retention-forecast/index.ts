/**
 * run-retention-forecast – Unicorn 2.0 Phase 15
 *
 * Nightly engine that calculates Composite Retention Risk Index per tenant.
 * Scores: Engagement, Value Utilisation, Service Pressure, Risk-Stress Overlap.
 * Does NOT determine compliance or auto-renew packages.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get active tenants
    const { data: tenants, error: tErr } = await sb
      .from("tenants")
      .select("id")
      .eq("status", "active");
    if (tErr) throw tErr;
    if (!tenants?.length) {
      return new Response(JSON.stringify({ message: "No active tenants" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const d60 = new Date(Date.now() - 60 * 86400000).toISOString();
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString();

    const results: any[] = [];

    for (const tenant of tenants) {
      const tid = tenant.id;
      const drivers: string[] = [];

      // ─── 1) Engagement Score ───
      // consult hours last 60 days
      const { data: consults } = await sb
        .from("consult_logs")
        .select("duration_minutes")
        .eq("tenant_id", tid)
        .gte("created_at", d60);
      const totalConsultMins = (consults ?? []).reduce(
        (s: number, c: any) => s + (Number(c.duration_minutes) || 0),
        0
      );

      // tasks closed last 60 days
      const { count: tasksClosed } = await sb
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .eq("status", "completed")
        .gte("updated_at", d60);

      // copilot sessions last 60 days
      const { count: copilotSessions } = await sb
        .from("copilot_sessions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .gte("started_at", d60);

      // Engagement: higher is better (invert for risk)
      const engagementRaw =
        Math.min(totalConsultMins / 120, 1) * 30 +
        Math.min((tasksClosed ?? 0) / 20, 1) * 40 +
        Math.min((copilotSessions ?? 0) / 5, 1) * 30;
      // Invert: low engagement = high risk
      const engagementScore = clamp(100 - engagementRaw);
      if (engagementScore > 60) drivers.push("Low engagement activity");

      // ─── 2) Value Utilisation Score ───
      const { data: pkgs } = await sb
        .from("client_packages")
        .select("allocated_hours, used_hours")
        .eq("tenant_id", tid)
        .eq("status", "active");

      let utilisationPct = 50; // default neutral
      if (pkgs?.length) {
        const totalAlloc = pkgs.reduce(
          (s: number, p: any) => s + (Number(p.allocated_hours) || 0),
          0
        );
        const totalUsed = pkgs.reduce(
          (s: number, p: any) => s + (Number(p.used_hours) || 0),
          0
        );
        utilisationPct = totalAlloc > 0 ? (totalUsed / totalAlloc) * 100 : 50;
      }
      // Low utilisation = high risk; very high also concerning
      const valueUtilScore = clamp(
        utilisationPct < 30
          ? 80
          : utilisationPct < 50
          ? 60
          : utilisationPct < 80
          ? 20
          : utilisationPct < 100
          ? 10
          : 30
      );
      if (valueUtilScore > 50) drivers.push("Low package utilisation");

      // ─── 3) Service Pressure Score ───
      // Overdue tasks
      const { count: overdueTasks } = await sb
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .eq("status", "open")
        .lt("due_date", today);

      // High risk forecast
      const { data: riskForecast } = await sb
        .from("tenant_risk_forecasts")
        .select("forecast_risk_status")
        .eq("tenant_id", tid)
        .order("forecast_date", { ascending: false })
        .limit(1);

      const riskStatus = riskForecast?.[0]?.forecast_risk_status ?? "stable";
      const riskMultiplier =
        riskStatus === "high"
          ? 1.0
          : riskStatus === "elevated"
          ? 0.7
          : riskStatus === "emerging"
          ? 0.4
          : 0.1;

      const pressureScore = clamp(
        Math.min((overdueTasks ?? 0) / 10, 1) * 60 + riskMultiplier * 40
      );
      if (pressureScore > 50) drivers.push("High service pressure");

      // ─── 4) Risk-Stress Overlap Score ───
      // high risk + low engagement overlap
      const overlapScore = clamp(
        (engagementScore * 0.5 + pressureScore * 0.5) *
          (riskMultiplier > 0.5 ? 1.2 : 0.8)
      );
      if (overlapScore > 60)
        drivers.push("Risk-stress overlap: high risk with low engagement");

      // ─── 5) Composite ───
      const composite = clamp(
        Math.round(
          engagementScore * 0.25 +
            valueUtilScore * 0.25 +
            pressureScore * 0.25 +
            overlapScore * 0.25
        )
      );

      const retentionStatus =
        composite <= 30
          ? "stable"
          : composite <= 50
          ? "watch"
          : composite <= 70
          ? "vulnerable"
          : "high_risk";

      results.push({
        tenant_id: tid,
        forecast_date: today,
        engagement_score: engagementScore,
        value_utilisation_score: valueUtilScore,
        service_pressure_score: pressureScore,
        risk_stress_overlap_score: overlapScore,
        composite_retention_risk_index: composite,
        retention_status: retentionStatus,
        key_drivers_json: drivers,
      });
    }

    // Batch insert forecasts
    if (results.length) {
      const { error: insErr } = await sb
        .from("tenant_retention_forecasts")
        .insert(results);
      if (insErr) throw insErr;

      // History
      const history = results.map((r) => ({
        tenant_id: r.tenant_id,
        snapshot_date: r.forecast_date,
        composite_retention_risk_index: r.composite_retention_risk_index,
      }));
      await sb.from("retention_forecast_history").insert(history);

      // Refresh materialized view
      await sb.rpc("refresh_materialized_view", {
        view_name: "v_retention_risk_trends",
      }).catch(() => {
        // RPC may not exist; skip
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        tenants_processed: results.length,
        summary: {
          stable: results.filter((r) => r.retention_status === "stable").length,
          watch: results.filter((r) => r.retention_status === "watch").length,
          vulnerable: results.filter((r) => r.retention_status === "vulnerable").length,
          high_risk: results.filter((r) => r.retention_status === "high_risk").length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("run-retention-forecast error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
