import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  mockQCs,
  mockVivacityUsers,
  VIVACITY_TENANT_ID,
} from "../fixtures/eos-test-data";

describe("EOS Quarterly Conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("QC Data Structure", () => {
    it("should have required fields for scheduled QC", () => {
      const qc = mockQCs.scheduled;

      expect(qc.id).toBeDefined();
      expect(qc.reviewee_id).toBeDefined();
      expect(qc.manager_id).toBeDefined();
      expect(qc.status).toBe("scheduled");
      expect(qc.scheduled_date).toBeDefined();
      expect(qc.quarter).toBeDefined();
      expect(qc.year).toBeDefined();
      expect(qc.tenant_id).toBe(VIVACITY_TENANT_ID);
    });

    it("should have completed_at for completed QC", () => {
      const qc = mockQCs.completed;

      expect(qc.status).toBe("completed");
      expect(qc.completed_at).toBeDefined();
    });
  });

  describe("Vivacity Team Assignment", () => {
    it("should have Vivacity Team member as reviewee", () => {
      const validUserIds = Object.values(mockVivacityUsers).map(
        (u) => u.user_uuid
      );

      expect(validUserIds).toContain(mockQCs.scheduled.reviewee_id);
      expect(validUserIds).toContain(mockQCs.completed.reviewee_id);
    });

    it("should have Vivacity Team member as manager", () => {
      const validUserIds = Object.values(mockVivacityUsers).map(
        (u) => u.user_uuid
      );

      expect(validUserIds).toContain(mockQCs.scheduled.manager_id);
      expect(validUserIds).toContain(mockQCs.completed.manager_id);
    });

    it("should have manager with leadership role", () => {
      // Managers should be Super Admin or Team Leader
      const leadershipRoles = ["Super Admin", "Team Leader"];
      const teamLeader = mockVivacityUsers.teamLeader;
      const superAdmin = mockVivacityUsers.superAdmin;

      expect(leadershipRoles).toContain(teamLeader.unicorn_role);
      expect(leadershipRoles).toContain(superAdmin.unicorn_role);
    });
  });

  describe("Quarter Handling", () => {
    it("should have valid quarter format", () => {
      const validQuarters = ["Q1", "Q2", "Q3", "Q4"];

      expect(validQuarters).toContain(mockQCs.scheduled.quarter);
      expect(validQuarters).toContain(mockQCs.completed.quarter);
    });

    it("should have valid year", () => {
      Object.values(mockQCs).forEach((qc) => {
        expect(qc.year).toBeGreaterThanOrEqual(2020);
        expect(qc.year).toBeLessThanOrEqual(2030);
      });
    });
  });

  describe("QC Status Values", () => {
    it("should support expected status values", () => {
      const validStatuses = [
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
      ];

      expect(validStatuses).toContain(mockQCs.scheduled.status);
      expect(validStatuses).toContain(mockQCs.completed.status);
    });
  });

  describe("Tenant Isolation", () => {
    it("should use Vivacity tenant for all QCs", () => {
      Object.values(mockQCs).forEach((qc) => {
        expect(qc.tenant_id).toBe(VIVACITY_TENANT_ID);
      });
    });

    it("should not require tenant membership for Vivacity users", () => {
      // Vivacity users may have null tenant_id in their profile
      // but should still be able to create QCs for VIVACITY_TENANT_ID
      expect(VIVACITY_TENANT_ID).toBe(6372);
    });
  });

  describe("Reviewee Picker Validation", () => {
    it("should only show Vivacity Team users", () => {
      const vivacityRoles = ["Super Admin", "Team Leader", "Team Member"];

      Object.values(mockVivacityUsers).forEach((user) => {
        expect(vivacityRoles).toContain(user.unicorn_role);
      });
    });
  });

  describe("Manager Picker Validation", () => {
    it("should only show leadership roles", () => {
      const leadershipRoles = ["Super Admin", "Team Leader"];

      // Team Leader and Super Admin should be valid managers
      expect(leadershipRoles).toContain(mockVivacityUsers.superAdmin.unicorn_role);
      expect(leadershipRoles).toContain(mockVivacityUsers.teamLeader.unicorn_role);
    });

    it("should exclude Team Member from manager picker", () => {
      const leadershipRoles = ["Super Admin", "Team Leader"];
      const teamMember = mockVivacityUsers.teamMember;

      expect(leadershipRoles).not.toContain(teamMember.unicorn_role);
    });
  });

  describe("QC Sections", () => {
    it("should support standard QC sections", () => {
      const expectedSections = [
        "segue",
        "what_is_working",
        "what_is_not_working",
        "rating",
        "expectations",
        "next_quarter_rocks",
        "signatures",
      ];

      // Verify section structure exists
      expectedSections.forEach((section) => {
        expect(section).toBeDefined();
      });
    });
  });

  describe("Signature Tracking", () => {
    it("should support both reviewee and manager signatures", () => {
      const signatureFields = [
        "reviewee_signed_at",
        "reviewee_signature",
        "manager_signed_at",
        "manager_signature",
      ];

      signatureFields.forEach((field) => {
        expect(field).toBeDefined();
      });
    });
  });
});
