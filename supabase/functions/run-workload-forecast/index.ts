/**
 * run-workload-forecast – Unicorn 2.0 Phase 10
 *
 * Nightly scheduled function that:
 * 1. Calculates consultant workload snapshots (tasks, stages, hours, utilisation)
 * 2. Forecasts package hour burn and projected exhaustion dates
 * 3. Assigns risk statuses based on thresholds
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
    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    // ── STEP 1: Consultant Workload Snapshots ──

    // Get all vivacity staff with capacity profiles
    const { data: staffUsers } = await sb
      .from("users")
      .select("user_uuid")
      .eq("is_vivacity_internal", true);

    const workloadSnapshots: any[] = [];

    for (const user of staffUsers || []) {
      const userId = user.user_uuid;

      // Get capacity profile (or use defaults)
      const { data: profile } = await sb
        .from("consultant_capacity_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      const weeklyCapacity = profile
        ? Number(profile.effective_weekly_capacity_hours)
        : 5 * 7.5 * 0.8; // default: 30hrs

      // Open tasks assigned to this user
      const { count: openTasks } = await sb
        .from("staff_task_instances")
        .select("id", { count: "exact", head: true })
        .eq("assignee_id", userId)
        .in("status_id", [0, 1]);

      // Overdue tasks
      const { count: overdueTasks } = await sb
        .from("staff_task_instances")
        .select("id", { count: "exact", head: true })
        .eq("assignee_id", userId)
        .in("status_id", [0, 1])
        .lt("due_date", today);

      // Active stages (via package assignments - approximate via tasks)
      const { data: stageIds } = await sb
        .from("staff_task_instances")
        .select("stageinstance_id")
        .eq("assignee_id", userId)
        .in("status_id", [0, 1]);

      const uniqueStages = new Set(
        (stageIds || []).map((t: any) => t.stageinstance_id).filter(Boolean)
      );
      const activeStagesCount = uniqueStages.size;

      // High risk stages
      let highRiskStagesCount = 0;
      if (uniqueStages.size > 0) {
        const { count } = await sb
          .from("stage_health_snapshots")
          .select("id", { count: "exact", head: true })
          .in("stage_instance_id", [...uniqueStages] as number[])
          .in("health_status", ["at_risk", "critical"])
          .eq("snapshot_date", today);
        highRiskStagesCount = count || 0;
      }

      // Consult hours last 30 days
      const { data: consultLogs } = await sb
        .from("consult_log")
        .select("duration_minutes")
        .eq("consultant_id", userId)
        .gte("session_date", thirtyDaysAgo.split("T")[0]);

      const hoursLast30 = (consultLogs || []).reduce(
        (sum: number, c: any) => sum + (c.duration_minutes || 0) / 60,
        0
      );

      // Forecast: use historical rate * active stage multiplier
      const avgHoursPerStage = activeStagesCount > 0 ? hoursLast30 / Math.max(activeStagesCount, 1) : 2;
      const forecastHours = activeStagesCount * avgHoursPerStage * 1.1; // 10% buffer

      // Capacity utilisation
      const monthlyCapacity = weeklyCapacity * 4;
      const utilisationPct = monthlyCapacity > 0
        ? Math.round((forecastHours / monthlyCapacity) * 100)
        : 0;

      // Risk status
      let overloadStatus = "stable";
      if (utilisationPct >= 110) overloadStatus = "critical";
      else if (utilisationPct >= 90) overloadStatus = "high";
      else if (utilisationPct >= 70) overloadStatus = "elevated";

      // Check max concurrent high risk stages
      const maxHighRisk = profile?.max_concurrent_high_risk_stages ?? 3;
      if (highRiskStagesCount > maxHighRisk && overloadStatus !== "critical") {
        overloadStatus = "high";
      }

      workloadSnapshots.push({
        user_id: userId,
        snapshot_date: today,
        open_tasks_count: openTasks || 0,
        overdue_tasks_count: overdueTasks || 0,
        active_stages_count: activeStagesCount,
        high_risk_stages_count: highRiskStagesCount,
        consult_hours_last_30_days: Math.round(hoursLast30 * 100) / 100,
        forecast_hours_next_30_days: Math.round(forecastHours * 100) / 100,
        capacity_utilisation_percentage: utilisationPct,
        overload_risk_status: overloadStatus,
      });
    }

    // Batch insert workload snapshots
    if (workloadSnapshots.length > 0) {
      const { error } = await sb
        .from("workload_snapshots")
        .insert(workloadSnapshots);
      if (error) console.error("Workload insert error:", error);
    }

    // ── STEP 2: Package Burn Forecasts ──

    const { data: packages } = await sb
      .from("package_instances")
      .select("id, tenant_id, hours_included, hours_used, hours_added")
      .gt("hours_included", 0);

    const burnForecasts: any[] = [];

    for (const pkg of packages || []) {
      const totalAllocated = (pkg.hours_included || 0) + (pkg.hours_added || 0);
      const hoursUsed = pkg.hours_used || 0;
      const remaining = totalAllocated - hoursUsed;

      // Get monthly usage over last 3 months
      const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
      const { data: recentLogs } = await sb
        .from("consult_log")
        .select("duration_minutes")
        .eq("tenant_id", pkg.tenant_id)
        .gte("session_date", threeMonthsAgo);

      const totalRecentHours = (recentLogs || []).reduce(
        (sum: number, c: any) => sum + (c.duration_minutes || 0) / 60,
        0
      );
      const avgMonthlyUsage = totalRecentHours / 3;

      // Projected exhaustion
      let exhaustionDate: string | null = null;
      let burnStatus = "on_track";

      if (avgMonthlyUsage > 0 && remaining > 0) {
        const monthsRemaining = remaining / avgMonthlyUsage;
        const exhaustion = new Date();
        exhaustion.setMonth(exhaustion.getMonth() + Math.floor(monthsRemaining));
        exhaustionDate = exhaustion.toISOString().split("T")[0];

        if (monthsRemaining < 3) burnStatus = "critical";
        else if (monthsRemaining < 6) burnStatus = "accelerated";
      } else if (remaining <= 0) {
        burnStatus = "critical";
        exhaustionDate = today;
      }

      burnForecasts.push({
        tenant_id: pkg.tenant_id,
        package_id: pkg.id,
        total_hours_allocated: totalAllocated,
        hours_used_to_date: hoursUsed,
        average_monthly_usage: Math.round(avgMonthlyUsage * 100) / 100,
        projected_exhaustion_date: exhaustionDate,
        burn_risk_status: burnStatus,
      });
    }

    // Batch insert burn forecasts
    if (burnForecasts.length > 0) {
      const { error } = await sb
        .from("tenant_package_burn_forecast")
        .insert(burnForecasts);
      if (error) console.error("Burn forecast insert error:", error);
    }

    return new Response(
      JSON.stringify({
        message: "Workload forecast completed",
        workload_snapshots: workloadSnapshots.length,
        burn_forecasts: burnForecasts.length,
        workload_summary: {
          stable: workloadSnapshots.filter((s) => s.overload_risk_status === "stable").length,
          elevated: workloadSnapshots.filter((s) => s.overload_risk_status === "elevated").length,
          high: workloadSnapshots.filter((s) => s.overload_risk_status === "high").length,
          critical: workloadSnapshots.filter((s) => s.overload_risk_status === "critical").length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Workload forecast error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
