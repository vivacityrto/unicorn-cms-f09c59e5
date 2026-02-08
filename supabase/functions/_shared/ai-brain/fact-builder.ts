/**
 * Fact Builder
 * 
 * Layer 2: Deterministic fact extraction from data.
 * AI never reads raw tables - only derived, timestamped, traceable facts.
 */

import type { 
  Fact, 
  FactSet, 
  FactType, 
  FactCategory 
} from "./types.ts";

// ============= Fact Creation Helpers =============

let factCounter = 0;

function createFact(
  type: FactType,
  category: FactCategory,
  value: unknown,
  label: string,
  reason: string | null,
  sourceTable: string,
  sourceIds: string[],
  freshnessScore: number = 1.0
): Fact {
  return {
    id: `fact_${++factCounter}_${Date.now()}`,
    type,
    category,
    value,
    label,
    reason,
    source_table: sourceTable,
    source_ids: sourceIds,
    timestamp: new Date().toISOString(),
    freshness_score: freshnessScore,
  };
}

/**
 * Calculate freshness score based on last update time.
 * 1.0 = updated within last hour
 * 0.5 = updated within last day
 * 0.25 = updated within last week
 * 0.1 = older than a week
 */
function calculateFreshness(lastUpdated: string | null): number {
  if (!lastUpdated) return 0.5;
  
  const updated = new Date(lastUpdated);
  const now = new Date();
  const hoursDiff = (now.getTime() - updated.getTime()) / (1000 * 60 * 60);
  
  if (hoursDiff < 1) return 1.0;
  if (hoursDiff < 24) return 0.75;
  if (hoursDiff < 168) return 0.5; // 7 days
  if (hoursDiff < 720) return 0.25; // 30 days
  return 0.1;
}

// ============= Client Facts =============

export interface ClientData {
  id: number;
  name: string;
  status: string;
  rto_id?: string | null;
  risk_level?: string | null;
  updated_at?: string | null;
}

export function buildClientFacts(client: ClientData): Fact[] {
  const facts: Fact[] = [];
  const freshness = calculateFreshness(client.updated_at || null);
  
  // Client status fact
  facts.push(createFact(
    "client_status",
    "client",
    { status: client.status, risk_level: client.risk_level },
    `Client "${client.name}" is ${client.status}`,
    client.risk_level ? `Risk level: ${client.risk_level}` : null,
    "tenants",
    [client.id.toString()],
    freshness
  ));
  
  return facts;
}

// ============= Package Facts =============

export interface PackageData {
  id: number;
  name: string;
  status: string;
  package_type?: string | null;
  total_hours?: number | null;
  used_hours?: number | null;
  updated_at?: string | null;
}

export function buildPackageFacts(packages: PackageData[]): Fact[] {
  const facts: Fact[] = [];
  
  for (const pkg of packages) {
    const freshness = calculateFreshness(pkg.updated_at || null);
    
    // Package status
    facts.push(createFact(
      "package_status",
      "package",
      { status: pkg.status, type: pkg.package_type },
      `Package "${pkg.name}": ${pkg.status}`,
      pkg.package_type ? `Type: ${pkg.package_type}` : null,
      "packages",
      [pkg.id.toString()],
      freshness
    ));
    
    // Capacity risk if hours nearly exhausted
    if (pkg.total_hours && pkg.used_hours) {
      const remaining = pkg.total_hours - pkg.used_hours;
      const percentUsed = (pkg.used_hours / pkg.total_hours) * 100;
      
      if (percentUsed >= 90) {
        facts.push(createFact(
          "capacity_risk",
          "risk",
          { remaining_hours: remaining, percent_used: percentUsed },
          `Package "${pkg.name}" is ${Math.round(percentUsed)}% consumed`,
          `Only ${remaining.toFixed(1)} hours remaining`,
          "packages",
          [pkg.id.toString()],
          freshness
        ));
      }
    }
  }
  
  // Package summary
  if (packages.length > 0) {
    const activeCount = packages.filter(p => p.status === "active").length;
    facts.push(createFact(
      "package_summary",
      "package",
      { total: packages.length, active: activeCount },
      `${packages.length} packages (${activeCount} active)`,
      null,
      "packages",
      packages.map(p => p.id.toString()),
      1.0
    ));
  }
  
  return facts;
}

// ============= Phase Facts =============

export interface PhaseData {
  id: number;
  title: string;
  status: string;
  stage_type?: string | null;
  completion_percent?: number | null;
  due_date?: string | null;
  updated_at?: string | null;
  blockers?: string[];
  required_evidence_count?: number;
  submitted_evidence_count?: number;
}

export function buildPhaseFacts(phases: PhaseData[]): Fact[] {
  const facts: Fact[] = [];
  
  for (const phase of phases) {
    const freshness = calculateFreshness(phase.updated_at || null);
    
    // Phase status
    facts.push(createFact(
      "phase_status",
      "phase",
      { 
        status: phase.status, 
        completion: phase.completion_percent,
        type: phase.stage_type 
      },
      `Phase "${phase.title}": ${phase.status}`,
      phase.completion_percent !== undefined 
        ? `${phase.completion_percent}% complete` 
        : null,
      "documents_stages",
      [phase.id.toString()],
      freshness
    ));
    
    // Phase blocked fact
    if (phase.blockers && phase.blockers.length > 0) {
      facts.push(createFact(
        "phase_blocked",
        "phase",
        { blocked: true, blockers: phase.blockers },
        `Phase "${phase.title}" is blocked`,
        `Blockers: ${phase.blockers.join(", ")}`,
        "documents_stages",
        [phase.id.toString()],
        freshness
      ));
    }
    
    // Evidence missing fact
    if (phase.required_evidence_count !== undefined && 
        phase.submitted_evidence_count !== undefined) {
      const missing = phase.required_evidence_count - phase.submitted_evidence_count;
      if (missing > 0) {
        facts.push(createFact(
          "evidence_missing",
          "evidence",
          { 
            required: phase.required_evidence_count, 
            submitted: phase.submitted_evidence_count,
            missing 
          },
          `Phase "${phase.title}" missing ${missing} evidence items`,
          `${phase.submitted_evidence_count}/${phase.required_evidence_count} submitted`,
          "documents_stages",
          [phase.id.toString()],
          freshness
        ));
      }
    }
    
    // Deadline at risk
    if (phase.due_date && phase.status !== "complete") {
      const dueDate = new Date(phase.due_date);
      const now = new Date();
      const daysUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysUntilDue <= 7 && daysUntilDue > 0) {
        facts.push(createFact(
          "deadline_at_risk",
          "risk",
          { days_remaining: Math.ceil(daysUntilDue), due_date: phase.due_date },
          `Phase "${phase.title}" due in ${Math.ceil(daysUntilDue)} days`,
          `Due date: ${phase.due_date}`,
          "documents_stages",
          [phase.id.toString()],
          freshness
        ));
      } else if (daysUntilDue <= 0) {
        facts.push(createFact(
          "deadline_at_risk",
          "risk",
          { days_overdue: Math.abs(Math.floor(daysUntilDue)), due_date: phase.due_date },
          `Phase "${phase.title}" is OVERDUE`,
          `Was due: ${phase.due_date}`,
          "documents_stages",
          [phase.id.toString()],
          1.0 // Overdue is always fresh/relevant
        ));
      }
    }
  }
  
  // Phase summary
  if (phases.length > 0) {
    const completed = phases.filter(p => p.status === "complete").length;
    const blocked = phases.filter(p => p.blockers && p.blockers.length > 0).length;
    facts.push(createFact(
      "phase_summary",
      "phase",
      { total: phases.length, completed, blocked },
      `${phases.length} phases (${completed} complete, ${blocked} blocked)`,
      null,
      "documents_stages",
      phases.map(p => p.id.toString()),
      1.0
    ));
  }
  
  return facts;
}

// ============= Task Facts =============

export interface TaskData {
  id: string;
  task_name: string;
  status: string;
  priority?: string | null;
  due_date?: string | null;
  updated_at?: string | null;
  blockers?: string[];
}

export function buildTaskFacts(tasks: TaskData[]): Fact[] {
  const facts: Fact[] = [];
  
  for (const task of tasks) {
    const freshness = calculateFreshness(task.updated_at || null);
    
    // Task status
    facts.push(createFact(
      "task_status",
      "task",
      { status: task.status, priority: task.priority },
      `Task "${task.task_name}": ${task.status}`,
      task.priority ? `Priority: ${task.priority}` : null,
      "tasks",
      [task.id],
      freshness
    ));
    
    // Task blocked
    if (task.blockers && task.blockers.length > 0) {
      facts.push(createFact(
        "task_blocked",
        "task",
        { blocked: true, blockers: task.blockers },
        `Task "${task.task_name}" is blocked`,
        task.blockers.join(", "),
        "tasks",
        [task.id],
        freshness
      ));
    }
  }
  
  // Task summary
  if (tasks.length > 0) {
    const completed = tasks.filter(t => 
      t.status === "complete" || t.status === "done"
    ).length;
    const blocked = tasks.filter(t => t.blockers && t.blockers.length > 0).length;
    
    facts.push(createFact(
      "task_summary",
      "task",
      { total: tasks.length, completed, blocked },
      `${tasks.length} tasks (${completed} complete, ${blocked} blocked)`,
      null,
      "tasks",
      tasks.map(t => t.id),
      1.0
    ));
  }
  
  return facts;
}

// ============= Evidence Facts =============

export interface EvidenceData {
  id: number;
  title: string;
  status: string;
  is_released?: boolean;
  uploaded_at?: string | null;
  updated_at?: string | null;
}

export function buildEvidenceFacts(evidence: EvidenceData[]): Fact[] {
  const facts: Fact[] = [];
  
  for (const item of evidence) {
    const freshness = calculateFreshness(item.updated_at || item.uploaded_at || null);
    
    facts.push(createFact(
      "evidence_status",
      "evidence",
      { status: item.status, released: item.is_released },
      `Evidence "${item.title}": ${item.status}`,
      item.is_released ? "Released" : "Draft",
      "documents",
      [item.id.toString()],
      freshness
    ));
  }
  
  // Evidence summary
  if (evidence.length > 0) {
    const released = evidence.filter(e => e.is_released).length;
    facts.push(createFact(
      "evidence_summary",
      "evidence",
      { total: evidence.length, released },
      `${evidence.length} evidence items (${released} released)`,
      null,
      "documents",
      evidence.map(e => e.id.toString()),
      1.0
    ));
  }
  
  return facts;
}

// ============= Consult Facts =============

export interface ConsultData {
  id: string;
  date: string;
  purpose?: string | null;
  duration_minutes?: number | null;
  outcomes?: string | null;
}

export function buildConsultFacts(consults: ConsultData[]): Fact[] {
  const facts: Fact[] = [];
  
  // Consult summary only (individual consults not exposed)
  if (consults.length > 0) {
    const totalMinutes = consults.reduce((sum, c) => sum + (c.duration_minutes || 0), 0);
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
    
    facts.push(createFact(
      "consult_summary",
      "consult",
      { total_sessions: consults.length, total_hours: totalHours },
      `${consults.length} consultation sessions (${totalHours}h total)`,
      null,
      "time_entries",
      consults.map(c => c.id),
      1.0
    ));
  }
  
  return facts;
}

// ============= Risk Facts =============

export interface RiskData {
  id: string;
  item_type: string;
  title: string;
  status: string;
  impact?: string | null;
  category?: string | null;
}

export function buildRiskFacts(risks: RiskData[]): Fact[] {
  const facts: Fact[] = [];
  
  // Count by impact
  const criticalRisks = risks.filter(r => r.impact === "Critical");
  const highRisks = risks.filter(r => r.impact === "High");
  
  if (criticalRisks.length > 0) {
    facts.push(createFact(
      "audit_exposure",
      "risk",
      { 
        critical_count: criticalRisks.length,
        risks: criticalRisks.map(r => ({ id: r.id, title: r.title }))
      },
      `${criticalRisks.length} CRITICAL risks require attention`,
      criticalRisks.map(r => r.title).join(", "),
      "eos_issues",
      criticalRisks.map(r => r.id),
      1.0
    ));
  }
  
  if (highRisks.length > 0) {
    facts.push(createFact(
      "compliance_gap",
      "risk",
      { high_count: highRisks.length },
      `${highRisks.length} HIGH impact risks identified`,
      null,
      "eos_issues",
      highRisks.map(r => r.id),
      1.0
    ));
  }
  
  return facts;
}

// ============= Master Fact Set Builder =============

export interface DataForFacts {
  client?: ClientData;
  packages?: PackageData[];
  phases?: PhaseData[];
  tasks?: TaskData[];
  evidence?: EvidenceData[];
  consults?: ConsultData[];
  risks?: RiskData[];
}

export function buildFactSet(tenantId: number, data: DataForFacts): FactSet {
  const facts: Fact[] = [];
  const categories = new Set<FactCategory>();
  
  // Reset counter for each fact set
  factCounter = 0;
  
  if (data.client) {
    facts.push(...buildClientFacts(data.client));
    categories.add("client");
  }
  
  if (data.packages && data.packages.length > 0) {
    facts.push(...buildPackageFacts(data.packages));
    categories.add("package");
  }
  
  if (data.phases && data.phases.length > 0) {
    facts.push(...buildPhaseFacts(data.phases));
    categories.add("phase");
  }
  
  if (data.tasks && data.tasks.length > 0) {
    facts.push(...buildTaskFacts(data.tasks));
    categories.add("task");
  }
  
  if (data.evidence && data.evidence.length > 0) {
    facts.push(...buildEvidenceFacts(data.evidence));
    categories.add("evidence");
  }
  
  if (data.consults && data.consults.length > 0) {
    facts.push(...buildConsultFacts(data.consults));
    categories.add("consult");
  }
  
  if (data.risks && data.risks.length > 0) {
    facts.push(...buildRiskFacts(data.risks));
    categories.add("risk");
  }
  
  return {
    facts,
    generated_at: new Date().toISOString(),
    tenant_id: tenantId,
    fact_count: facts.length,
    categories: Array.from(categories),
  };
}

/**
 * Format facts for prompt injection.
 */
export function formatFactsForPrompt(factSet: FactSet): string {
  const lines: string[] = [
    "=== CURRENT STATE FACTS ===",
    `(${factSet.fact_count} facts generated at ${factSet.generated_at})`,
    "",
  ];
  
  // Group by category
  const byCategory = new Map<FactCategory, Fact[]>();
  for (const fact of factSet.facts) {
    const existing = byCategory.get(fact.category) || [];
    existing.push(fact);
    byCategory.set(fact.category, existing);
  }
  
  for (const [category, facts] of byCategory) {
    lines.push(`[${category.toUpperCase()}]`);
    for (const fact of facts) {
      lines.push(`• ${fact.label}`);
      if (fact.reason) lines.push(`  └─ ${fact.reason}`);
    }
    lines.push("");
  }
  
  lines.push("===========================", "");
  
  return lines.join("\n");
}
