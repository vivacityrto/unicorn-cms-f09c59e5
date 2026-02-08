/**
 * Confidence Scorer
 * 
 * Layer 4: Computes confidence levels based on data quality signals.
 * Confidence is computed, not guessed.
 */

import type {
  Fact,
  ConfidenceLevel,
  ConfidenceFactors,
  ConfidenceResult,
} from "./types.ts";

/**
 * Compute confidence from a set of facts.
 */
export function computeConfidence(facts: Fact[]): ConfidenceResult {
  if (facts.length === 0) {
    return {
      level: "low",
      factors: {
        data_freshness: 0,
        evidence_completeness: 0,
        rule_coverage: 0,
        source_count: 0,
        conflict_count: 0,
      },
      explanation: "No facts available for analysis",
      caution_required: true,
    };
  }
  
  // Calculate factors
  const freshness = calculateFreshness(facts);
  const completeness = calculateCompleteness(facts);
  const coverage = calculateCoverage(facts);
  const sourceCount = countUniqueSources(facts);
  const conflictCount = detectConflicts(facts);
  
  const factors: ConfidenceFactors = {
    data_freshness: freshness,
    evidence_completeness: completeness,
    rule_coverage: coverage,
    source_count: sourceCount,
    conflict_count: conflictCount,
  };
  
  // Determine level
  const level = determineLevel(factors);
  const explanation = buildExplanation(factors, level);
  
  return {
    level,
    factors,
    explanation,
    caution_required: level !== "high",
  };
}

/**
 * Calculate average data freshness.
 */
function calculateFreshness(facts: Fact[]): number {
  if (facts.length === 0) return 0;
  
  const totalFreshness = facts.reduce((sum, f) => sum + f.freshness_score, 0);
  return totalFreshness / facts.length;
}

/**
 * Calculate evidence completeness.
 * Based on presence of evidence-related facts and their status.
 */
function calculateCompleteness(facts: Fact[]): number {
  const evidenceFacts = facts.filter(f => f.category === "evidence");
  
  if (evidenceFacts.length === 0) {
    // No evidence category - check if this is expected
    const hasPhases = facts.some(f => f.category === "phase");
    if (!hasPhases) {
      return 0.5; // Unknown completeness
    }
    return 0.3; // Phases exist but no evidence facts
  }
  
  // Check for missing evidence facts
  const missingFacts = facts.filter(f => f.type === "evidence_missing");
  if (missingFacts.length > 0) {
    // Calculate based on ratio of missing
    const summaryFact = facts.find(f => f.type === "evidence_summary");
    if (summaryFact && typeof summaryFact.value === "object" && summaryFact.value !== null) {
      const value = summaryFact.value as { total?: number; released?: number };
      if (value.total && value.released !== undefined) {
        return value.released / value.total;
      }
    }
    return 0.5; // Some missing, unknown ratio
  }
  
  // Evidence exists with no missing flags
  return 0.9;
}

/**
 * Calculate rule coverage.
 * Based on category diversity.
 */
function calculateCoverage(facts: Fact[]): number {
  const expectedCategories = ["client", "package", "phase", "task", "evidence"];
  const presentCategories = new Set(facts.map(f => f.category));
  
  let coverage = 0;
  for (const cat of expectedCategories) {
    if (presentCategories.has(cat as any)) {
      coverage += 1;
    }
  }
  
  return coverage / expectedCategories.length;
}

/**
 * Count unique data sources.
 */
function countUniqueSources(facts: Fact[]): number {
  const sources = new Set<string>();
  for (const fact of facts) {
    sources.add(fact.source_table);
  }
  return sources.size;
}

/**
 * Detect conflicting facts.
 */
function detectConflicts(facts: Fact[]): number {
  let conflicts = 0;
  
  // Check for evidence conflicts
  const evidenceConflict = facts.find(f => f.type === "evidence_conflict");
  if (evidenceConflict) conflicts++;
  
  // Check for status inconsistencies
  const statusFacts = facts.filter(f => f.type.endsWith("_status"));
  
  // Simple conflict detection: phases complete but evidence missing
  const phasesComplete = facts.some(f => 
    f.type === "phase_status" && 
    typeof f.value === "object" && 
    f.value !== null &&
    (f.value as any).status === "complete"
  );
  const evidenceMissing = facts.some(f => f.type === "evidence_missing");
  
  if (phasesComplete && evidenceMissing) {
    conflicts++;
  }
  
  return conflicts;
}

/**
 * Determine confidence level from factors.
 */
function determineLevel(factors: ConfidenceFactors): ConfidenceLevel {
  // Critical failures → Low
  if (factors.conflict_count > 0) return "low";
  if (factors.source_count === 0) return "low";
  if (factors.data_freshness < 0.3) return "low";
  
  // Strong signals → High
  if (
    factors.data_freshness >= 0.7 &&
    factors.evidence_completeness >= 0.8 &&
    factors.rule_coverage >= 0.8 &&
    factors.source_count >= 3
  ) {
    return "high";
  }
  
  // Everything else → Medium
  return "medium";
}

/**
 * Build explanation text.
 */
function buildExplanation(factors: ConfidenceFactors, level: ConfidenceLevel): string {
  const parts: string[] = [];
  
  if (level === "high") {
    parts.push("High confidence based on:");
    if (factors.data_freshness >= 0.7) parts.push("- Fresh data sources");
    if (factors.evidence_completeness >= 0.8) parts.push("- Complete evidence coverage");
    if (factors.source_count >= 3) parts.push(`- ${factors.source_count} data sources cross-referenced`);
  } else if (level === "medium") {
    parts.push("Medium confidence. Consider:");
    if (factors.data_freshness < 0.7) parts.push("- Some data may be stale");
    if (factors.evidence_completeness < 0.8) parts.push("- Evidence gaps detected");
    if (factors.rule_coverage < 0.8) parts.push("- Limited category coverage");
  } else {
    parts.push("Low confidence. Issues detected:");
    if (factors.conflict_count > 0) parts.push(`- ${factors.conflict_count} data conflicts`);
    if (factors.data_freshness < 0.3) parts.push("- Data is significantly outdated");
    if (factors.source_count === 0) parts.push("- No valid data sources");
    parts.push("⚠️ Review source records before acting");
  }
  
  return parts.join("\n");
}
