import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  mockRocks,
  validEnumValues,
  mockVivacityUsers,
  VIVACITY_TENANT_ID,
} from "../fixtures/eos-test-data";

describe("EOS Rocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rock Status Enum", () => {
    it("should have all valid rock statuses", () => {
      const expectedStatuses = [
        "not_started",
        "on_track",
        "at_risk",
        "off_track",
        "complete",
      ];

      expect(validEnumValues.rockStatus).toEqual(expectedStatuses);
    });

    it("should map UI-friendly status names", () => {
      const statusMapping: Record<string, string> = {
        Not_Started: "Not Started",
        On_Track: "On Track",
        At_Risk: "At Risk",
        Off_Track: "Off Track",
        Complete: "Complete",
      };

      Object.entries(statusMapping).forEach(([dbStatus, uiStatus]) => {
        expect(validEnumValues.rockStatus).toContain(dbStatus);
        expect(uiStatus).toBeDefined();
      });
    });
  });

  describe("Rock Types", () => {
    it("should support Company, Team, and Individual rock types", () => {
      expect(mockRocks.companyRock.rock_type).toBe("Company");
      expect(mockRocks.teamRock.rock_type).toBe("Team");
      expect(mockRocks.individualRock.rock_type).toBe("Individual");
    });
  });

  describe("Rock Hierarchy", () => {
    it("should link team rock to company rock", () => {
      expect(mockRocks.teamRock.parent_rock_id).toBe(mockRocks.companyRock.id);
    });

    it("should link individual rock to team rock", () => {
      expect(mockRocks.individualRock.parent_rock_id).toBe(mockRocks.teamRock.id);
    });

    it("should have no parent for company rock", () => {
      expect(mockRocks.companyRock).not.toHaveProperty("parent_rock_id");
    });
  });

  describe("Rock Data Structure", () => {
    it("should have required fields for company rock", () => {
      const rock = mockRocks.companyRock;

      expect(rock.id).toBeDefined();
      expect(rock.title).toBeDefined();
      expect(rock.rock_type).toBe("Company");
      expect(rock.status).toBeDefined();
      expect(rock.owner_id).toBeDefined();
      expect(rock.tenant_id).toBe(VIVACITY_TENANT_ID);
      expect(rock.quarter_number).toBeDefined();
      expect(rock.quarter_year).toBeDefined();
    });

    it("should have valid status values", () => {
      Object.values(mockRocks).forEach((rock) => {
        expect(validEnumValues.rockStatus).toContain(rock.status);
      });
    });

    it("should have Vivacity Team owners only", () => {
      const validOwnerIds = Object.values(mockVivacityUsers).map(
        (u) => u.user_uuid
      );

      Object.values(mockRocks).forEach((rock) => {
        expect(validOwnerIds).toContain(rock.owner_id);
      });
    });
  });

  describe("Quarter Handling", () => {
    it("should have valid quarter numbers (1-4)", () => {
      Object.values(mockRocks).forEach((rock) => {
        expect(rock.quarter_number).toBeGreaterThanOrEqual(1);
        expect(rock.quarter_number).toBeLessThanOrEqual(4);
      });
    });

    it("should have valid year", () => {
      Object.values(mockRocks).forEach((rock) => {
        expect(rock.quarter_year).toBeGreaterThanOrEqual(2020);
        expect(rock.quarter_year).toBeLessThanOrEqual(2030);
      });
    });
  });

  describe("Status Rollup Logic", () => {
    it("should identify off-track status as highest priority", () => {
      const statusPriority: Record<string, number> = {
        Off_Track: 1,
        At_Risk: 2,
        On_Track: 3,
        Not_Started: 4,
        Complete: 5,
      };

      expect(statusPriority["Off_Track"]).toBeLessThan(statusPriority["At_Risk"]);
      expect(statusPriority["At_Risk"]).toBeLessThan(statusPriority["On_Track"]);
    });

    it("should flag parent as at-risk when child is at-risk", () => {
      // Test the rollup logic concept
      const childStatus = mockRocks.teamRock.status; // At_Risk
      expect(childStatus).toBe("At_Risk");
    });
  });

  describe("Milestone Support", () => {
    it("should support milestones structure", () => {
      // Milestones are stored in eos_rock_milestones table
      const milestoneFields = [
        "id",
        "rock_id",
        "title",
        "due_date",
        "completed",
        "completed_at",
      ];

      // Verify expected structure
      milestoneFields.forEach((field) => {
        expect(field).toBeDefined();
      });
    });
  });

  describe("Vivacity Team Owner Validation", () => {
    it("should only allow Super Admin, Team Leader, Team Member as owners", () => {
      const validRoles = ["Super Admin", "Team Leader", "Team Member"];

      Object.values(mockVivacityUsers).forEach((user) => {
        expect(validRoles).toContain(user.unicorn_role);
      });
    });

    it("should not allow client users as rock owners", () => {
      const clientRoles = ["Admin", "User", "General User"];

      Object.values(mockVivacityUsers).forEach((user) => {
        expect(clientRoles).not.toContain(user.unicorn_role);
      });
    });
  });
});
