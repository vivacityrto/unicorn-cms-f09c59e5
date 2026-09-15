const JSON_CODE_BLOCK_PATTERN = /```json\s*([\s\S]*?)\s*```/gi;

export interface RegulatorySummarySections {
  changeSummary: string;
  impactLevel: string | null;
}

export function humanizeRegulatoryImpactText(text: string): string {
  const startsWithClarification = /^\s*clarification\b/i.test(text);
  const humanized = text
    .replace(/\bclarification of\b/gi, "interpretive guidance on")
    .replace(/\bclarification\b/gi, "interpretive guidance");

  if (startsWithClarification) {
    return humanized.replace(/^\s*\w/, (character) => character.toUpperCase());
  }
  return humanized;
}

export function formatRegulatoryImpactExplanation(text: string, impactLevel: string | null): string {
  const humanized = humanizeRegulatoryImpactText(text)
    .replace(/^\s*(?:\*\*|__)([^*_]+)(?:\*\*|__)/, "$1")
    .trim();
  if (!impactLevel) return humanized;

  const escapedLevel = impactLevel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return humanized
    .replace(new RegExp(`^${escapedLevel}\\s*(?:[-–—:]\\s*)?`, "i"), "")
    .replace(/^\((.*)\)$/s, "$1")
    .trim();
}

/**
 * Removes the machine-readable analysis block from regulator summaries before
 * they are shown to people. Keep unrelated JSON examples in the markdown.
 */
export function removeRegulatoryAnalysisJson(markdown: string): string {
  return markdown
    .replace(JSON_CODE_BLOCK_PATTERN, (block, json: string) => {
      try {
        const parsed = JSON.parse(json);
        if (
          parsed &&
          typeof parsed === "object" &&
          ("impact_level" in parsed || "affected_areas" in parsed)
        ) {
          return "";
        }
      } catch {
        // Keep malformed or unrelated code blocks visible rather than hiding content.
      }
      return block;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Separates the model's human-facing sections so structured event data is not
 * repeated beneath the rendered markdown summary.
 */
export function getRegulatorySummarySections(markdown: string): RegulatorySummarySections {
  const cleaned = removeRegulatoryAnalysisJson(markdown);
  const headings = [...cleaned.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*$/gm)];

  if (headings.length === 0) {
    return { changeSummary: cleaned, impactLevel: null };
  }

  let changeSummary = "";
  let impactLevel: string | null = null;
  const additionalSections: string[] = [];

  headings.forEach((heading, index) => {
    const title = heading[1].trim();
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? cleaned.length;
    const content = cleaned.slice(start, end).trim();
    const normalizedTitle = title.toLowerCase().replace(/[*_`]/g, "").trim();

    if (normalizedTitle === "change summary") {
      changeSummary = content;
    } else if (normalizedTitle === "impact level") {
      impactLevel = content || null;
    } else if (normalizedTitle !== "affected areas" && content) {
      additionalSections.push(`## ${title}\n\n${content}`);
    }
  });

  return {
    changeSummary: [changeSummary, ...additionalSections].filter(Boolean).join("\n\n") || cleaned,
    impactLevel,
  };
}
