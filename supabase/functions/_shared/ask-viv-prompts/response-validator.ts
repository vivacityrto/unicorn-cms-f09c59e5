/**
 * Ask Viv Response Validator
 * 
 * Validates AI responses for tier compliance, required sections,
 * and banned phrase detection.
 */

import {
  type AskVivMode,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  COMPLIANCE_SECTIONS,
  KNOWLEDGE_SECTIONS,
  BANNED_PHRASES,
} from "./types.ts";

/**
 * Required section headings for each mode
 */
const COMPLIANCE_HEADINGS = [
  "Answer",
  "Key records used",
  "Confidence",
  "Gaps",
  "Next safe actions",
];

const KNOWLEDGE_HEADINGS = [
  "Answer",
  "References",
  "Confidence",
  "Gaps",
  "Next safe actions",
];

/**
 * Validate a response against mode-specific rules
 */
export function validateResponse(
  response: string,
  mode: AskVivMode,
  recordsAccessed: unknown[],
  gaps: string[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 1. Check required headings
  const requiredHeadings = mode === "compliance" ? COMPLIANCE_HEADINGS : KNOWLEDGE_HEADINGS;
  const missingHeadings = checkRequiredHeadings(response, requiredHeadings);
  
  for (const heading of missingHeadings) {
    errors.push({
      code: "MISSING_SECTION",
      message: `Required section "${heading}" is missing from response`,
      section: heading,
    });
  }

  // 2. Check for banned phrases
  const bannedPhraseMatches = detectBannedPhrases(response);
  
  for (const match of bannedPhraseMatches) {
    errors.push({
      code: "BANNED_PHRASE",
      message: `Response contains banned phrase: "${match.phrase}"`,
    });
  }

  // 3. Check Key records used section when records exist
  if (mode === "compliance" && recordsAccessed.length > 0) {
    const hasRecordsSection = checkSectionNotEmpty(response, "Key records used");
    if (!hasRecordsSection) {
      warnings.push({
        code: "EMPTY_RECORDS_SECTION",
        message: "Key records used section should list records when records_accessed is not empty",
        context: `${recordsAccessed.length} records were accessed`,
      });
    }
  }

  // 4. Check Gaps section when gaps exist
  if (gaps.length > 0) {
    const hasGapsSection = checkSectionNotEmpty(response, "Gaps");
    if (!hasGapsSection) {
      warnings.push({
        code: "EMPTY_GAPS_SECTION",
        message: "Gaps section should list gaps when gaps array is not empty",
        context: `${gaps.length} gaps exist`,
      });
    }
  }

  // 5. Check confidence value format
  const confidenceCheck = checkConfidenceFormat(response);
  if (!confidenceCheck.valid) {
    errors.push({
      code: "INVALID_CONFIDENCE",
      message: confidenceCheck.message || "Confidence must be High, Medium, or Low",
      section: "Confidence",
    });
  }

  // 6. Check for prohibited prediction patterns
  const predictionPatterns = detectPredictionPatterns(response);
  for (const pattern of predictionPatterns) {
    warnings.push({
      code: "PREDICTION_DETECTED",
      message: `Response may contain prediction: "${pattern}"`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if all required headings are present
 */
function checkRequiredHeadings(response: string, headings: string[]): string[] {
  const missing: string[] = [];
  const responseLower = response.toLowerCase();

  for (const heading of headings) {
    // Check for markdown heading format (## Heading or **Heading**)
    const patterns = [
      `## ${heading.toLowerCase()}`,
      `**${heading.toLowerCase()}**`,
      `### ${heading.toLowerCase()}`,
      `# ${heading.toLowerCase()}`,
    ];

    const found = patterns.some(p => responseLower.includes(p));
    if (!found) {
      missing.push(heading);
    }
  }

  return missing;
}

/**
 * Detect banned phrases in response
 */
function detectBannedPhrases(response: string): Array<{ phrase: string; position: number }> {
  const matches: Array<{ phrase: string; position: number }> = [];
  const responseLower = response.toLowerCase();

  for (const phrase of BANNED_PHRASES) {
    const position = responseLower.indexOf(phrase.toLowerCase());
    if (position !== -1) {
      matches.push({ phrase, position });
    }
  }

  return matches;
}

/**
 * Check if a section exists and is not empty (not just "None")
 */
function checkSectionNotEmpty(response: string, sectionName: string): boolean {
  const responseLower = response.toLowerCase();
  const sectionNameLower = sectionName.toLowerCase();

  // Find section start
  const patterns = [
    `## ${sectionNameLower}`,
    `**${sectionNameLower}**`,
    `### ${sectionNameLower}`,
  ];

  for (const pattern of patterns) {
    const sectionStart = responseLower.indexOf(pattern);
    if (sectionStart !== -1) {
      // Get content after heading until next heading
      const afterHeading = response.slice(sectionStart + pattern.length);
      const nextHeadingMatch = afterHeading.match(/\n##|\n\*\*[A-Z]/);
      const sectionContent = nextHeadingMatch
        ? afterHeading.slice(0, nextHeadingMatch.index)
        : afterHeading;

      // Check if content is just "None" or empty
      const trimmed = sectionContent.trim().toLowerCase();
      return trimmed !== "" && trimmed !== "none" && trimmed !== "none." && trimmed !== "- none";
    }
  }

  return false;
}

/**
 * Check confidence format
 */
function checkConfidenceFormat(response: string): { valid: boolean; message?: string } {
  const responseLower = response.toLowerCase();

  // Check for valid confidence values
  const validConfidence = ["high", "medium", "low"];
  const confidenceSection = extractSection(response, "Confidence");

  if (!confidenceSection) {
    return { valid: false, message: "Confidence section not found" };
  }

  const hasValidConfidence = validConfidence.some(c => 
    confidenceSection.toLowerCase().includes(c)
  );

  if (!hasValidConfidence) {
    return { valid: false, message: "Confidence must be High, Medium, or Low" };
  }

  // Check for numeric confidence (not allowed)
  const numericMatch = confidenceSection.match(/\d+%|\d+\/\d+|\d+\.\d+/);
  if (numericMatch) {
    return { valid: false, message: "Numeric confidence values are not allowed" };
  }

  return { valid: true };
}

/**
 * Extract a section from the response
 */
function extractSection(response: string, sectionName: string): string | null {
  const patterns = [
    new RegExp(`## ${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, "i"),
    new RegExp(`\\*\\*${sectionName}\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*[A-Z]|\\n##|$)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Detect prediction patterns that should be flagged
 */
function detectPredictionPatterns(response: string): string[] {
  const patterns = [
    /will likely/gi,
    /probably will/gi,
    /should pass/gi,
    /will approve/gi,
    /will be compliant/gi,
    /expect.*to be/gi,
    /anticipate.*approval/gi,
  ];

  const matches: string[] = [];

  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match) {
      matches.push(match[0]);
    }
  }

  return matches;
}

/**
 * Sanitize response by removing or flagging banned content
 */
export function sanitizeResponse(response: string): {
  sanitized: string;
  modifications: string[];
} {
  let sanitized = response;
  const modifications: string[] = [];

  // Replace banned phrases with safe alternatives
  const replacements: Record<string, string> = {
    "should submit": "may consider reviewing for submission readiness",
    "is compliant": "shows alignment with reviewed criteria",
    "will likely": "based on available data",
    "safe to proceed": "review source records before proceeding",
    "approved": "reviewed",
    "ASQA will": "ASQA may",
  };

  for (const [banned, replacement] of Object.entries(replacements)) {
    const regex = new RegExp(banned, "gi");
    if (regex.test(sanitized)) {
      sanitized = sanitized.replace(regex, replacement);
      modifications.push(`Replaced "${banned}" with "${replacement}"`);
    }
  }

  return { sanitized, modifications };
}
