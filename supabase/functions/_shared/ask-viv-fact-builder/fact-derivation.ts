/**
 * Fact Derivation
 *
 * Derives facts from retrieved data.
 * No raw rows returned - only derived, timestamped, traceable facts.
 */

import type {
  DerivedFact,
  TenantFactData,
  PackageFactData,
  PhaseFactData,
  TaskFactData,
  EvidenceFactData,
  ActionItemFactData,
  TimeFactData,
  PhaseBlocker,
} from "./types.ts";

/**
 * Derive tenant facts.
 */
export function deriveTenantFacts(tenant: TenantFactData, nowIso: string): DerivedFact[] {
  const facts: DerivedFact[] = [];

  // Tenant name
  facts.push({
    key: "tenant_name",
    value: tenant.name,
    reason: null,
    source_table: "tenants",
    source_ids: [tenant.id.toString()],
    derived_at: nowIso,
  });

  // Tenant status
  facts.push({
    key: "tenant_status",
    value: tenant.status,
    reason: tenant.status === "archived" ? "Tenant is archived" : null,
    source_table: "tenants",
    source_ids: [tenant.id.toString()],
    derived_at: nowIso,
  });

  // RTO ID if present
  if (tenant.rto_id) {
    facts.push({
      key: "tenant_rto_id",
      value: tenant.rto_id,
      reason: null,
      source_table: "tenants",
      source_ids: [tenant.id.toString()],
      derived_at: nowIso,
    });
  }

  // Risk level if present
  if (tenant.risk_level) {
    facts.push({
      key: "tenant_risk_level",
      value: tenant.risk_level,
      reason: tenant.risk_level === "High" ? "High risk client" : null,
      source_table: "tenants",
      source_ids: [tenant.id.toString()],
      derived_at: nowIso,
    });
  }

  return facts;
}

/**
 * Derive client facts (uses tenant as client in this context).
 */
export function deriveClientFacts(tenant: TenantFactData, nowIso: string): DerivedFact[] {
  const facts: DerivedFact[] = [];

  facts.push({
    key: "client_name",
    value: tenant.name,
    reason: null,
    source_table: "tenants",
    source_ids: [tenant.id.toString()],
    derived_at: nowIso,
  });

  facts.push({
    key: "client_status",
    value: tenant.status,
    reason: null,
    source_table: "tenants",
    source_ids: [tenant.id.toString()],
    derived_at: nowIso,
  });

  return facts;
}

/**
 * Derive package facts.
 */
export function derivePackageFacts(packages: PackageFactData[], nowIso: string): DerivedFact[] {
  const facts: DerivedFact[] = [];

  if (packages.length === 0) return facts;

  // Package count summary
  const activeCount = packages.filter(p => p.status === "active").length;
  facts.push({
    key: "package_count",
    value: { total: packages.length, active: activeCount },
    reason: null,
    source_table: "package_instances",
    source_ids: packages.map(p => p.id.toString()),
    derived_at: nowIso,
  });

  // Individual package status
  for (const pkg of packages) {
    facts.push({
      key: "package_status",
      value: {
        id: pkg.id,
        name: pkg.name,
        status: pkg.status,
        type: pkg.package_type,
      },
      reason: null,
      source_table: "package_instances",
      source_ids: [pkg.id.toString()],
      derived_at: nowIso,
    });

    // Consult hours tracking — now backed by package_instances' own
    // hours_included/hours_added/hours_used counters (see data-retrieval.ts),
    // not a stale total that never included used_hours.
    if (pkg.total_hours !== null && pkg.total_hours !== undefined) {
      const usedHours = pkg.used_hours || 0;
      const remainingHours = pkg.total_hours - usedHours;
      const percentUsed = pkg.total_hours > 0
        ? Math.round((usedHours / pkg.total_hours) * 100)
        : 0;

      facts.push({
        key: "package_hours",
        value: {
          package_id: pkg.id,
          package_name: pkg.name,
          total_hours: pkg.total_hours,
          used_hours: usedHours,
          remaining_hours: remainingHours,
          percent_used: percentUsed,
        },
        reason: percentUsed >= 90 ? "Hours nearly exhausted" : null,
        source_table: "package_instances",
        source_ids: [pkg.id.toString()],
        derived_at: nowIso,
      });
    }
  }

  return facts;
}

/**
 * Derive phase facts with real completion percentage (from the tasks that
 * actually belong to that stage) and real blocked/waiting reasons — this
 * function previously accepted a `tasks` parameter and never used it,
 * computing an identical, meaningless completion_percent for every phase
 * from the phases array itself.
 */
export function derivePhaseFacts(
  phases: PhaseFactData[],
  tasks: TaskFactData[],
  nowIso: string
): DerivedFact[] {
  const facts: DerivedFact[] = [];

  if (phases.length === 0) return facts;

  const now = new Date(nowIso);

  for (const phase of phases) {
    facts.push({
      key: "phase_status",
      value: {
        id: phase.id,
        title: phase.title,
        status: phase.status,
        stage_type: phase.stage_type,
        due_date: phase.due_date,
        blocked_reason: phase.blocked_reason,
        waiting_reason: phase.waiting_reason,
      },
      reason:
        phase.status === "blocked" ? (phase.blocked_reason || "Stage is blocked")
        : phase.status === "waiting" ? (phase.waiting_reason || "Stage is waiting")
        : null,
      source_table: "client_package_stage_state",
      source_ids: [phase.id.toString()],
      derived_at: nowIso,
    });

    // Completion from the tasks that actually belong to this stage.
    const stageTasks = tasks.filter(t => t.stage_id === phase.id);
    if (stageTasks.length > 0) {
      const completedCount = stageTasks.filter(t => t.completed).length;
      const completionPercent = Math.round((completedCount / stageTasks.length) * 100);

      facts.push({
        key: "phase_completion",
        value: {
          phase_id: phase.id,
          completion_percent: completionPercent,
          task_count: stageTasks.length,
        },
        reason: completionPercent < 50 ? "Less than 50% complete" : null,
        source_table: "tasks_tenants",
        source_ids: stageTasks.map(t => t.id),
        derived_at: nowIso,
      });
    }

    // Overdue phase (real due_at from client_package_stage_state, not a guess)
    if (
      phase.due_date &&
      phase.status !== "complete" &&
      phase.status !== "skipped" &&
      new Date(phase.due_date) < now
    ) {
      facts.push({
        key: "phase_overdue",
        value: { phase_id: phase.id, due_date: phase.due_date },
        reason: "Stage is overdue",
        source_table: "client_package_stage_state",
        source_ids: [phase.id.toString()],
        derived_at: nowIso,
      });
    }

    // Last activity date
    if (phase.updated_at) {
      facts.push({
        key: "phase_last_activity",
        value: phase.updated_at,
        reason: null,
        source_table: "client_package_stage_state",
        source_ids: [phase.id.toString()],
        derived_at: nowIso,
      });
    }
  }

  return facts;
}

/**
 * Derive task facts. `completed` (a proper boolean on tasks_tenants) is the
 * authority for whether a task is done — not a string-match against `status`,
 * which is free text.
 */
export function deriveTaskFacts(tasks: TaskFactData[], nowIso: string): DerivedFact[] {
  const facts: DerivedFact[] = [];

  if (tasks.length === 0) return facts;

  const incompleteTasks = tasks.filter(t => !t.completed);

  // Count overdue tasks
  const now = new Date(nowIso);
  const overdueTasks = incompleteTasks.filter(t => {
    if (!t.due_date) return false;
    return new Date(t.due_date) < now;
  });

  // Escalated tasks — a real signal (tasks_tenants.escalated_at) the previous
  // tasks source had no equivalent for.
  const escalatedTasks = incompleteTasks.filter(t => !!t.escalated_at);

  facts.push({
    key: "tasks_incomplete_count",
    value: incompleteTasks.length,
    reason: incompleteTasks.length > 10 ? "Many incomplete tasks" : null,
    source_table: "tasks_tenants",
    source_ids: incompleteTasks.map(t => t.id),
    derived_at: nowIso,
  });

  facts.push({
    key: "tasks_overdue_count",
    value: overdueTasks.length,
    reason: overdueTasks.length > 0 ? `${overdueTasks.length} tasks overdue` : null,
    source_table: "tasks_tenants",
    source_ids: overdueTasks.map(t => t.id),
    derived_at: nowIso,
  });

  if (escalatedTasks.length > 0) {
    facts.push({
      key: "tasks_escalated_count",
      value: escalatedTasks.length,
      reason: `${escalatedTasks.length} tasks escalated and still open`,
      source_table: "tasks_tenants",
      source_ids: escalatedTasks.map(t => t.id),
      derived_at: nowIso,
    });
  }

  // Next due task
  const upcomingTasks = incompleteTasks
    .filter(t => t.due_date && new Date(t.due_date) >= now)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());

  if (upcomingTasks.length > 0) {
    const nextTask = upcomingTasks[0];
    facts.push({
      key: "next_due_task",
      value: {
        id: nextTask.id,
        label: nextTask.task_name,
        due_date: nextTask.due_date,
      },
      reason: null,
      source_table: "tasks_tenants",
      source_ids: [nextTask.id],
      derived_at: nowIso,
    });
  }

  return facts;
}

/**
 * Derive action-item facts from client_action_items — the CSC/client-facing
 * action-item workboard, distinct from tasks_tenants and from audit
 * remediation actions.
 */
export function deriveActionItemFacts(items: ActionItemFactData[], nowIso: string): DerivedFact[] {
  const facts: DerivedFact[] = [];

  if (items.length === 0) return facts;

  const now = new Date(nowIso);
  const openItems = items.filter(i => i.status !== "done" && i.status !== "cancelled");
  const overdueItems = openItems.filter(i => i.due_date && new Date(i.due_date) < now);

  facts.push({
    key: "action_items_open_count",
    value: openItems.length,
    reason: null,
    source_table: "client_action_items",
    source_ids: openItems.map(i => i.id),
    derived_at: nowIso,
  });

  if (overdueItems.length > 0) {
    facts.push({
      key: "action_items_overdue_count",
      value: overdueItems.length,
      reason: `${overdueItems.length} action items overdue`,
      source_table: "client_action_items",
      source_ids: overdueItems.map(i => i.id),
      derived_at: nowIso,
    });
  }

  const upcoming = openItems
    .filter(i => i.due_date)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 5);

  if (upcoming.length > 0) {
    facts.push({
      key: "action_items_upcoming",
      value: upcoming.map(i => ({
        id: i.id,
        title: i.title,
        due_date: i.due_date,
        item_type: i.item_type,
      })),
      reason: null,
      source_table: "client_action_items",
      source_ids: upcoming.map(i => i.id),
      derived_at: nowIso,
    });
  }

  return facts;
}

/**
 * Derive evidence facts.
 */
export function deriveEvidenceFacts(evidence: EvidenceFactData[], nowIso: string): DerivedFact[] {
  const facts: DerivedFact[] = [];

  if (evidence.length === 0) return facts;

  // Count unreleased/missing evidence
  const unreleasedEvidence = evidence.filter(e => !e.is_released);

  facts.push({
    key: "evidence_unreleased_count",
    value: unreleasedEvidence.length,
    reason: unreleasedEvidence.length > 5 ? "Multiple documents pending release" : null,
    source_table: "documents",
    source_ids: unreleasedEvidence.map(e => e.id.toString()),
    derived_at: nowIso,
  });

  // Check for outdated evidence (past expiry)
  const now = new Date(nowIso);
  const outdatedEvidence = evidence.filter(e => {
    if (!e.expiry_date) return false;
    return new Date(e.expiry_date) < now;
  });

  if (outdatedEvidence.length > 0) {
    facts.push({
      key: "evidence_outdated_count",
      value: outdatedEvidence.length,
      reason: `${outdatedEvidence.length} documents past expiry`,
      source_table: "documents",
      source_ids: outdatedEvidence.map(e => e.id.toString()),
      derived_at: nowIso,
    });
  }

  // Last upload date
  const sortedByUpdate = [...evidence]
    .filter(e => e.updated_at)
    .sort((a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime());

  if (sortedByUpdate.length > 0) {
    facts.push({
      key: "evidence_last_upload",
      value: sortedByUpdate[0].updated_at,
      reason: null,
      source_table: "documents",
      source_ids: [sortedByUpdate[0].id.toString()],
      derived_at: nowIso,
    });
  }

  return facts;
}

/**
 * Derive time-logging facts from time_entries — the real, actively-populated
 * time ledger (fed by Calendar Time Capture / Time Inbox). Replaces the
 * previous consult_logs-derived facts; consult_logs is a legacy import table
 * that is completely empty in production, so this is a straight replacement.
 */
export function deriveTimeFacts(entries: TimeFactData[], nowIso: string): DerivedFact[] {
  const facts: DerivedFact[] = [];

  facts.push({
    key: "time_entry_count_30d",
    value: entries.length,
    reason: null,
    source_table: "time_entries",
    source_ids: entries.map(e => e.id),
    derived_at: nowIso,
  });

  const totalHours = Math.round((entries.reduce((sum, e) => sum + e.duration_minutes, 0) / 60) * 10) / 10;
  facts.push({
    key: "time_hours_30d",
    value: totalHours,
    reason: null,
    source_table: "time_entries",
    source_ids: entries.map(e => e.id),
    derived_at: nowIso,
  });

  if (entries.length > 0) {
    const sorted = [...entries].sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());
    const last = sorted[0];

    facts.push({
      key: "last_time_entry",
      value: {
        date: last.start_at,
        work_type: last.work_type,
        hours: Math.round((last.duration_minutes / 60) * 10) / 10,
        notes: last.notes,
      },
      reason: null,
      source_table: "time_entries",
      source_ids: [last.id],
      derived_at: nowIso,
    });
  }

  return facts;
}

/**
 * Derive phase blockers (v2) — now prepends real, human-authored blockers
 * from client_package_stage_state (blocked_reason / waiting_reason) ahead
 * of the heuristic-based ones, and correctly detects hours_exceeded now that
 * used_hours is actually populated.
 */
export function derivePhaseBlockers(
  phases: PhaseFactData[],
  tasks: TaskFactData[],
  evidence: EvidenceFactData[],
  packages: PackageFactData[],
  nowIso: string
): { fact: DerivedFact | null; blockers: PhaseBlocker[] } {
  const blockers: PhaseBlocker[] = [];
  const sourceIds: string[] = [];

  const now = new Date(nowIso);

  // 0. Real, human-authored stage blockers/waits — the strongest signal
  // available, and previously never read at all.
  const blockedPhases = phases.filter(p => p.status === "blocked");
  if (blockedPhases.length > 0) {
    blockers.push({
      type: "stage_blocked",
      label: blockedPhases[0].blocked_reason || "Stage blocked",
      count: blockedPhases.length,
      source_ids: blockedPhases.map(p => p.id.toString()),
    });
    sourceIds.push(...blockedPhases.map(p => p.id.toString()));
  }
  const waitingPhases = phases.filter(p => p.status === "waiting");
  if (waitingPhases.length > 0) {
    blockers.push({
      type: "stage_waiting",
      label: waitingPhases[0].waiting_reason || "Stage waiting",
      count: waitingPhases.length,
      source_ids: waitingPhases.map(p => p.id.toString()),
    });
    sourceIds.push(...waitingPhases.map(p => p.id.toString()));
  }

  // 1. Missing mandatory tasks (incomplete tasks)
  const incompleteTasks = tasks.filter(t => !t.completed);
  if (incompleteTasks.length > 0) {
    blockers.push({
      type: "missing_task",
      label: "Incomplete tasks",
      count: incompleteTasks.length,
      source_ids: incompleteTasks.map(t => t.id),
    });
    sourceIds.push(...incompleteTasks.map(t => t.id));
  }

  // 2. Missing required evidence (unreleased docs)
  const unreleasedEvidence = evidence.filter(e => !e.is_released);
  if (unreleasedEvidence.length > 0) {
    blockers.push({
      type: "missing_evidence",
      label: "Documents pending release",
      count: unreleasedEvidence.length,
      source_ids: unreleasedEvidence.map(e => e.id.toString()),
    });
    sourceIds.push(...unreleasedEvidence.map(e => e.id.toString()));
  }

  // 3. Hours exceeded — now reachable, since used_hours is actually populated
  // from package_instances.hours_used (previously always undefined -> 0).
  for (const pkg of packages) {
    if (pkg.total_hours && pkg.used_hours && pkg.used_hours >= pkg.total_hours) {
      blockers.push({
        type: "hours_exceeded",
        label: `Package "${pkg.name}" hours exhausted`,
        count: 1,
        source_ids: [pkg.id.toString()],
      });
      sourceIds.push(pkg.id.toString());
    }
  }

  // 4. Overdue tasks
  const overdueTasks = incompleteTasks.filter(t => {
    if (!t.due_date) return false;
    return new Date(t.due_date) < now;
  });
  if (overdueTasks.length > 0) {
    blockers.push({
      type: "overdue_task",
      label: "Overdue tasks",
      count: overdueTasks.length,
      source_ids: overdueTasks.map(t => t.id),
    });
    // Don't double-count source IDs already in missing_task
  }

  if (blockers.length === 0) {
    return { fact: null, blockers: [] };
  }

  const fact: DerivedFact = {
    key: "phase_blockers",
    value: blockers,
    reason: `${blockers.length} blocker types identified`,
    source_table: "mixed",
    source_ids: [...new Set(sourceIds)],
    derived_at: nowIso,
  };

  return { fact, blockers };
}
