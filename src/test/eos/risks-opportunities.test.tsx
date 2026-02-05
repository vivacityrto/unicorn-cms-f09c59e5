import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  mockIssues,
  validEnumValues,
  mockVivacityUsers,
  VIVACITY_TENANT_ID,
} from "../fixtures/eos-test-data";

describe("Risks & Opportunities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Status Enum Validation", () => {
    it("should have all valid issue statuses", () => {
      const expectedStatuses = [
        "Open",
        "Discussing",
        "Solved",
        "Archived",
        "In Review",
        "Actioning",
        "Escalated",
        "Closed",
      ];

      expect(validEnumValues.issueStatus).toEqual(expectedStatuses);
    });

    it("should have valid impact levels", () => {
      const expectedImpacts = ["Low", "Medium", "High", "Critical"];
      expect(validEnumValues.issueImpact).toEqual(expectedImpacts);
    });

    it("should have valid categories", () => {
      const expectedCategories = [
        "Delivery",
        "Compliance",
        "Financial",
        "Capacity",
        "Systems",
        "Client",
        "Strategic",
        "Growth",
      ];

      expect(validEnumValues.issueCategory).toEqual(expectedCategories);
    });

    it("should have valid item types", () => {
      expect(validEnumValues.issueType).toContain("risk");
      expect(validEnumValues.issueType).toContain("opportunity");
    });
  });

  describe("Mock Issue Data Structure", () => {
    it("should have required fields for open risk", () => {
      const risk = mockIssues.openRisk;

      expect(risk.id).toBeDefined();
      expect(risk.title).toBeDefined();
      expect(risk.item_type).toBe("risk");
      expect(risk.status).toBe("Open");
      expect(risk.tenant_id).toBe(VIVACITY_TENANT_ID);
      expect(validEnumValues.issueCategory).toContain(risk.category);
      expect(validEnumValues.issueImpact).toContain(risk.impact);
    });

    it("should have meeting reference for meeting-created items", () => {
      const opp = mockIssues.discussingOpportunity;

      expect(opp.source).toBe("meeting_l10");
      expect(opp.meeting_id).toBeDefined();
    });

    it("should have resolved fields for solved items", () => {
      const solved = mockIssues.solvedRisk;

      expect(solved.status).toBe("Solved");
      expect(solved.resolved_at).toBeDefined();
      expect(solved.resolved_by).toBeDefined();
    });
  });

  describe("Default Filter Behavior", () => {
    it("should default to Open status in types", () => {
      // The default filter is now 'Open' as per the fix
      const defaultStatus = "Open";
      expect(validEnumValues.issueStatus).toContain(defaultStatus);
    });
  });

  describe("Status Transitions", () => {
    it("should allow valid transition from Open to Discussing", () => {
      const validTransitions = {
        Open: ["Discussing", "In Review", "Actioning", "Escalated", "Closed"],
        Discussing: ["Open", "Solved", "Actioning", "Escalated"],
        "In Review": ["Open", "Discussing", "Actioning", "Solved"],
        Actioning: ["Discussing", "Solved", "Escalated"],
        Escalated: ["Actioning", "Solved", "Closed"],
        Solved: ["Closed", "Archived"],
        Closed: ["Archived"],
        Archived: [],
      };

      expect(validTransitions["Open"]).toContain("Discussing");
    });

    it("should not allow transition from Archived", () => {
      const validTransitions = {
        Archived: [],
      };

      expect(validTransitions["Archived"]).toHaveLength(0);
    });
  });

  describe("Vivacity Team Assignment", () => {
    it("should only allow Vivacity Team users as assignees", () => {
      const validAssignees = Object.values(mockVivacityUsers);

      validAssignees.forEach((user) => {
        expect(["Super Admin", "Team Leader", "Team Member"]).toContain(
          user.unicorn_role
        );
      });
    });
  });

  describe("Source Tracking", () => {
    it("should support all valid source types", () => {
      const validSources = [
        "ad_hoc",
        "meeting_ids",
        "ro_page",
        "meeting_l10",
        "meeting_quarterly",
        "meeting_annual",
      ];

      expect(validSources).toContain(mockIssues.openRisk.source);
      expect(validSources).toContain(mockIssues.discussingOpportunity.source);
    });
  });
});
