/**
 * Reasoning Engine
 * 
 * Layer 3: Tiered reasoning - Status → Blockers → Risk → Actions.
 * AI never jumps tiers.
 */

import type {
  Fact,
  FactSet,
  ReasoningTier,
  TierResult,
  TierFinding,
  ReasoningOutput,
  EscalationTrigger,
  ConfidenceLevel,
} from "./types.ts";
import { computeConfidence } from "./confidence-scorer.ts";
import { detectEscalationTriggers } from "./escalation-detector.ts";

// ============= Tier Processing =============

/**
 * Process Tier 1: Status
 * What is true right now?
 */
function processTier1Status(facts: Fact[]): TierResult {
  const findings: TierFinding[] = [];
  const reasoningNotes: string[] = [];
  
  // Status facts
  const statusFacts = facts.filter(f => f.type.endsWith("_status") || f.type.endsWith("_summary"));
  
  for (const fact of statusFacts) {
    findings.push({
      id: `t1_${fact.id}`,
      tier: "status",
      summary: fact.label,
      details: fact.reason,
      severity: "info",
      source_facts: [fact.id],
      actionable: false,
    });
  }
  
  if (statusFacts.length === 0) {
    reasoningNotes.push("No status facts available - data may be incomplete");
  } else {
    reasoningNotes.push(`Identified ${statusFacts.length} status indicators`);
  }
  
  return {
    tier: "status",
    findings,
    can_proceed: true, // Can always proceed from status
    reasoning_notes: reasoningNotes,
  };
}

/**
 * Process Tier 2: Blockers
 * What prevents progress?
 */
function processTier2Blockers(facts: Fact[]): TierResult {
  const findings: TierFinding[] = [];
  const reasoningNotes: string[] = [];
  
  // Blocker facts
  const blockerFacts = facts.filter(f => 
    f.type === "phase_blocked" || 
    f.type === "task_blocked" ||
    f.type === "evidence_missing"
  );
  
  for (const fact of blockerFacts) {
    const severity = fact.type === "evidence_missing" ? "warning" : "critical";
    
    findings.push({
      id: `t2_${fact.id}`,
      tier: "blockers",
      summary: fact.label,
      details: fact.reason,
      severity,
      source_facts: [fact.id],
      actionable: true,
    });
  }
  
  if (blockerFacts.length === 0) {
    reasoningNotes.push("No active blockers detected");
  } else {
    reasoningNotes.push(`Found ${blockerFacts.length} blockers requiring attention`);
  }
  
  return {
    tier: "blockers",
    findings,
    can_proceed: true,
    reasoning_notes: reasoningNotes,
  };
}

/**
 * Process Tier 3: Risk
 * What increases audit exposure?
 */
function processTier3Risk(facts: Fact[]): TierResult {
  const findings: TierFinding[] = [];
  const reasoningNotes: string[] = [];
  
  // Risk facts
  const riskFacts = facts.filter(f => 
    f.category === "risk" ||
    f.type === "deadline_at_risk" ||
    f.type === "capacity_risk"
  );
  
  for (const fact of riskFacts) {
    const isCritical = 
      fact.type === "audit_exposure" ||
      (fact.type === "deadline_at_risk" && 
        typeof fact.value === "object" && 
        fact.value !== null &&
        "days_overdue" in fact.value);
    
    findings.push({
      id: `t3_${fact.id}`,
      tier: "risk",
      summary: fact.label,
      details: fact.reason,
      severity: isCritical ? "critical" : "warning",
      source_facts: [fact.id],
      actionable: true,
    });
  }
  
  if (riskFacts.length === 0) {
    reasoningNotes.push("No elevated risk indicators detected");
  } else {
    const critical = findings.filter(f => f.severity === "critical").length;
    reasoningNotes.push(`Identified ${riskFacts.length} risk factors (${critical} critical)`);
  }
  
  return {
    tier: "risk",
    findings,
    can_proceed: true,
    reasoning_notes: reasoningNotes,
  };
}

/**
 * Process Tier 4: Next Safe Actions
 * What a human could do next.
 */
function processTier4Actions(
  facts: Fact[],
  tier2Results: TierResult,
  tier3Results: TierResult
): TierResult {
  const findings: TierFinding[] = [];
  const reasoningNotes: string[] = [];
  
  // Generate action suggestions based on blockers and risks
  const blockerFindings = tier2Results.findings;
  const riskFindings = tier3Results.findings;
  
  // For each critical blocker, suggest resolution
  for (const blocker of blockerFindings.filter(f => f.severity === "critical")) {
    findings.push({
      id: `t4_resolve_${blocker.id}`,
      tier: "actions",
      summary: `Review and resolve: ${blocker.summary}`,
      details: "Human review required to determine resolution path",
      severity: "warning",
      source_facts: blocker.source_facts,
      actionable: true,
    });
  }
  
  // For critical risks, suggest review
  for (const risk of riskFindings.filter(f => f.severity === "critical")) {
    findings.push({
      id: `t4_review_${risk.id}`,
      tier: "actions",
      summary: `Assess risk: ${risk.summary}`,
      details: "Human assessment needed for risk mitigation strategy",
      severity: "warning",
      source_facts: risk.source_facts,
      actionable: true,
    });
  }
  
  // Check for evidence gaps
  const evidenceMissing = facts.filter(f => f.type === "evidence_missing");
  if (evidenceMissing.length > 0) {
    findings.push({
      id: `t4_evidence_gap`,
      tier: "actions",
      summary: "Upload missing evidence to progress phases",
      details: `${evidenceMissing.length} phases have evidence gaps`,
      severity: "info",
      source_facts: evidenceMissing.map(f => f.id),
      actionable: true,
    });
  }
  
  if (findings.length === 0) {
    reasoningNotes.push("No immediate actions required - continue monitoring");
  } else {
    reasoningNotes.push(`Suggested ${findings.length} actionable next steps`);
  }
  
  return {
    tier: "actions",
    findings,
    can_proceed: true,
    reasoning_notes: reasoningNotes,
  };
}

// ============= Main Reasoning Function =============

/**
 * Execute tiered reasoning on a fact set.
 * Tiers are processed sequentially: Status → Blockers → Risk → Actions.
 */
export function executeReasoning(factSet: FactSet): ReasoningOutput {
  const facts = factSet.facts;
  
  // Process tiers in order
  const tier1 = processTier1Status(facts);
  const tier2 = processTier2Blockers(facts);
  const tier3 = processTier3Risk(facts);
  const tier4 = processTier4Actions(facts, tier2, tier3);
  
  const tiers = [tier1, tier2, tier3, tier4];
  
  // Compute confidence
  const confidenceResult = computeConfidence(facts);
  
  // Detect escalation triggers
  const escalationTriggers = detectEscalationTriggers(facts, tiers);
  
  // Build final summary
  const finalSummary = buildFinalSummary(tiers, confidenceResult.level);
  
  return {
    tiers,
    final_summary: finalSummary,
    confidence: confidenceResult.level,
    escalation_required: escalationTriggers.length > 0,
    escalation_triggers: escalationTriggers,
  };
}

/**
 * Build a final summary from tier results.
 */
function buildFinalSummary(tiers: TierResult[], confidence: ConfidenceLevel): string {
  const parts: string[] = [];
  
  // Status summary
  const statusCount = tiers[0].findings.length;
  parts.push(`**Status:** ${statusCount} indicators reviewed`);
  
  // Blockers
  const blockerCount = tiers[1].findings.length;
  if (blockerCount > 0) {
    const critical = tiers[1].findings.filter(f => f.severity === "critical").length;
    parts.push(`**Blockers:** ${blockerCount} identified (${critical} critical)`);
  } else {
    parts.push(`**Blockers:** None detected`);
  }
  
  // Risks
  const riskCount = tiers[2].findings.length;
  if (riskCount > 0) {
    const critical = tiers[2].findings.filter(f => f.severity === "critical").length;
    parts.push(`**Risk Factors:** ${riskCount} identified (${critical} critical)`);
  } else {
    parts.push(`**Risk Factors:** None elevated`);
  }
  
  // Actions
  const actionCount = tiers[3].findings.length;
  if (actionCount > 0) {
    parts.push(`**Suggested Actions:** ${actionCount} next steps available`);
  }
  
  // Confidence
  parts.push(`\n*Confidence: ${confidence.toUpperCase()}*`);
  
  return parts.join("\n");
}

/**
 * Format reasoning output for prompt context.
 */
export function formatReasoningForPrompt(output: ReasoningOutput): string {
  const lines: string[] = [
    "=== TIERED REASONING RESULTS ===",
    "",
  ];
  
  for (const tier of output.tiers) {
    lines.push(`[${tier.tier.toUpperCase()}]`);
    
    if (tier.findings.length === 0) {
      lines.push("  No findings");
    } else {
      for (const finding of tier.findings) {
        const icon = finding.severity === "critical" ? "🔴" : 
                     finding.severity === "warning" ? "🟡" : "🔵";
        lines.push(`  ${icon} ${finding.summary}`);
        if (finding.details) {
          lines.push(`     └─ ${finding.details}`);
        }
      }
    }
    
    for (const note of tier.reasoning_notes) {
      lines.push(`  📝 ${note}`);
    }
    
    lines.push("");
  }
  
  if (output.escalation_triggers.length > 0) {
    lines.push("[ESCALATION ALERTS]");
    for (const trigger of output.escalation_triggers) {
      const icon = trigger.severity === "critical" ? "🚨" : "⚠️";
      lines.push(`  ${icon} ${trigger.message}`);
    }
    lines.push("");
  }
  
  lines.push(`Confidence: ${output.confidence.toUpperCase()}`);
  lines.push("================================", "");
  
  return lines.join("\n");
}
