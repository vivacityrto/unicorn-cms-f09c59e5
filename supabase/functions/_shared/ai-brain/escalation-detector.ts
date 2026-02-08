/**
 * Escalation Detector
 * 
 * Layer 5: Auto-detect conditions requiring escalation.
 * Creates alerts, not actions.
 */

import type {
  Fact,
  TierResult,
  EscalationTrigger,
  EscalationTriggerType,
} from "./types.ts";

/**
 * Detect escalation triggers from facts and tier results.
 */
export function detectEscalationTriggers(
  facts: Fact[],
  tiers: TierResult[]
): EscalationTrigger[] {
  const triggers: EscalationTrigger[] = [];
  
  // Check each trigger type
  triggers.push(...detectHighRiskDeadline(facts));
  triggers.push(...detectConflictingEvidence(facts));
  triggers.push(...detectPhaseBypassAttempt(facts, tiers));
  triggers.push(...detectCriticalComplianceGap(facts));
  triggers.push(...detectCapacityExceeded(facts));
  
  return triggers;
}

/**
 * Detect: High risk + approaching deadline
 */
function detectHighRiskDeadline(facts: Fact[]): EscalationTrigger[] {
  const triggers: EscalationTrigger[] = [];
  
  // Find deadline risks
  const deadlineRisks = facts.filter(f => f.type === "deadline_at_risk");
  
  // Find critical/high impact risks
  const criticalRisks = facts.filter(f => 
    f.type === "audit_exposure" || 
    f.type === "compliance_gap"
  );
  
  // If both exist, escalate
  if (deadlineRisks.length > 0 && criticalRisks.length > 0) {
    // Check for overdue + critical
    const overdue = deadlineRisks.find(f => 
      typeof f.value === "object" && 
      f.value !== null &&
      "days_overdue" in f.value
    );
    
    if (overdue) {
      triggers.push({
        type: "high_risk_deadline",
        severity: "critical",
        message: `CRITICAL: ${criticalRisks.length} high-impact risks with overdue deadlines`,
        source_facts: [...deadlineRisks.map(f => f.id), ...criticalRisks.map(f => f.id)],
        suggested_action: "Immediate review required. Escalate to leadership.",
        triggered_at: new Date().toISOString(),
      });
    } else {
      // Approaching deadline
      const urgent = deadlineRisks.find(f => {
        if (typeof f.value !== "object" || f.value === null) return false;
        const days = (f.value as any).days_remaining;
        return typeof days === "number" && days <= 3;
      });
      
      if (urgent) {
        triggers.push({
          type: "high_risk_deadline",
          severity: "warning",
          message: `High-impact risks with deadlines within 3 days`,
          source_facts: [...deadlineRisks.map(f => f.id), ...criticalRisks.map(f => f.id)],
          suggested_action: "Prioritize resolution or request extension.",
          triggered_at: new Date().toISOString(),
        });
      }
    }
  }
  
  return triggers;
}

/**
 * Detect: Conflicting evidence
 */
function detectConflictingEvidence(facts: Fact[]): EscalationTrigger[] {
  const triggers: EscalationTrigger[] = [];
  
  // Look for phases marked complete but with missing evidence
  const completedPhases = facts.filter(f => 
    f.type === "phase_status" &&
    typeof f.value === "object" &&
    f.value !== null &&
    (f.value as any).status === "complete"
  );
  
  const missingEvidence = facts.filter(f => f.type === "evidence_missing");
  
  // Cross-reference phase IDs
  for (const phase of completedPhases) {
    const phaseId = phase.source_ids[0];
    const hasMissing = missingEvidence.some(m => m.source_ids.includes(phaseId));
    
    if (hasMissing) {
      triggers.push({
        type: "conflicting_evidence",
        severity: "critical",
        message: `Phase marked complete but has missing evidence: ${phase.label}`,
        source_facts: [phase.id, ...missingEvidence.filter(m => 
          m.source_ids.includes(phaseId)
        ).map(m => m.id)],
        suggested_action: "Verify phase status accuracy. Upload missing evidence or correct status.",
        triggered_at: new Date().toISOString(),
      });
    }
  }
  
  return triggers;
}

/**
 * Detect: Phase bypass attempt
 * When trying to mark phases complete without required evidence.
 */
function detectPhaseBypassAttempt(facts: Fact[], _tiers: TierResult[]): EscalationTrigger[] {
  const triggers: EscalationTrigger[] = [];
  
  // Check for phases in "complete" status with significant evidence gaps
  const evidenceMissing = facts.filter(f => f.type === "evidence_missing");
  
  for (const missing of evidenceMissing) {
    if (typeof missing.value !== "object" || missing.value === null) continue;
    
    const value = missing.value as { required?: number; submitted?: number; missing?: number };
    
    // If more than 50% missing, flag as potential bypass
    if (value.required && value.missing) {
      const missingPercent = (value.missing / value.required) * 100;
      
      if (missingPercent > 50) {
        triggers.push({
          type: "phase_bypass_attempt",
          severity: "warning",
          message: `Phase has ${Math.round(missingPercent)}% evidence missing - completion may be premature`,
          source_facts: [missing.id],
          suggested_action: "Review phase requirements before marking complete.",
          triggered_at: new Date().toISOString(),
        });
      }
    }
  }
  
  return triggers;
}

/**
 * Detect: Critical compliance gaps
 */
function detectCriticalComplianceGap(facts: Fact[]): EscalationTrigger[] {
  const triggers: EscalationTrigger[] = [];
  
  // Check for audit exposure facts
  const auditExposure = facts.filter(f => f.type === "audit_exposure");
  
  for (const exposure of auditExposure) {
    if (typeof exposure.value !== "object" || exposure.value === null) continue;
    
    const value = exposure.value as { critical_count?: number };
    
    if (value.critical_count && value.critical_count >= 2) {
      triggers.push({
        type: "compliance_gap_critical",
        severity: "critical",
        message: `Multiple critical risks detected (${value.critical_count}) - audit exposure elevated`,
        source_facts: [exposure.id],
        suggested_action: "Schedule compliance review meeting. Document mitigation plans.",
        triggered_at: new Date().toISOString(),
      });
    }
  }
  
  return triggers;
}

/**
 * Detect: Capacity exceeded
 */
function detectCapacityExceeded(facts: Fact[]): EscalationTrigger[] {
  const triggers: EscalationTrigger[] = [];
  
  const capacityRisks = facts.filter(f => f.type === "capacity_risk");
  
  for (const risk of capacityRisks) {
    if (typeof risk.value !== "object" || risk.value === null) continue;
    
    const value = risk.value as { percent_used?: number; remaining_hours?: number };
    
    if (value.percent_used && value.percent_used >= 95) {
      triggers.push({
        type: "capacity_exceeded",
        severity: "critical",
        message: `Package capacity critically low: ${value.remaining_hours?.toFixed(1) || 0} hours remaining`,
        source_facts: [risk.id],
        suggested_action: "Review scope. Consider package extension or scope reduction.",
        triggered_at: new Date().toISOString(),
      });
    }
  }
  
  return triggers;
}

/**
 * Format escalation triggers for prompt.
 */
export function formatEscalationsForPrompt(triggers: EscalationTrigger[]): string {
  if (triggers.length === 0) {
    return "";
  }
  
  const lines: string[] = [
    "=== ESCALATION ALERTS ===",
    "",
  ];
  
  const critical = triggers.filter(t => t.severity === "critical");
  const warnings = triggers.filter(t => t.severity === "warning");
  
  if (critical.length > 0) {
    lines.push("🚨 CRITICAL ESCALATIONS:");
    for (const t of critical) {
      lines.push(`  • ${t.message}`);
      lines.push(`    Action: ${t.suggested_action}`);
    }
    lines.push("");
  }
  
  if (warnings.length > 0) {
    lines.push("⚠️ WARNING ESCALATIONS:");
    for (const t of warnings) {
      lines.push(`  • ${t.message}`);
      lines.push(`    Action: ${t.suggested_action}`);
    }
    lines.push("");
  }
  
  lines.push("=========================", "");
  
  return lines.join("\n");
}
