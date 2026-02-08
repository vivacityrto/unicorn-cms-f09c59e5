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
  ConsultFactData,
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
    source_table: "packages",
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
      source_table: "packages",
      source_ids: [pkg.id.toString()],
      derived_at: nowIso,
    });

    // Consult hours tracking
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
        source_table: "packages",
        source_ids: [pkg.id.toString()],
        derived_at: nowIso,
      });
    }
  }

  return facts;
}

/**
 * Derive phase facts with completion percentage.
 */
export function derivePhaseFacts(
  phases: PhaseFactData[], 
  tasks: TaskFactData[],
  nowIso: string
): DerivedFact[] {
  const facts: DerivedFact[] = [];

  if (phases.length === 0) return facts;

  for (const phase of phases) {
    // Current phase status
    facts.push({
      key: "phase_status",
      value: {
        id: phase.id,
        title: phase.title,
        status: phase.status,
        stage_type: phase.stage_type,
      },
      reason: null,
      source_table: "documents_stages",
      source_ids: [phase.id.toString()],
      derived_at: nowIso,
    });

    // Completion percentage (derive from tasks if available)
    // For now, we use a simple heuristic
    const completedCount = phases.filter(p => 
      p.status === "complete" || p.status === "completed"
    ).length;
    const completionPercent = phases.length > 0 
      ? Math.round((completedCount / phases.length) * 100)
      : 0;

    facts.push({
      key: "phase_completion",
      value: {
        phase_id: phase.id,
        completion_percent: completionPercent,
      },
      reason: completionPercent < 50 ? "Less than 50% complete" : null,
      source_table: "documents_stages",
      source_ids: [phase.id.toString()],
      derived_at: nowIso,
    });

    // Last activity date
    if (phase.updated_at) {
      facts.push({
        key: "phase_last_activity",
        value: phase.updated_at,
        reason: null,
        source_table: "documents_stages",
        source_ids: [phase.id.toString()],
        derived_at: nowIso,
      });
    }
  }

  return facts;
}

/**
 * Derive task facts.
 */
export function deriveTaskFacts(tasks: TaskFactData[], nowIso: string): DerivedFact[] {
  const facts: DerivedFact[] = [];

  if (tasks.length === 0) return facts;

  // Count incomplete mandatory tasks (assume all tasks are mandatory for now)
  const incompleteTasks = tasks.filter(t => 
    t.status !== "complete" && t.status !== "done" && t.status !== "completed"
  );
  
  // Count overdue tasks
  const now = new Date(nowIso);
  const overdueTasks = incompleteTasks.filter(t => {
    if (!t.due_date) return false;
    return new Date(t.due_date) < now;
  });

  facts.push({
    key: "tasks_incomplete_count",
    value: incompleteTasks.length,
    reason: incompleteTasks.length > 10 ? "Many incomplete tasks" : null,
    source_table: "tasks",
    source_ids: incompleteTasks.map(t => t.id),
    derived_at: nowIso,
  });

  facts.push({
    key: "tasks_overdue_count",
    value: overdueTasks.length,
    reason: overdueTasks.length > 0 ? `${overdueTasks.length} tasks overdue` : null,
    source_table: "tasks",
    source_ids: overdueTasks.map(t => t.id),
    derived_at: nowIso,
  });

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
      source_table: "tasks",
      source_ids: [nextTask.id],
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
 * Derive consult facts.
 */
export function deriveConsultFacts(consults: ConsultFactData[], nowIso: string): DerivedFact[] {
  const facts: DerivedFact[] = [];

  // Consult count last 30 days
  facts.push({
    key: "consult_count_30d",
    value: consults.length,
    reason: null,
    source_table: "consult_logs",
    source_ids: consults.map(c => c.id),
    derived_at: nowIso,
  });

  // Total hours logged
  const totalHours = consults.reduce((sum, c) => sum + c.hours, 0);
  facts.push({
    key: "consult_hours_30d",
    value: Math.round(totalHours * 10) / 10,
    reason: null,
    source_table: "consult_logs",
    source_ids: consults.map(c => c.id),
    derived_at: nowIso,
  });

  // Last consult summary
  if (consults.length > 0) {
    const sortedConsults = [...consults].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const lastConsult = sortedConsults[0];

    facts.push({
      key: "last_consult",
      value: {
        date: lastConsult.date,
        task: lastConsult.task,
        consultant: lastConsult.consultant,
        hours: lastConsult.hours,
      },
      reason: null,
      source_table: "consult_logs",
      source_ids: [lastConsult.id],
      derived_at: nowIso,
    });
  }

  return facts;
}

/**
 * Derive phase blockers (v1).
 */
export function derivePhaseBlockers(
  tasks: TaskFactData[],
  evidence: EvidenceFactData[],
  packages: PackageFactData[],
  nowIso: string
): { fact: DerivedFact | null; blockers: PhaseBlocker[] } {
  const blockers: PhaseBlocker[] = [];
  const sourceIds: string[] = [];

  const now = new Date(nowIso);

  // 1. Missing mandatory tasks (incomplete tasks)
  const incompleteTasks = tasks.filter(t => 
    t.status !== "complete" && t.status !== "done" && t.status !== "completed"
  );
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

  // 3. Consult hours exceeded
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
