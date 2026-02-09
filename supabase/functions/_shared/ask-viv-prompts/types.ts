/**
 * Ask Viv Prompt Types
 * 
 * Type definitions for the tiered prompt system.
 */

export type AskVivMode = "compliance" | "knowledge";

export interface PromptContext {
  mode: AskVivMode;
  facts?: unknown[];
  record_links?: unknown[];
  gaps?: string[];
  question?: string;
}

export interface SystemPromptPack {
  global: string;
  mode_specific: string;
  developer: string;
}

export interface ResponseTemplate {
  mode: AskVivMode;
  sections: ResponseSection[];
}

export interface ResponseSection {
  name: string;
  required: boolean;
  description: string;
}

/**
 * Required sections for each mode
 */
export const COMPLIANCE_SECTIONS: ResponseSection[] = [
  { name: "Answer", required: true, description: "Core response with bullets" },
  { name: "Key records used", required: true, description: "Linked records list" },
  { name: "Confidence", required: true, description: "High|Medium|Low" },
  { name: "Gaps", required: true, description: "Missing data or limitations" },
  { name: "Next safe actions", required: true, description: "Human-actionable steps" },
];

export const KNOWLEDGE_SECTIONS: ResponseSection[] = [
  { name: "Answer", required: true, description: "Core response with bullets" },
  { name: "References", required: true, description: "Internal doc links" },
  { name: "Confidence", required: true, description: "High|Medium|Low" },
  { name: "Gaps", required: true, description: "Missing data or limitations" },
  { name: "Next safe actions", required: true, description: "Human-actionable steps" },
];

/**
 * Banned phrases that must never appear in responses
 * @deprecated Use phrase-filter.ts BANNED_PATTERNS for categorized detection
 */
export const BANNED_PHRASES = [
  "submit",
  "lodge",
  "ASQA will",
  "approved",
  "compliant",
  "should submit",
  "is compliant",
  "will likely",
  "recommend submitting",
  "safe to proceed",
  "this should pass",
  "you should",
  "I recommend",
] as const;

export type BannedPhrase = typeof BANNED_PHRASES[number];

/**
 * Phrase filter categories for categorized banned phrase detection
 */
export type PhraseCategory = 
  | "regulatory_action" 
  | "phase_bypass" 
  | "deterministic_compliance";

/**
 * Result of phrase filter detection
 */
export interface PhraseFilterResult {
  blocked: boolean;
  matches: string[];
  categories: PhraseCategory[];
}

/**
 * Audit log entry for blocked responses
 */
export interface PhraseFilterAuditEntry {
  phrase_filter: {
    blocked: boolean;
    matches: string[];
    categories: PhraseCategory[];
    filter_version: string;
  };
}

/**
 * Response validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  section?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  context?: string;
}
