/**
 * Ask Viv Response Validator v2
 * 
 * Validates LLM outputs for required structure and minimum compliance.
 * If invalid, attempts one repair pass. If still invalid, returns a safe fallback.
 * 
 * Pipeline order: Fact Builder → LLM → Phrase Filter → Response Validator → UI
 */

import { type AskVivMode } from "./types.ts";

/**
 * Validator version for audit tracking
 */
export const RESPONSE_VALIDATOR_VERSION = "v1";

/**
 * Record reference for validation
 */
export interface RecordReference {
  table: string;
  id: string;
  label?: string;
}

/**
 * Input metadata for validation context
 */
export interface ValidationInputMeta {
  mode: AskVivMode;
  gaps_in: string[];
  records_accessed_in: RecordReference[];
}

/**
 * Parsed response sections
 */
export interface ParsedResponse {
  answer: string;
  key_records_used?: string;
  references?: string;
  confidence: "High" | "Medium" | "Low";
  gaps: string;
  next_safe_actions: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  ok: boolean;
  errors: string[];
  parsed?: ParsedResponse;
}

/**
 * Audit log entry for validator results
 */
export interface ValidatorAuditEntry {
  response_validator: {
    ok: boolean;
    errors?: string[];
    repaired: boolean;
    validator_version: string;
  };
}

/**
 * Required headings for each mode (exact order)
 */
const COMPLIANCE_HEADINGS = [
  "Answer",
  "Key records used",
  "Confidence",
  "Gaps",
  "Next safe actions",
] as const;

const KNOWLEDGE_HEADINGS = [
  "Answer",
  "References",
  "Confidence",
  "Gaps",
  "Next safe actions",
] as const;

/**
 * Valid confidence values
 */
const VALID_CONFIDENCE = ["High", "Medium", "Low"] as const;

/**
 * Fallback response templates
 */
const FALLBACK_TEMPLATES: Record<AskVivMode, string> = {
  compliance: `## Answer
- Response could not be validated to the required structure.

## Key records used
- None.

## Confidence
**Low**

## Gaps
- Output format was invalid, or inputs were insufficient.

## Next safe actions
- Rephrase the question to target a single client or phase.
- Review the linked records directly.
- Escalate to the CSC lead if a decision is required.`,

  knowledge: `## Answer
- Response could not be validated to the required structure.

## References
- None.

## Confidence
**Low**

## Gaps
- Output format was invalid, or the knowledge base lacked coverage.

## Next safe actions
- Check the relevant internal procedure.
- Escalate to the Function Lead for confirmation.`,
};

/**
 * Parse response text into sections by heading
 * 
 * Headings are:
 * - ## Heading text
 * - **Heading text** (on its own line, but NOT **High**, **Medium**, **Low** which are confidence values)
 * 
 * Returns both the sections map and a list of all headings found (for duplicate detection)
 */
function parseSections(text: string): { sections: Map<string, string>; headingsList: string[] } {
  const sections = new Map<string, string>();
  const headingsList: string[] = [];
  const lines = text.split("\n");
  
  // These are NOT headings - they're confidence values
  const confidenceValues = ["High", "Medium", "Low"];
  
  let currentHeading: string | null = null;
  let currentContent: string[] = [];
  
  for (const line of lines) {
    // Check for ## Heading format
    const hashMatch = line.match(/^##\s+(.+)$/);
    
    // Check for **Heading** format (on its own line, not inline bold)
    // But exclude confidence values like **High**, **Medium**, **Low**
    let boldMatch: RegExpMatchArray | null = null;
    const boldCandidate = line.match(/^\*\*([^*]+)\*\*$/);
    if (boldCandidate && !confidenceValues.includes(boldCandidate[1].trim())) {
      boldMatch = boldCandidate;
    }
    
    const headingMatch = hashMatch || boldMatch;
    
    if (headingMatch) {
      // Save previous section
      if (currentHeading !== null) {
        sections.set(currentHeading, currentContent.join("\n").trim());
      }
      
      currentHeading = headingMatch[1].trim();
      headingsList.push(currentHeading); // Track all headings for duplicate detection
      currentContent = [];
    } else if (currentHeading !== null) {
      currentContent.push(line);
    }
  }
  
  // Save final section
  if (currentHeading !== null) {
    sections.set(currentHeading, currentContent.join("\n").trim());
  }
  
  return { sections, headingsList };
}

/**
 * Check if content is "None" or "None."
 */
function isNoneContent(content: string): boolean {
  const trimmed = content.trim().toLowerCase();
  return trimmed === "none" || trimmed === "none." || trimmed === "- none" || trimmed === "- none.";
}

/**
 * Check if content has at least one bullet or is "None"
 */
function hasMinimumContent(content: string): boolean {
  if (isNoneContent(content)) return true;
  // Check for bullet points (- or *)
  return /^[-*]\s+.+/m.test(content);
}

/**
 * Extract confidence value from content
 */
function extractConfidence(content: string): "High" | "Medium" | "Low" | null {
  const trimmed = content.trim();
  
  // Check each valid value
  for (const value of VALID_CONFIDENCE) {
    // Exact match
    if (trimmed === value) return value;
    // Wrapped in **
    if (trimmed === `**${value}**`) return value;
    // Starts with **Value** (may have explanation after)
    if (trimmed.startsWith(`**${value}**`)) return value;
    // Just the value at start of line
    if (trimmed.startsWith(value) && (trimmed.length === value.length || trimmed[value.length] === "\n")) return value;
  }
  
  return null;
}

/**
 * Validate Ask Viv response structure and content
 */
export function validateAskVivResponse(
  text: string,
  meta: ValidationInputMeta
): ValidationResult {
  const errors: string[] = [];
  const requiredHeadings = meta.mode === "compliance" ? COMPLIANCE_HEADINGS : KNOWLEDGE_HEADINGS;
  
  // Parse sections
  const { sections, headingsList } = parseSections(text);
  const foundHeadings = Array.from(sections.keys());
  
  // 1. Check all required headings are present
  for (const heading of requiredHeadings) {
    if (!sections.has(heading)) {
      errors.push(`Missing heading: ${heading}`);
    }
  }
  
  // 2. Check headings appear in correct order
  if (errors.length === 0) {
    const headingOrder = requiredHeadings.filter(h => foundHeadings.includes(h));
    let lastIndex = -1;
    
    for (const heading of headingOrder) {
      const currentIndex = foundHeadings.indexOf(heading);
      if (currentIndex < lastIndex) {
        errors.push(`Heading order incorrect: "${heading}" appears out of sequence`);
        break;
      }
      lastIndex = currentIndex;
    }
  }
  
  // 3. Check each heading appears only once (use headingsList for accurate count)
  const headingCounts = new Map<string, number>();
  for (const heading of headingsList) {
    headingCounts.set(heading, (headingCounts.get(heading) || 0) + 1);
  }
  for (const [heading, count] of headingCounts) {
    if (count > 1 && requiredHeadings.includes(heading as any)) {
      errors.push(`Duplicate heading: ${heading} (appears ${count} times)`);
    }
  }
  
  // Early return if structure is broken
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  
  // 4. Validate Confidence section
  const confidenceContent = sections.get("Confidence") || "";
  const confidenceValue = extractConfidence(confidenceContent);
  
  if (!confidenceValue) {
    errors.push(`Confidence must be exactly "High", "Medium", or "Low" - found: "${confidenceContent.substring(0, 50)}"`);
  }
  
  // 5. Validate Gaps alignment
  const gapsContent = sections.get("Gaps") || "";
  
  if (meta.gaps_in.length > 0) {
    if (isNoneContent(gapsContent)) {
      errors.push(`Gaps section must not be "None" when gaps_in has ${meta.gaps_in.length} entries`);
    }
  }
  
  // 6. Validate Records alignment (compliance mode only)
  if (meta.mode === "compliance") {
    const keyRecordsContent = sections.get("Key records used") || "";
    
    if (meta.records_accessed_in.length > 0) {
      if (isNoneContent(keyRecordsContent)) {
        errors.push(`Key records used must not be "None" when records_accessed_in has ${meta.records_accessed_in.length} entries`);
      }
    } else {
      if (!isNoneContent(keyRecordsContent) && keyRecordsContent.trim() !== "") {
        // This is a warning, not an error - records might be contextual
      }
    }
  }
  
  // 7. Validate minimum content
  const answerContent = sections.get("Answer") || "";
  if (!hasMinimumContent(answerContent)) {
    errors.push(`Answer must have at least one bullet or "None"`);
  }
  
  const nextActionsContent = sections.get("Next safe actions") || "";
  if (!hasMinimumContent(nextActionsContent)) {
    errors.push(`Next safe actions must have at least one bullet or "None"`);
  }
  
  // Build parsed response if valid
  if (errors.length === 0 && confidenceValue) {
    const parsed: ParsedResponse = {
      answer: answerContent,
      confidence: confidenceValue,
      gaps: gapsContent,
      next_safe_actions: nextActionsContent,
    };
    
    if (meta.mode === "compliance") {
      parsed.key_records_used = sections.get("Key records used") || "";
    } else {
      parsed.references = sections.get("References") || "";
    }
    
    return { ok: true, errors: [], parsed };
  }
  
  return { ok: false, errors };
}

/**
 * Build fallback response for validation failures
 */
export function buildFallbackResponse(meta: ValidationInputMeta): string {
  return FALLBACK_TEMPLATES[meta.mode];
}

/**
 * Build repair prompt for LLM
 */
export function buildRepairPrompt(
  originalResponse: string,
  errors: string[],
  meta: ValidationInputMeta
): string {
  const requiredHeadings = meta.mode === "compliance" ? COMPLIANCE_HEADINGS : KNOWLEDGE_HEADINGS;
  
  return `Fix the following Ask Viv response to match the required structure.

## VALIDATION ERRORS:
${errors.map(e => `- ${e}`).join("\n")}

## REQUIRED STRUCTURE (headings in this exact order):
${requiredHeadings.map(h => `## ${h}`).join("\n")}

## RULES:
- Fix formatting only. Do not add new facts.
- Preserve meaning exactly.
- Confidence must be exactly "High", "Medium", or "Low" (no extra words).
- Each section must have at least one bullet point (- ) or "None".
- Use ## for headings.

## ORIGINAL RESPONSE:
${originalResponse}

## CORRECTED RESPONSE:`;
}

/**
 * Build audit log entry for validator results
 */
export function buildValidatorAuditEntry(
  result: ValidationResult,
  repaired: boolean
): ValidatorAuditEntry {
  return {
    response_validator: {
      ok: result.ok,
      errors: result.ok ? undefined : result.errors,
      repaired,
      validator_version: RESPONSE_VALIDATOR_VERSION,
    },
  };
}

/**
 * Full validation pipeline with repair pass
 * 
 * Returns validated response or fallback, plus audit entry
 */
export async function validateWithRepair(
  llmResponse: string,
  meta: ValidationInputMeta,
  repairFn?: (prompt: string) => Promise<string>
): Promise<{
  response: string;
  result: ValidationResult;
  auditEntry: ValidatorAuditEntry;
}> {
  // First validation attempt
  let result = validateAskVivResponse(llmResponse, meta);
  
  if (result.ok) {
    return {
      response: llmResponse,
      result,
      auditEntry: buildValidatorAuditEntry(result, false),
    };
  }
  
  // Attempt repair pass if repair function provided
  if (repairFn) {
    try {
      const repairPrompt = buildRepairPrompt(llmResponse, result.errors, meta);
      const repairedResponse = await repairFn(repairPrompt);
      
      // Validate repaired response
      result = validateAskVivResponse(repairedResponse, meta);
      
      if (result.ok) {
        return {
          response: repairedResponse,
          result,
          auditEntry: buildValidatorAuditEntry(result, true),
        };
      }
    } catch (error) {
      console.error("Repair pass failed:", error);
    }
  }
  
  // Return fallback
  const fallback = buildFallbackResponse(meta);
  return {
    response: fallback,
    result: { ok: false, errors: [...result.errors, "Repair failed - using fallback"] },
    auditEntry: buildValidatorAuditEntry(result, repairFn !== undefined),
  };
}
