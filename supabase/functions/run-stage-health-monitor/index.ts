/**
 * run-stage-health-monitor – Unicorn 2.0 Phase 9
 *
 * Nightly scheduled function that calculates stage health snapshots
 * for all active stage instances. Evaluates configurable threshold
 * rules and assigns health_status (healthy/monitoring/at_risk/critical).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { isCronAuthorized, cronUnauthorizedResponse } from "../_shared/cron-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  // Nightly cron-only job (see cron.job "run-stage-health-monitor-nightly"),
  // writes health snapshots for every active stage -- had no auth check at
  // all until now, despite the cron job already sending x-cron-invoke-secret.
  if (!(await isCronAuthorized(req))) {
    return cronUnauthorizedResponse(req, corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // 1. Fetch configurable health rules
    const { data: rules, error: rulesErr } = await sb
      .from("stage_health_rules")
      .select("*");
    if (rulesErr) throw rulesErr;

    // 2. Fetch all active stage instances
    const stages: any[] = [];
    let page = 0;
    while (true) {
      const { data, error } = await sb
        .from("stage_instances")
        .select("id, packageinstance_id, status, created_at, updated_at")
        .in("status", ["in_progress", "not_started", "pending"])
        .range(page * 1000, page * 1000 + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      stages.push(...data);
      if (data.length < 1000) break;
      page++;
    }

    if (!stages || stages.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active stages found", processed: 0 }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // 3. Get all unique IDs needed
    const packageInstanceIds = [
      ...new Set(stages.map((s: any) => s.packageinstance_id).filter(Boolean)),
    ];
    const stageIds = stages.map((s: any) => s.id);

    // 4. Bulk fetch package_instances → tenant mapping
    const { data: pkgInstances } = await sb
      .from("package_instances")
      .select("id, tenant_id")
      .in("id", packageInstanceIds);

    const tenantByPkg = new Map<number, number>();
    (pkgInstances || []).forEach((p: any) => tenantByPkg.set(p.id, p.tenant_id));

    const tenantIds = [...new Set(Array.from(tenantByPkg.values()))];

    // 5. Bulk fetch ALL tasks for ALL stage instances in one query
    const { data: allTasks } = await sb
      .from("staff_task_instances")
      .select("id, stageinstance_id, status_id, due_date")
      .in("stageinstance_id", stageIds);

    const tasksByStage = new Map<string, any[]>();
    (allTasks || []).forEach((t: any) => {
      const key = t.stageinstance_id;
      if (!tasksByStage.has(key)) tasksByStage.set(key, []);
      tasksByStage.get(key)!.push(t);
    });

    // 6. Bulk fetch high-risk counts per tenant
    const { data: riskEvents } = await sb
      .from("risk_events")
      .select("tenant_id")
      .in("tenant_id", tenantIds)
      .eq("severity", "high")
      .in("status", ["open", "monitoring"]);

    const riskCountByTenant = new Map<number, number>();
    (riskEvents || []).forEach((r: any) => {
      riskCountByTenant.set(r.tenant_id, (riskCountByTenant.get(r.tenant_id) || 0) + 1);
    });

    // 7. Bulk fetch latest evidence gap checks per stage
    const { data: allGapChecks } = await sb
      .from("evidence_gap_checks")
      .select("stage_instance_id, missing_categories_json, generated_at")
      .in("stage_instance_id", stageIds)
      .order("generated_at", { ascending: false });

    const latestGapByStage = new Map<string, any>();
    (allGapChecks || []).forEach((g: any) => {
      if (!latestGapByStage.has(g.stage_instance_id)) {
        latestGapByStage.set(g.stage_instance_id, g);
      }
    });

    // 8. Bulk fetch consult hours per tenant (from time_entries, last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: timeEntries } = await sb
      .from("time_entries")
      .select("tenant_id, duration_minutes")
      .in("tenant_id", tenantIds)
      .gte("start_at", ninetyDaysAgo);

    const consultHoursByTenant = new Map<number, number>();
    (timeEntries || []).forEach((te: any) => {
      const hours = (te.duration_minutes || 0) / 60;
      consultHoursByTenant.set(te.tenant_id, (consultHoursByTenant.get(te.tenant_id) || 0) + hours);
    });

    // 9. Process all stages in memory — zero DB calls in this loop
    const snapshots: any[] = [];
    const today = new Date().toISOString().split("T")[0];

    for (const stage of stages) {
      const tenantId = tenantByPkg.get(stage.packageinstance_id);
      if (!tenantId) continue;

      const stageId = stage.id;
      const tasks = tasksByStage.get(stageId) || [];
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter((t: any) => t.status_id === 2).length;
      const openTasks = totalTasks - completedTasks;
      const overdueTasks = tasks.filter((t: any) =>
        t.due_date && t.status_id !== 2 && t.status_id !== 3 && t.due_date < today
      ).length;
      const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      const highRiskCount = riskCountByTenant.get(tenantId) || 0;

      const gapCheck = latestGapByStage.get(stageId);
      let mandatoryGapCount = 0;
      if (gapCheck?.missing_categories_json) {
        mandatoryGapCount = (gapCheck.missing_categories_json as any[])
          .filter((m: any) => m.mandatory === true).length;
      }

      const lastUpdated = stage.updated_at || stage.created_at;
      const daysSinceActivity = lastUpdated
        ? Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 86400000)
        : 999;

      const consultHoursLogged = consultHoursByTenant.get(tenantId) || 0;

      const metrics: Record<string, number> = {
        tasks_overdue_count: overdueTasks,
        high_risk_count: highRiskCount,
        evidence_gap_mandatory_count: mandatoryGapCount,
        days_since_last_activity: daysSinceActivity,
        progress_percentage: progressPct,
        tasks_open_count: openTasks,
      };

      const severityOrder: Record<string, number> = { healthy: 0, monitoring: 1, at_risk: 2, critical: 3 };
      let healthStatus = "healthy";

      for (const rule of rules || []) {
        const metricVal = metrics[rule.metric_key];
        if (metricVal === undefined) continue;
        let triggered = false;
        switch (rule.comparison_operator) {
          case ">":  triggered = metricVal > rule.threshold_value; break;
          case ">=": triggered = metricVal >= rule.threshold_value; break;
          case "<":  triggered = metricVal < rule.threshold_value; break;
          case "<=": triggered = metricVal <= rule.threshold_value; break;
          case "=":  triggered = metricVal === rule.threshold_value; break;
        }
        if (triggered && severityOrder[rule.severity_impact] > severityOrder[healthStatus]) {
          healthStatus = rule.severity_impact;
        }
      }

      snapshots.push({
        tenant_id: tenantId,
        stage_instance_id: stageId,
        snapshot_date: today,
        progress_percentage: progressPct,
        tasks_open_count: openTasks,
        tasks_overdue_count: overdueTasks,
        high_risk_count: highRiskCount,
        evidence_gap_mandatory_count: mandatoryGapCount,
        days_since_last_activity: daysSinceActivity,
        consult_hours_logged: Math.round(consultHoursLogged * 100) / 100,
        health_status: healthStatus,
      });
    }

    // 5. Batch insert snapshots
    if (snapshots.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < snapshots.length; i += batchSize) {
        const batch = snapshots.slice(i, i + batchSize);
        const { error: insertErr } = await sb
          .from("stage_health_snapshots")
          .upsert(batch, { onConflict: "stage_instance_id,snapshot_date" });
        if (insertErr) {
          console.error("Insert error batch", i, insertErr);
        }
      }
    }

    // 6. Refresh materialized view
    try {
      await sb.rpc("refresh_stage_health_trends" as any);
    } catch {
      console.log("Materialized view refresh via RPC not available, skipping");
    }

    return new Response(
      JSON.stringify({
        message: "Stage health monitor completed",
        processed: snapshots.length,
        summary: {
          healthy: snapshots.filter((s) => s.health_status === "healthy").length,
          monitoring: snapshots.filter((s) => s.health_status === "monitoring").length,
          at_risk: snapshots.filter((s) => s.health_status === "at_risk").length,
          critical: snapshots.filter((s) => s.health_status === "critical").length,
        },
      }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Stage health monitor error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
