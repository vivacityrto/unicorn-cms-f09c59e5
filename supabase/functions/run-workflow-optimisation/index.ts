/**
 * run-workflow-optimisation – Unicorn 2.0 Phase 16
 *
 * Nightly engine detecting workflow bottlenecks, sequencing issues,
 * workload imbalances, and repeated rework patterns.
 * Does NOT auto-reassign, auto-complete, or alter compliance state.
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
    const signals: any[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const d60 = new Date(Date.now() - 60 * 86400000).toISOString();

    // ─── 1) Bottleneck Detection ───
    // Find active stage instances stalled beyond average
    const { data: stageInstances } = await sb
      .from("stage_instances")
      .select("id, package_instance_id, stage_id, status, started_at, tenant_id")
      .in("status", ["in_progress", "active"])
      .not("started_at", "is", null);

    // Get performance baselines
    const { data: baselines } = await sb
      .from("workflow_performance_metrics")
      .select("stage_type, average_completion_days");

    const baselineMap = new Map<string, number>();
    (baselines ?? []).forEach((b: any) =>
      baselineMap.set(b.stage_type, Number(b.average_completion_days) || 30)
    );

    const now = Date.now();
    for (const si of stageInstances ?? []) {
      const startMs = new Date(si.started_at).getTime();
      const daysSinceStart = (now - startMs) / 86400000;
      const avgDays = baselineMap.get(String(si.stage_id)) ?? 30;

      if (daysSinceStart > avgDays * 1.5) {
        const severity = daysSinceStart > avgDays * 3 ? "high" : daysSinceStart > avgDays * 2 ? "moderate" : "low";
        signals.push({
          tenant_id: si.tenant_id,
          stage_instance_id: si.id,
          signal_type: "bottleneck_detected",
          signal_severity: severity,
          signal_summary: `Stage stalled for ${Math.round(daysSinceStart)} days (avg: ${Math.round(avgDays)} days)`,
          suggested_action_json: [
            "Review stage health",
            "Schedule consult to unblock",
            "Check evidence gaps",
          ],
        });
      }
    }

    // ─── 2) Workload Imbalance Detection ───
    const { data: capacitySnapshots } = await sb
      .from("consultant_capacity_snapshots")
      .select("user_id, capacity_utilisation_percentage, active_client_count")
      .order("snapshot_date", { ascending: false })
      .limit(100);

    // Deduplicate: latest per consultant
    const latestCapacity = new Map<string, any>();
    (capacitySnapshots ?? []).forEach((c: any) => {
      if (!latestCapacity.has(c.user_id)) latestCapacity.set(c.user_id, c);
    });

    const capacities = Array.from(latestCapacity.values());
    const overloaded = capacities.filter((c) => c.capacity_utilisation_percentage > 120);
    const underloaded = capacities.filter((c) => c.capacity_utilisation_percentage < 60);

    if (overloaded.length > 0 && underloaded.length > 0) {
      for (const over of overloaded) {
        signals.push({
          consultant_user_id: over.user_id,
          signal_type: "workload_imbalance",
          signal_severity: "high",
          signal_summary: `Consultant at ${Math.round(over.capacity_utilisation_percentage)}% capacity while ${underloaded.length} colleague(s) are below 60%`,
          suggested_action_json: [
            "Review consultant assignment distribution",
            "Consider rebalancing advisory support",
            "Check high-risk stage concentration",
          ],
        });
      }
    } else if (overloaded.length > 0) {
      for (const over of overloaded) {
        signals.push({
          consultant_user_id: over.user_id,
          signal_type: "workload_imbalance",
          signal_severity: "moderate",
          signal_summary: `Consultant at ${Math.round(over.capacity_utilisation_percentage)}% capacity — overload risk`,
          suggested_action_json: [
            "Review workload distribution",
            "Assess priority of active stages",
          ],
        });
      }
    }

    // ─── 3) Repeated Rework Detection ───
    // Tasks reopened > 2 times
    const { data: reworkTasks } = await sb
      .from("tasks")
      .select("id, title, tenant_id, reopen_count")
      .gt("reopen_count", 2)
      .gte("updated_at", d60);

    for (const task of reworkTasks ?? []) {
      signals.push({
        tenant_id: task.tenant_id,
        signal_type: "repeated_rework",
        signal_severity: task.reopen_count > 4 ? "high" : "moderate",
        signal_summary: `Task "${(task.title ?? "").slice(0, 60)}" reopened ${task.reopen_count} times`,
        suggested_action_json: [
          "Review task clarity and requirements",
          "Check template guidance",
          "Discuss with assigned consultant",
        ],
      });
    }

    // ─── 4) Stalled Stage Detection (no task activity in 21+ days) ───
    for (const si of stageInstances ?? []) {
      const { count: recentTaskActivity } = await sb
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("stage_id", si.id)
        .gte("updated_at", new Date(now - 21 * 86400000).toISOString());

      if ((recentTaskActivity ?? 0) === 0) {
        const alreadyBottleneck = signals.some(
          (s) => s.stage_instance_id === si.id && s.signal_type === "bottleneck_detected"
        );
        if (!alreadyBottleneck) {
          signals.push({
            tenant_id: si.tenant_id,
            stage_instance_id: si.id,
            signal_type: "stalled_stage",
            signal_severity: "moderate",
            signal_summary: `No task activity for 21+ days on active stage`,
            suggested_action_json: [
              "Review stage health",
              "Schedule consult",
              "Check if stage is blocked",
            ],
          });
        }
      }
    }

    // ─── Insert Signals ───
    if (signals.length > 0) {
      const { error: insErr } = await sb
        .from("workflow_optimisation_signals")
        .insert(signals);
      if (insErr) throw insErr;
    }

    // Refresh materialized view
    await sb.rpc("refresh_materialized_view", {
      view_name: "v_workflow_efficiency_trends",
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        signals_generated: signals.length,
        summary: {
          bottleneck: signals.filter((s) => s.signal_type === "bottleneck_detected").length,
          imbalance: signals.filter((s) => s.signal_type === "workload_imbalance").length,
          rework: signals.filter((s) => s.signal_type === "repeated_rework").length,
          stalled: signals.filter((s) => s.signal_type === "stalled_stage").length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("run-workflow-optimisation error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
