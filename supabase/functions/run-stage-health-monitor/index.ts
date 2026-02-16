/**
 * run-stage-health-monitor – Unicorn 2.0 Phase 9
 *
 * Nightly scheduled function that calculates stage health snapshots
 * for all active stage instances. Evaluates configurable threshold
 * rules and assigns health_status (healthy/monitoring/at_risk/critical).
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

    // 1. Fetch configurable health rules
    const { data: rules, error: rulesErr } = await sb
      .from("stage_health_rules")
      .select("*");
    if (rulesErr) throw rulesErr;

    // 2. Fetch all active stage instances
    const { data: stages, error: stagesErr } = await sb
      .from("stage_instances")
      .select("id, package_instance_id, status, started_at, updated_at")
      .in("status", ["in_progress", "not_started", "pending"]);
    if (stagesErr) throw stagesErr;

    if (!stages || stages.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active stages found", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get package_instance -> tenant mapping
    const packageInstanceIds = [
      ...new Set(stages.map((s: any) => s.package_instance_id).filter(Boolean)),
    ];

    const { data: pkgInstances } = await sb
      .from("package_instances")
      .select("id, tenant_id")
      .in("id", packageInstanceIds);

    const tenantMap = new Map<number, number>();
    (pkgInstances || []).forEach((p: any) => tenantMap.set(p.id, p.tenant_id));

    // 4. For each stage, calculate metrics and apply rules
    const snapshots: any[] = [];
    const today = new Date().toISOString().split("T")[0];

    for (const stage of stages) {
      const tenantId = tenantMap.get(stage.package_instance_id);
      if (!tenantId) continue;

      const stageId = stage.id;

      // Fetch task metrics
      const { data: tasks } = await sb
        .from("staff_task_instances")
        .select("id, status_id, due_date")
        .eq("stageinstance_id", stageId);

      const totalTasks = tasks?.length || 0;
      const completedTasks = tasks?.filter((t: any) => t.status_id === 2).length || 0;
      const openTasks = totalTasks - completedTasks;
      const overdueTasks = tasks?.filter((t: any) => {
        if (!t.due_date || t.status_id === 2 || t.status_id === 3) return false;
        return t.due_date < today;
      }).length || 0;

      const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      // Fetch risk count (open high risks for this tenant)
      const { count: highRiskCount } = await sb
        .from("risk_events")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("severity", "high")
        .in("status", ["open", "monitoring"]);

      // Fetch evidence gap mandatory count
      const { data: gapChecks } = await sb
        .from("evidence_gap_checks")
        .select("missing_categories_json")
        .eq("stage_instance_id", stageId)
        .order("generated_at", { ascending: false })
        .limit(1);

      let mandatoryGapCount = 0;
      if (gapChecks && gapChecks.length > 0 && gapChecks[0].missing_categories_json) {
        const missing = gapChecks[0].missing_categories_json as any[];
        mandatoryGapCount = missing.filter((m: any) => m.mandatory === true).length;
      }

      // Calculate days since last activity
      const lastUpdated = stage.updated_at || stage.started_at;
      const daysSinceActivity = lastUpdated
        ? Math.floor((Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Fetch consult hours logged
      const { data: consultLogs } = await sb
        .from("consult_log")
        .select("duration_minutes")
        .eq("tenant_id", tenantId);

      const consultHoursLogged = (consultLogs || []).reduce(
        (sum: number, c: any) => sum + (c.duration_minutes || 0) / 60,
        0
      );

      // Apply rules engine
      const metrics: Record<string, number> = {
        tasks_overdue_count: overdueTasks,
        high_risk_count: highRiskCount || 0,
        evidence_gap_mandatory_count: mandatoryGapCount,
        days_since_last_activity: daysSinceActivity,
        progress_percentage: progressPct,
        tasks_open_count: openTasks,
      };

      const severityOrder: Record<string, number> = {
        healthy: 0,
        monitoring: 1,
        at_risk: 2,
        critical: 3,
      };

      let healthStatus = "healthy";

      for (const rule of rules || []) {
        const metricVal = metrics[rule.metric_key];
        if (metricVal === undefined) continue;

        let triggered = false;
        switch (rule.comparison_operator) {
          case ">": triggered = metricVal > rule.threshold_value; break;
          case ">=": triggered = metricVal >= rule.threshold_value; break;
          case "<": triggered = metricVal < rule.threshold_value; break;
          case "<=": triggered = metricVal <= rule.threshold_value; break;
          case "=": triggered = metricVal === rule.threshold_value; break;
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
        high_risk_count: highRiskCount || 0,
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
          .insert(batch);
        if (insertErr) {
          console.error("Insert error batch", i, insertErr);
        }
      }
    }

    // 6. Refresh materialized view
    await sb.rpc("refresh_stage_health_trends" as any).catch(() => {
      console.log("Materialized view refresh via RPC not available, skipping");
    });

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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Stage health monitor error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
