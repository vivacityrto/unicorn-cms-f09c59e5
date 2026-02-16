/**
 * risk-command-engine – Unicorn 2.0 Phase 18
 *
 * Event-driven risk detection engine. Can be triggered by DB webhooks
 * or called on schedule. Evaluates 6 trigger rules and inserts
 * deduplicated real_time_risk_alerts.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "https://deno.land/std@0.208.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Alert {
  tenant_id: number;
  source_entity_id: string | null;
  source_type: string;
  alert_type: string;
  severity: string;
  alert_summary: string;
  recommended_actions_json: any[];
  dedupe_hash: string;
}

function makeDedupe(tenantId: number, alertType: string, sourceId: string | null): string {
  const raw = `${tenantId}:${alertType}:${sourceId ?? "global"}`;
  // Simple hash for deduplication
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const d14ago = new Date(now.getTime() - 14 * 86400000).toISOString();
    const d30ago = new Date(now.getTime() - 30 * 86400000).toISOString();
    const d60ago = new Date(now.getTime() - 60 * 86400000).toISOString();
    const d90ago = new Date(now.getTime() - 90 * 86400000).toISOString();

    const alerts: Alert[] = [];

    // Fetch existing active dedupe hashes to avoid duplicates
    const { data: existingAlerts } = await sb
      .from("real_time_risk_alerts")
      .select("dedupe_hash")
      .eq("resolved_flag", false)
      .eq("archived_flag", false);

    const existingHashes = new Set((existingAlerts || []).map((a: any) => a.dedupe_hash));

    // Archive old alerts (> 90 days)
    await sb
      .from("real_time_risk_alerts")
      .update({ archived_flag: true })
      .lt("created_at", d90ago)
      .eq("archived_flag", false);

    // ── RULE 1: High Severity Risk ──
    const { data: highRisks } = await sb
      .from("risk_events")
      .select("id, tenant_id, clause_ref, severity, created_at")
      .eq("severity", "high")
      .in("status", ["open", "monitoring"]);

    for (const risk of highRisks || []) {
      // Check if same clause flagged within 30 days
      const { count } = await sb
        .from("risk_events")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", risk.tenant_id)
        .eq("clause_ref", risk.clause_ref)
        .gte("created_at", d30ago)
        .neq("id", risk.id);

      if ((count || 0) > 0) {
        const hash = makeDedupe(risk.tenant_id, "high_severity_risk", risk.id);
        if (!existingHashes.has(hash)) {
          alerts.push({
            tenant_id: risk.tenant_id,
            source_entity_id: risk.id,
            source_type: "risk_event",
            alert_type: "high_severity_risk",
            severity: "high",
            alert_summary: `High severity risk for clause ${risk.clause_ref} re-flagged within 30 days`,
            recommended_actions_json: [
              { action: "Review clause evidence", priority: "high" },
              { action: "Schedule urgent consult", priority: "high" },
              { action: "Trigger Copilot analysis", priority: "medium" },
            ],
            dedupe_hash: hash,
          });
        }
      }
    }

    // ── RULE 2: Critical Stage ──
    const { data: critSnapshots } = await sb
      .from("stage_health_snapshots")
      .select("id, tenant_id, stage_instance_id, health_status")
      .eq("health_status", "critical")
      .eq("snapshot_date", today);

    for (const snap of critSnapshots || []) {
      const hash = makeDedupe(snap.tenant_id, "critical_stage", snap.stage_instance_id);
      if (!existingHashes.has(hash)) {
        alerts.push({
          tenant_id: snap.tenant_id,
          source_entity_id: snap.stage_instance_id,
          source_type: "stage_health_snapshot",
          alert_type: "critical_stage",
          severity: "critical",
          alert_summary: `Stage marked critical in today's health snapshot`,
          recommended_actions_json: [
            { action: "Review stage backlog", priority: "high" },
            { action: "Initiate internal review", priority: "high" },
            { action: "Schedule urgent consult", priority: "medium" },
          ],
          dedupe_hash: hash,
        });
      }
    }

    // ── RULE 3: Regulator Overlap ──
    const { data: recentRegUpdates } = await sb
      .from("regulator_change_events")
      .select("id, affected_clauses")
      .eq("status", "approved")
      .gte("created_at", d30ago);

    if (recentRegUpdates && recentRegUpdates.length > 0) {
      const regClauses = new Set<string>();
      for (const ru of recentRegUpdates) {
        const clauses = ru.affected_clauses || [];
        clauses.forEach((c: string) => regClauses.add(c));
      }

      if (regClauses.size > 0) {
        const { data: overlappingRisks } = await sb
          .from("risk_events")
          .select("id, tenant_id, clause_ref")
          .in("clause_ref", Array.from(regClauses))
          .in("status", ["open", "monitoring"]);

        for (const risk of overlappingRisks || []) {
          const hash = makeDedupe(risk.tenant_id, "regulator_overlap", risk.id);
          if (!existingHashes.has(hash)) {
            alerts.push({
              tenant_id: risk.tenant_id,
              source_entity_id: risk.id,
              source_type: "risk_event",
              alert_type: "regulator_overlap",
              severity: "high",
              alert_summary: `Open risk on clause ${risk.clause_ref} overlaps with recent regulator change`,
              recommended_actions_json: [
                { action: "Review clause evidence", priority: "high" },
                { action: "Review regulator update impact", priority: "high" },
                { action: "Trigger Copilot analysis", priority: "medium" },
              ],
              dedupe_hash: hash,
            });
          }
        }
      }
    }

    // ── RULE 4: Rapid Risk Spike ──
    const { data: forecasts14d } = await sb
      .from("tenant_risk_forecasts")
      .select("tenant_id, risk_velocity_score, forecast_date")
      .gte("forecast_date", d14ago.split("T")[0])
      .order("forecast_date", { ascending: true });

    if (forecasts14d) {
      const byTenant = new Map<number, any[]>();
      for (const f of forecasts14d) {
        if (!byTenant.has(f.tenant_id)) byTenant.set(f.tenant_id, []);
        byTenant.get(f.tenant_id)!.push(f);
      }

      for (const [tenantId, records] of byTenant) {
        if (records.length < 2) continue;
        const oldest = records[0].risk_velocity_score || 0;
        const newest = records[records.length - 1].risk_velocity_score || 0;
        if (oldest > 0 && ((newest - oldest) / oldest) > 0.4) {
          const hash = makeDedupe(tenantId, "rapid_risk_spike", null);
          if (!existingHashes.has(hash)) {
            alerts.push({
              tenant_id: tenantId,
              source_entity_id: null,
              source_type: "tenant_risk_forecast",
              alert_type: "rapid_risk_spike",
              severity: "critical",
              alert_summary: `Risk velocity increased ${Math.round(((newest - oldest) / oldest) * 100)}% in 14 days`,
              recommended_actions_json: [
                { action: "Review risk forecast drivers", priority: "high" },
                { action: "Schedule strategic check-in", priority: "high" },
                { action: "Initiate internal review", priority: "medium" },
              ],
              dedupe_hash: hash,
            });
          }
        }
      }
    }

    // ── RULE 5: Repeated Evidence Gap ──
    const { data: gapChecks } = await sb
      .from("evidence_gap_checks")
      .select("id, stage_instance_id, missing_categories_json, generated_at")
      .gte("generated_at", d60ago);

    if (gapChecks && gapChecks.length > 0) {
      // Group by stage_instance_id and find repeated mandatory gaps
      const gapByStage = new Map<string, any[]>();
      for (const gc of gapChecks) {
        if (!gc.stage_instance_id) continue;
        if (!gapByStage.has(gc.stage_instance_id)) gapByStage.set(gc.stage_instance_id, []);
        gapByStage.get(gc.stage_instance_id)!.push(gc);
      }

      // Look up tenant_id for stage instances
      const stageIds = Array.from(gapByStage.keys());
      if (stageIds.length > 0) {
        const { data: stageInstances } = await sb
          .from("stage_instances")
          .select("id, package_instance_id")
          .in("id", stageIds);

        const pkgIds = [...new Set((stageInstances || []).map((s: any) => s.package_instance_id).filter(Boolean))];
        const { data: pkgInsts } = await sb
          .from("package_instances")
          .select("id, tenant_id")
          .in("id", pkgIds);

        const pkgTenantMap = new Map<number, number>();
        (pkgInsts || []).forEach((p: any) => pkgTenantMap.set(p.id, p.tenant_id));
        const stageTenantMap = new Map<string, number>();
        (stageInstances || []).forEach((s: any) => {
          const tid = pkgTenantMap.get(s.package_instance_id);
          if (tid) stageTenantMap.set(s.id, tid);
        });

        for (const [stageId, checks] of gapByStage) {
          if (checks.length < 2) continue;
          const tenantId = stageTenantMap.get(stageId);
          if (!tenantId) continue;

          // Find categories that appear in multiple checks
          const catCount = new Map<string, number>();
          for (const check of checks) {
            const missing = (check.missing_categories_json || []) as any[];
            const mandatoryCats = missing.filter((m: any) => m.mandatory).map((m: any) => m.category || m.name || "unknown");
            for (const cat of mandatoryCats) {
              catCount.set(cat, (catCount.get(cat) || 0) + 1);
            }
          }

          for (const [cat, count] of catCount) {
            if (count >= 2) {
              const hash = makeDedupe(tenantId, "repeated_gap", `${stageId}:${cat}`);
              if (!existingHashes.has(hash)) {
                alerts.push({
                  tenant_id: tenantId,
                  source_entity_id: stageId,
                  source_type: "evidence_gap_check",
                  alert_type: "repeated_gap",
                  severity: "moderate",
                  alert_summary: `Mandatory evidence category "${cat}" missing in ${count} checks within 60 days`,
                  recommended_actions_json: [
                    { action: "Review template clarity", priority: "medium" },
                    { action: "Schedule consult to address gap", priority: "medium" },
                  ],
                  dedupe_hash: hash,
                });
              }
            }
          }
        }
      }
    }

    // ── RULE 6: Consultant Overload Risk ──
    const { data: capacityData } = await sb
      .from("vw_consultant_capacity")
      .select("user_uuid, full_name, utilisation_pct");

    for (const c of capacityData || []) {
      if ((c.utilisation_pct || 0) > 120) {
        // Check if any assigned tenant is in elevated risk
        const { data: assignments } = await sb
          .from("tenant_members")
          .select("tenant_id")
          .eq("user_id", c.user_uuid)
          .eq("status", "active");

        for (const assignment of assignments || []) {
          const { data: forecast } = await sb
            .from("tenant_risk_forecasts")
            .select("composite_risk_index, risk_status")
            .eq("tenant_id", assignment.tenant_id)
            .order("forecast_date", { ascending: false })
            .limit(1);

          if (forecast && forecast.length > 0 && (forecast[0].risk_status === "elevated" || forecast[0].risk_status === "critical")) {
            const hash = makeDedupe(assignment.tenant_id, "consultant_overload_risk", c.user_uuid);
            if (!existingHashes.has(hash)) {
              alerts.push({
                tenant_id: assignment.tenant_id,
                source_entity_id: c.user_uuid,
                source_type: "consultant_capacity",
                alert_type: "consultant_overload_risk",
                severity: "high",
                alert_summary: `Consultant ${c.full_name || "unknown"} at ${Math.round(c.utilisation_pct)}% capacity with elevated-risk tenant`,
                recommended_actions_json: [
                  { action: "Review consultant workload", priority: "high" },
                  { action: "Consider advisory support reassignment", priority: "medium" },
                  { action: "Review stage backlog", priority: "medium" },
                ],
                dedupe_hash: hash,
              });
            }
          }
        }
      }
    }

    // ── INSERT ALERTS ──
    let inserted = 0;
    if (alerts.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < alerts.length; i += batchSize) {
        const batch = alerts.slice(i, i + batchSize);
        const { error } = await sb.from("real_time_risk_alerts").insert(batch);
        if (error) {
          console.error("Insert error batch", i, error);
        } else {
          inserted += batch.length;
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: "Risk command engine completed",
        alerts_generated: inserted,
        alerts_evaluated: alerts.length,
        summary: {
          high_severity_risk: alerts.filter(a => a.alert_type === "high_severity_risk").length,
          critical_stage: alerts.filter(a => a.alert_type === "critical_stage").length,
          regulator_overlap: alerts.filter(a => a.alert_type === "regulator_overlap").length,
          rapid_risk_spike: alerts.filter(a => a.alert_type === "rapid_risk_spike").length,
          repeated_gap: alerts.filter(a => a.alert_type === "repeated_gap").length,
          consultant_overload_risk: alerts.filter(a => a.alert_type === "consultant_overload_risk").length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Risk command engine error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
