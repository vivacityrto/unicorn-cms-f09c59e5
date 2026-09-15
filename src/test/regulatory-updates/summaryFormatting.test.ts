import { describe, expect, it } from "vitest";
import {
  formatRegulatoryImpactExplanation,
  getRegulatorySummarySections,
  humanizeRegulatoryImpactText,
  removeRegulatoryAnalysisJson,
} from "@/features/regulatory-updates/summaryFormatting";

describe("removeRegulatoryAnalysisJson", () => {
  it("removes the regulator machine block while keeping the human summary", () => {
    const summary = [
      "## Change Summary",
      "",
      "The regulator clarified evidence expectations.",
      "",
      "```json",
      '{"impact_level":"high","affected_areas":[{"area":"Data and reporting"}]}',
      "```",
      "",
      "This summary identifies potential operational impacts only.",
    ].join("\n");

    expect(removeRegulatoryAnalysisJson(summary)).toBe(
      "## Change Summary\n\nThe regulator clarified evidence expectations.\n\nThis summary identifies potential operational impacts only.",
    );
  });

  it("keeps unrelated valid JSON examples", () => {
    const example = "```json\n{\"example\": true}\n```";

    expect(removeRegulatoryAnalysisJson(example)).toBe(example);
  });

  it("keeps malformed JSON blocks", () => {
    const malformed = "```json\n{not valid json}\n```";

    expect(removeRegulatoryAnalysisJson(malformed)).toBe(malformed);
  });

  it("separates impact level and removes the duplicated affected areas section", () => {
    const summary = [
      "## Change Summary",
      "",
      "The regulator clarified evidence expectations.",
      "",
      "## Impact Level",
      "",
      "Moderate — this is a clarification.",
      "",
      "## Affected Areas",
      "",
      "- Data and reporting",
    ].join("\n");

    expect(getRegulatorySummarySections(summary)).toEqual({
      changeSummary: "The regulator clarified evidence expectations.",
      impactLevel: "Moderate — this is a clarification.",
    });
  });

  it("uses clearer language for the analyzer's clarification category", () => {
    expect(humanizeRegulatoryImpactText("clarification of reporting expectations")).toBe(
      "Interpretive guidance on reporting expectations",
    );
    expect(formatRegulatoryImpactExplanation("low — clarification and system issue advisory", "low")).toBe(
      "interpretive guidance and system issue advisory",
    );
    expect(formatRegulatoryImpactExplanation("**low** (Primarily presentation changes.)", "low")).toBe(
      "Primarily presentation changes.",
    );
  });
});
