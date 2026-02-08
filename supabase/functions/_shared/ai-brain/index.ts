/**
 * AI Brain Module
 * 
 * Central export for the Vivacity Team AI Brain architecture.
 * Provides structured, tiered reasoning with governance controls.
 */

// Types
export * from "./types.ts";

// Context Builder (Layer 1)
export { 
  buildAIContext, 
  formatContextForPrompt 
} from "./context-builder.ts";

// Fact Builder (Layer 2)
export {
  buildClientFacts,
  buildPackageFacts,
  buildPhaseFacts,
  buildTaskFacts,
  buildEvidenceFacts,
  buildConsultFacts,
  buildRiskFacts,
  buildFactSet,
  formatFactsForPrompt,
} from "./fact-builder.ts";

export type {
  ClientData,
  PackageData,
  PhaseData,
  TaskData,
  EvidenceData,
  ConsultData,
  RiskData,
  DataForFacts,
} from "./fact-builder.ts";

// Reasoning Engine (Layer 3)
export {
  executeReasoning,
  formatReasoningForPrompt,
} from "./reasoning-engine.ts";

// Confidence Scorer (Layer 4)
export {
  computeConfidence,
} from "./confidence-scorer.ts";

// Escalation Detector (Layer 5)
export {
  detectEscalationTriggers,
  formatEscalationsForPrompt,
} from "./escalation-detector.ts";

// System Prompt (Layer 4 - Opinion Suppression)
export {
  buildSystemPrompt,
  buildCompactPrompt,
} from "./system-prompt.ts";

// ============= Convenience Functions =============

import type { UserProfile } from "../auth-helpers.ts";
import type { 
  AIContext, 
  FactSet, 
  ReasoningOutput,
  ConfidenceResult,
  EscalationTrigger,
  AIBrainResponse,
  SourceCitation,
} from "./types.ts";
import { buildAIContext, formatContextForPrompt } from "./context-builder.ts";
import { buildFactSet, formatFactsForPrompt, type DataForFacts } from "./fact-builder.ts";
import { executeReasoning, formatReasoningForPrompt } from "./reasoning-engine.ts";
import { computeConfidence } from "./confidence-scorer.ts";
import { buildSystemPrompt } from "./system-prompt.ts";

/**
 * Complete AI Brain processing pipeline.
 */
export interface AIBrainInput {
  user: { id: string };
  profile: UserProfile;
  tenant: { 
    id: number; 
    name: string; 
    status: string; 
    rto_id?: string | null; 
    risk_level?: string | null 
  } | null;
  scope?: {
    client_id?: number | null;
    package_id?: number | null;
    phase_id?: number | null;
    document_id?: number | null;
  };
  data: DataForFacts;
  timezone?: string;
}

/**
 * Execute the complete AI Brain pipeline.
 * Returns structured context, facts, reasoning, and governance info.
 */
export function processAIBrainInput(input: AIBrainInput): {
  context: AIContext;
  factSet: FactSet;
  reasoning: ReasoningOutput;
  confidence: ConfidenceResult;
  systemPrompt: string;
  contextPrompt: string;
  factsPrompt: string;
  reasoningPrompt: string;
} {
  // Build context (Layer 1)
  const context = buildAIContext(
    input.user,
    input.profile,
    input.tenant,
    input.scope || {},
    input.timezone || "Australia/Sydney"
  );
  
  // Build facts (Layer 2)
  const tenantId = input.tenant?.id || 0;
  const factSet = buildFactSet(tenantId, input.data);
  
  // Execute reasoning (Layer 3)
  const reasoning = executeReasoning(factSet);
  
  // Compute confidence (Layer 4)
  const confidence = computeConfidence(factSet.facts);
  
  // Build prompts
  const systemPrompt = buildSystemPrompt(context, confidence.level);
  const contextPrompt = formatContextForPrompt(context);
  const factsPrompt = formatFactsForPrompt(factSet);
  const reasoningPrompt = formatReasoningForPrompt(reasoning);
  
  return {
    context,
    factSet,
    reasoning,
    confidence,
    systemPrompt,
    contextPrompt,
    factsPrompt,
    reasoningPrompt,
  };
}

/**
 * Build source citations from facts.
 */
export function buildSourceCitations(factSet: FactSet): SourceCitation[] {
  const citations: SourceCitation[] = [];
  const seen = new Set<string>();
  
  for (const fact of factSet.facts) {
    for (const sourceId of fact.source_ids) {
      const key = `${fact.source_table}:${sourceId}`;
      if (!seen.has(key)) {
        seen.add(key);
        citations.push({
          table: fact.source_table,
          id: sourceId,
          label: fact.label,
          accessed_at: fact.timestamp,
        });
      }
    }
  }
  
  return citations;
}

/**
 * Build governance info from reasoning output.
 */
export function buildGovernanceInfo(
  confidence: ConfidenceResult,
  escalations: EscalationTrigger[]
): {
  read_only: boolean;
  human_action_required: boolean;
  caution_banners: string[];
  review_reminders: string[];
} {
  const caution_banners: string[] = [];
  const review_reminders: string[] = [];
  
  // Confidence-based cautions
  if (confidence.level === "low") {
    caution_banners.push("⚠️ Low confidence - data conflicts or gaps detected");
    review_reminders.push("Review source records before acting on this analysis");
  } else if (confidence.level === "medium") {
    review_reminders.push("Some data may be stale - verify critical findings");
  }
  
  // Escalation-based cautions
  const criticalEscalations = escalations.filter(e => e.severity === "critical");
  if (criticalEscalations.length > 0) {
    caution_banners.push(`🚨 ${criticalEscalations.length} critical escalation(s) detected`);
  }
  
  return {
    read_only: true,
    human_action_required: escalations.length > 0 || confidence.level === "low",
    caution_banners,
    review_reminders,
  };
}
