/**
 * run-strategic-signal-analysis – Unicorn 2.0
 *
 * Nightly strategic signal aggregation for the Command Centre.
 * Detects: clause clusters, capacity overloads, risk escalations, regulator overlaps.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const signals: Array<{
      signal_type: string;
      signal_severity: string;
      signal_summary: string;
      affected_entities_json: unknown;
    }> = [];

    // 1) Capacity overload signals
    const { data: snapshots } = await sb
      .from("workload_snapshots")
      .select("user_id, capacity_utilisation_percentage, overload_risk_status, snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(200);

    if (snapshots) {
      const latestDate = snapshots[0]?.snapshot_date;
      const latest = snapshots.filter((s: any) => s.snapshot_date === latestDate);
      const critical = latest.filter((s: any) => s.capacity_utilisation_percentage > 110);
      const high = latest.filter((s: any) => s.capacity_utilisation_percentage > 100);

      if (critical.length >= 1) {
        signals.push({
          signal_type: "capacity_critical",
          signal_severity: "high",
          signal_summary: `${critical.length} consultant(s) exceed 110% capacity utilisation.`,
          affected_entities_json: critical.map((c: any) => c.user_id),
        });
      }

      if (high.length >= 3) {
        signals.push({
          signal_type: "capacity_cluster_overload",
          signal_severity: "elevated",
          signal_summary: `${high.length} consultants over 100% capacity – team-wide pressure detected.`,
          affected_entities_json: high.map((h: any) => h.user_id),
        });
      }
    }

    // 2) Risk forecast escalation signals
    const { data: forecasts } = await sb
      .from("tenant_risk_forecasts")
      .select("tenant_id, composite_risk_index, forecast_risk_status, forecast_date")
      .order("forecast_date", { ascending: false })
      .limit(500);

    if (forecasts) {
      const latestDate = forecasts[0]?.forecast_date;
      const latest = forecasts.filter((f: any) => f.forecast_date === latestDate);
      const highRisk = latest.filter((f: any) => f.forecast_risk_status === "high" || f.forecast_risk_status === "elevated");
      const totalTenants = latest.length || 1;
      const elevatedPct = Math.round((highRisk.length / totalTenants) * 100);

      if (elevatedPct >= 10) {
        signals.push({
          signal_type: "portfolio_risk_concentration",
          signal_severity: "high",
          signal_summary: `${elevatedPct}% of tenants at elevated or high risk status.`,
          affected_entities_json: highRisk.map((h: any) => h.tenant_id),
        });
      }
    }

    // 3) Package burn critical signals
    const { data: burns } = await sb
      .from("tenant_package_burn_forecast")
      .select("tenant_id, package_id, burn_risk_status")
      .eq("burn_risk_status", "critical");

    if (burns && burns.length >= 3) {
      signals.push({
        signal_type: "burn_risk_cluster",
        signal_severity: "elevated",
        signal_summary: `${burns.length} packages in critical burn status across portfolio.`,
        affected_entities_json: burns.map((b: any) => ({ tenant_id: b.tenant_id, package_id: b.package_id })),
      });
    }

    // 4) Knowledge graph clause concentration
    const { data: clauseEdges } = await sb
      .from("knowledge_edges")
      .select("to_node_id, relationship_type")
      .eq("relationship_type", "relates_to_clause")
      .limit(1000);

    if (clauseEdges && clauseEdges.length > 0) {
      const clauseCounts: Record<string, number> = {};
      for (const edge of clauseEdges) {
        clauseCounts[edge.to_node_id] = (clauseCounts[edge.to_node_id] || 0) + 1;
      }
      const topClauses = Object.entries(clauseCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

      if (topClauses.length > 0 && topClauses[0][1] >= 5) {
        signals.push({
          signal_type: "clause_concentration",
          signal_severity: "info",
          signal_summary: `Top clause has ${topClauses[0][1]} linked risk/audit events – systemic pattern potential.`,
          affected_entities_json: topClauses.map(([id, count]) => ({ node_id: id, count })),
        });
      }
    }

    // Insert signals
    if (signals.length > 0) {
      const { error: insertErr } = await sb
        .from("strategic_signal_summary")
        .insert(signals);
      if (insertErr) throw insertErr;
    }

    // Refresh materialized views
    await sb.rpc("refresh_materialized_view_concurrently", { view_name: "v_strategic_portfolio_risk" }).catch(() => {});
    await sb.rpc("refresh_materialized_view_concurrently", { view_name: "v_strategic_capacity_pressure" }).catch(() => {});

    return new Response(
      JSON.stringify({ success: true, signals_generated: signals.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Strategic signal analysis error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
