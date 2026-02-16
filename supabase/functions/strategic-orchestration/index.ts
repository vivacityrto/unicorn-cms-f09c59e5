/**
 * strategic-orchestration – Unicorn 2.0 Phase 20
 *
 * Autonomous Strategic Orchestration Layer.
 * Aggregates all intelligence signals and synthesises enterprise-level
 * strategic priorities. Runs nightly or on critical alert events.
 *
 * Advisory only — no irreversible actions, no compliance verdicts.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Priority {
  priority_type: string;
  severity_level: string;
  impact_scope: string;
  affected_entities_json: any[];
  recommended_actions_json: any[];
  priority_summary: string;
  dedupe_hash: string;
}

function makeHash(type: string, key: string): string {
  const raw = `${type}:${key}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
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
    const d14ago = new Date(now.getTime() - 14 * 86400000).toISOString();
    const d30ago = new Date(now.getTime() - 30 * 86400000).toISOString();
    const d60ago = new Date(now.getTime() - 60 * 86400000).toISOString();
    const d90ago = new Date(now.getTime() - 90 * 86400000).toISOString();
    const d180ago = new Date(now.getTime() - 180 * 86400000).toISOString();

    const priorities: Priority[] = [];

    // Fetch existing active dedupe hashes
    const { data: existingPriorities } = await sb
      .from("strategic_priorities")
      .select("dedupe_hash")
      .eq("resolved_flag", false);
    const existingHashes = new Set((existingPriorities || []).map((p: any) => p.dedupe_hash));

    // Archive resolved priorities > 180 days
    await sb
      .from("strategic_priorities")
      .update({ resolved_flag: true, resolved_at: now.toISOString() })
      .lt("created_at", d180ago)
      .eq("resolved_flag", true);

    // ── RULE 1: Systemic Clause Spike ──
    // Same clause flagged across 5+ tenants in active risk alerts
    const { data: activeAlerts } = await sb
      .from("real_time_risk_alerts")
      .select("tenant_id, alert_type, alert_summary, severity, source_entity_id")
      .eq("resolved_flag", false);

    if (activeAlerts && activeAlerts.length > 0) {
      // Extract clause references from alert summaries
      const clauseByTenant = new Map<string, Set<number>>();
      for (const a of activeAlerts) {
        const match = a.alert_summary?.match(/clause\s+(\d+\.\d+)/i);
        if (match) {
          const clause = match[1];
          if (!clauseByTenant.has(clause)) clauseByTenant.set(clause, new Set());
          clauseByTenant.get(clause)!.add(a.tenant_id);
        }
      }

      // Check for regulator overlap on those clauses
      const { data: regUpdates } = await sb
        .from("regulator_change_events")
        .select("affected_clauses")
        .eq("status", "approved")
        .gte("created_at", d30ago);

      const regClauses = new Set<string>();
      for (const ru of regUpdates || []) {
        (ru.affected_clauses || []).forEach((c: string) => regClauses.add(c));
      }

      for (const [clause, tenants] of clauseByTenant) {
        if (tenants.size >= 5) {
          const hasRegOverlap = regClauses.has(clause);
          const severity = hasRegOverlap ? "critical" : "high";
          const hash = makeHash("systemic_clause_spike", clause);
          if (!existingHashes.has(hash)) {
            priorities.push({
              priority_type: "systemic_clause_spike",
              severity_level: severity,
              impact_scope: "portfolio",
              affected_entities_json: Array.from(tenants).map(t => ({ tenant_id: t })),
              recommended_actions_json: [
                { action: "Initiate template review cycle for clause " + clause, priority: "high" },
                { action: "Launch targeted internal training", priority: "high" },
                ...(hasRegOverlap ? [{ action: "Escalate regulator analysis", priority: "critical" }] : []),
                { action: "Trigger internal quality audit sprint", priority: "medium" },
              ],
              priority_summary: `Clause ${clause} flagged across ${tenants.size} tenants${hasRegOverlap ? " with regulator overlap" : ""}`,
              dedupe_hash: hash,
            });
          }
        }
      }
    }

    // ── RULE 2: Capacity Crisis ──
    const { data: capacityData } = await sb
      .from("vw_consultant_capacity")
      .select("user_uuid, full_name, utilisation_pct");

    const overloadedConsultants = (capacityData || []).filter((c: any) => (c.utilisation_pct || 0) > 110);

    if (overloadedConsultants.length >= 3) {
      // Check if any have high-risk tenants
      const overloadedIds = overloadedConsultants.map((c: any) => c.user_uuid);
      const { data: assignments } = await sb
        .from("tenant_members")
        .select("user_id, tenant_id")
        .in("user_id", overloadedIds)
        .eq("status", "active");

      const affectedTenants = new Set<number>();
      for (const a of assignments || []) {
        const { data: forecast } = await sb
          .from("tenant_risk_forecasts")
          .select("risk_status")
          .eq("tenant_id", a.tenant_id)
          .order("forecast_date", { ascending: false })
          .limit(1);

        if (forecast?.[0]?.risk_status === "elevated" || forecast?.[0]?.risk_status === "critical") {
          affectedTenants.add(a.tenant_id);
        }
      }

      const hash = makeHash("capacity_crisis", `${overloadedConsultants.length}`);
      if (!existingHashes.has(hash)) {
        priorities.push({
          priority_type: "capacity_crisis",
          severity_level: affectedTenants.size > 0 ? "critical" : "high",
          impact_scope: affectedTenants.size > 3 ? "portfolio" : "multi_tenant",
          affected_entities_json: [
            ...overloadedConsultants.map((c: any) => ({
              type: "consultant", user_uuid: c.user_uuid, name: c.full_name, utilisation: c.utilisation_pct,
            })),
            ...Array.from(affectedTenants).map(t => ({ type: "tenant", tenant_id: t })),
          ],
          recommended_actions_json: [
            { action: "Rebalance consultant allocation", priority: "high" },
            { action: "Conduct high-risk client review roundtable", priority: "high" },
            { action: "Review stage backlog for affected tenants", priority: "medium" },
          ],
          priority_summary: `${overloadedConsultants.length} consultants over 110% capacity, ${affectedTenants.size} elevated-risk tenants affected`,
          dedupe_hash: hash,
        });
      }
    }

    // ── RULE 3: Retention Threat ──
    const { data: retentionData } = await sb
      .from("retention_risk_assessments")
      .select("id, tenant_id, risk_level, renewal_date")
      .eq("risk_level", "high")
      .gte("created_at", d30ago);

    if (retentionData && retentionData.length >= 2) {
      const renewalSoon = retentionData.filter((r: any) => {
        if (!r.renewal_date) return false;
        const renewalMs = new Date(r.renewal_date).getTime();
        return renewalMs - now.getTime() < 90 * 86400000 && renewalMs > now.getTime();
      });

      if (renewalSoon.length >= 2) {
        const hash = makeHash("retention_threat", `${renewalSoon.length}`);
        if (!existingHashes.has(hash)) {
          priorities.push({
            priority_type: "retention_threat",
            severity_level: "high",
            impact_scope: renewalSoon.length > 3 ? "portfolio" : "multi_tenant",
            affected_entities_json: renewalSoon.map((r: any) => ({
              tenant_id: r.tenant_id, renewal_date: r.renewal_date,
            })),
            recommended_actions_json: [
              { action: "Schedule urgent retention review meetings", priority: "high" },
              { action: "Review service delivery quality for affected clients", priority: "high" },
              { action: "Prepare renewal value propositions", priority: "medium" },
            ],
            priority_summary: `${renewalSoon.length} high-risk retention clients with renewal within 90 days`,
            dedupe_hash: hash,
          });
        }
      }
    }

    // ── RULE 4: Operational Breakdown ──
    const { data: stageSnapshots } = await sb
      .from("stage_health_snapshots")
      .select("id, tenant_id, health_status")
      .eq("snapshot_date", now.toISOString().split("T")[0]);

    const totalStages = stageSnapshots?.length || 0;
    const criticalStages = stageSnapshots?.filter((s: any) => s.health_status === "critical") || [];

    if (totalStages > 0 && (criticalStages.length / totalStages) >= 0.1) {
      const affectedTenants = [...new Set(criticalStages.map((s: any) => s.tenant_id))];
      const hash = makeHash("operational_breakdown", `${criticalStages.length}`);
      if (!existingHashes.has(hash)) {
        priorities.push({
          priority_type: "operational_breakdown",
          severity_level: criticalStages.length > 5 ? "critical" : "high",
          impact_scope: affectedTenants.length > 3 ? "portfolio" : "multi_tenant",
          affected_entities_json: affectedTenants.map(t => ({ tenant_id: t })),
          recommended_actions_json: [
            { action: "Review stage backlog across affected tenants", priority: "high" },
            { action: "Initiate internal review of workflow bottlenecks", priority: "high" },
            { action: "Trigger internal quality audit sprint", priority: "medium" },
          ],
          priority_summary: `${criticalStages.length} of ${totalStages} active stages (${Math.round(criticalStages.length / totalStages * 100)}%) in critical status`,
          dedupe_hash: hash,
        });
      }
    }

    // ── RULE 5: Regulator Exposure ──
    if (regClauses && regClauses.size > 0) {
      // Count how many active risk events overlap with recent regulator changes
      const { data: overlapping } = await sb
        .from("risk_events")
        .select("id, tenant_id, clause_ref")
        .in("clause_ref", Array.from(regClauses))
        .in("status", ["open", "monitoring"]);

      const regTenants = new Set((overlapping || []).map((r: any) => r.tenant_id));
      if (regTenants.size >= 3) {
        const hash = makeHash("regulator_exposure", `${regClauses.size}`);
        if (!existingHashes.has(hash)) {
          priorities.push({
            priority_type: "regulator_exposure",
            severity_level: regTenants.size >= 5 ? "critical" : "high",
            impact_scope: "portfolio",
            affected_entities_json: Array.from(regTenants).map(t => ({ tenant_id: t })),
            recommended_actions_json: [
              { action: "Escalate regulator analysis to leadership", priority: "high" },
              { action: "Review impacted clauses across portfolio", priority: "high" },
              { action: "Initiate template review cycle", priority: "medium" },
            ],
            priority_summary: `${regClauses.size} regulatory clause changes impacting ${regTenants.size} tenants with active risks`,
            dedupe_hash: hash,
          });
        }
      }
    }

    // ── RULE 6: Compliance Cluster ──
    // Active playbook activations clustering on same trigger type
    const { data: activePlaybooks } = await sb
      .from("playbook_activations")
      .select("id, playbook_id, tenant_id, activation_reason")
      .in("activation_status", ["suggested", "initiated"])
      .gte("activated_at", d30ago);

    if (activePlaybooks && activePlaybooks.length >= 5) {
      const byPlaybook = new Map<string, any[]>();
      for (const pb of activePlaybooks) {
        if (!byPlaybook.has(pb.playbook_id)) byPlaybook.set(pb.playbook_id, []);
        byPlaybook.get(pb.playbook_id)!.push(pb);
      }

      for (const [playbookId, activations] of byPlaybook) {
        if (activations.length >= 5) {
          const tenants = [...new Set(activations.map((a: any) => a.tenant_id))];
          const hash = makeHash("compliance_cluster", playbookId);
          if (!existingHashes.has(hash)) {
            priorities.push({
              priority_type: "compliance_cluster",
              severity_level: tenants.length >= 5 ? "critical" : "high",
              impact_scope: tenants.length >= 3 ? "portfolio" : "multi_tenant",
              affected_entities_json: tenants.map(t => ({ tenant_id: t })),
              recommended_actions_json: [
                { action: "Review common playbook triggers for systemic issues", priority: "high" },
                { action: "Launch targeted internal training", priority: "medium" },
                { action: "Conduct cluster analysis with Copilot", priority: "medium" },
              ],
              priority_summary: `Playbook activated ${activations.length} times across ${tenants.length} tenants in 30 days`,
              dedupe_hash: hash,
            });
          }
        }
      }
    }

    // ── INSERT PRIORITIES ──
    let inserted = 0;
    if (priorities.length > 0) {
      const { error } = await sb.from("strategic_priorities").insert(priorities);
      if (error) {
        console.error("Insert priorities error:", error);
      } else {
        inserted = priorities.length;
      }
    }

    // Refresh materialized view
    try {
      await sb.rpc("refresh_strategic_orchestration_summary");
    } catch {
      // View refresh function may not exist yet, safe to ignore
    }

    // Audit log
    try {
      await sb.rpc("fn_audit_strategic_orchestration", {
        p_actor_user_id: "00000000-0000-0000-0000-000000000000",
        p_priority_id: null,
        p_action: "orchestration_run",
        p_metadata: { priorities_created: inserted, priorities_evaluated: priorities.length },
      });
    } catch {
      // Non-critical
    }

    return new Response(
      JSON.stringify({
        message: "Strategic orchestration completed",
        priorities_created: inserted,
        priorities_evaluated: priorities.length,
        summary: {
          systemic_clause_spike: priorities.filter(p => p.priority_type === "systemic_clause_spike").length,
          capacity_crisis: priorities.filter(p => p.priority_type === "capacity_crisis").length,
          retention_threat: priorities.filter(p => p.priority_type === "retention_threat").length,
          operational_breakdown: priorities.filter(p => p.priority_type === "operational_breakdown").length,
          regulator_exposure: priorities.filter(p => p.priority_type === "regulator_exposure").length,
          compliance_cluster: priorities.filter(p => p.priority_type === "compliance_cluster").length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Strategic orchestration error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
