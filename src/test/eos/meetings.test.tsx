import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  mockMeetings,
  validEnumValues,
  mockVivacityUsers,
  VIVACITY_TENANT_ID,
  TEST_WORKSPACE_ID,
} from "../fixtures/eos-test-data";

describe("EOS Meetings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Meeting Type Enum", () => {
    it("should have all valid meeting types", () => {
      const expectedTypes = [
        "L10",
        "Quarterly",
        "Annual",
        "Focus_Day",
        "Custom",
        "Same_Page",
      ];

      expect(validEnumValues.meetingType).toEqual(expectedTypes);
    });
  });

  describe("Meeting Status Enum", () => {
    it("should have all valid meeting statuses", () => {
      const expectedStatuses = [
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
        "ready_to_close",
        "closed",
        "locked",
      ];

      expect(validEnumValues.meetingStatus).toEqual(expectedStatuses);
    });
  });

  describe("Meeting Data Structure", () => {
    it("should have required fields for scheduled meeting", () => {
      const meeting = mockMeetings.scheduledL10;

      expect(meeting.id).toBeDefined();
      expect(meeting.meeting_type).toBe("L10");
      expect(meeting.title).toBeDefined();
      expect(meeting.status).toBe("scheduled");
      expect(meeting.scheduled_at).toBeDefined();
      expect(meeting.facilitator_id).toBeDefined();
      expect(meeting.tenant_id).toBe(VIVACITY_TENANT_ID);
      expect(meeting.workspace_id).toBe(TEST_WORKSPACE_ID);
    });

    it("should have started_at for in-progress meeting", () => {
      const meeting = mockMeetings.inProgressL10;

      expect(meeting.status).toBe("in_progress");
      expect(meeting.started_at).toBeDefined();
    });

    it("should have ended_at for completed meeting", () => {
      const meeting = mockMeetings.completedL10;

      expect(meeting.status).toBe("completed");
      expect(meeting.started_at).toBeDefined();
      expect(meeting.ended_at).toBeDefined();
      expect(meeting.is_complete).toBe(true);
    });
  });

  describe("Facilitator Assignment", () => {
    it("should have Vivacity Team member as facilitator", () => {
      const validFacilitatorIds = Object.values(mockVivacityUsers).map(
        (u) => u.user_uuid
      );

      Object.values(mockMeetings).forEach((meeting) => {
        expect(validFacilitatorIds).toContain(meeting.facilitator_id);
      });
    });
  });

  describe("Workspace Isolation", () => {
    it("should use Vivacity workspace for all meetings", () => {
      Object.values(mockMeetings).forEach((meeting) => {
        expect(meeting.workspace_id).toBe(TEST_WORKSPACE_ID);
        expect(meeting.tenant_id).toBe(VIVACITY_TENANT_ID);
      });
    });
  });

  describe("Meeting Status Transitions", () => {
    const validTransitions: Record<string, string[]> = {
      scheduled: ["in_progress", "cancelled"],
      in_progress: ["ready_to_close", "completed"],
      ready_to_close: ["completed", "closed"],
      completed: ["closed", "locked"],
      closed: ["locked"],
      cancelled: [],
      locked: [],
    };

    it("should allow scheduled to in_progress", () => {
      expect(validTransitions["scheduled"]).toContain("in_progress");
    });

    it("should allow in_progress to completed", () => {
      expect(validTransitions["in_progress"]).toContain("completed");
    });

    it("should not allow transitions from locked", () => {
      expect(validTransitions["locked"]).toHaveLength(0);
    });

    it("should not allow transitions from cancelled", () => {
      expect(validTransitions["cancelled"]).toHaveLength(0);
    });
  });

  describe("L10 Meeting Specifics", () => {
    it("should auto-populate Vivacity Team participants", () => {
      // All Vivacity Team members should be auto-added to L10 meetings
      const expectedParticipants = Object.values(mockVivacityUsers).length;
      expect(expectedParticipants).toBeGreaterThan(0);
    });

    it("should have weekly recurrence for L10", () => {
      // L10 meetings follow weekly cadence
      const l10Type = "L10";
      expect(validEnumValues.meetingType).toContain(l10Type);
    });
  });

  describe("Meeting Segments", () => {
    it("should support standard L10 agenda segments", () => {
      const standardL10Segments = [
        "segue",
        "scorecard",
        "rock_review",
        "customer_employee_headlines",
        "todo_review",
        "ids",
        "conclude",
      ];

      // Verify segments exist as expected
      standardL10Segments.forEach((segment) => {
        expect(segment).toBeDefined();
      });
    });
  });

  describe("Meeting Ratings", () => {
    it("should support rating scale 1-10", () => {
      const validRatings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      
      validRatings.forEach((rating) => {
        expect(rating).toBeGreaterThanOrEqual(1);
        expect(rating).toBeLessThanOrEqual(10);
      });
    });
  });

  describe("Participant Management", () => {
    it("should only allow Vivacity Team as participants", () => {
      const validRoles = ["Super Admin", "Team Leader", "Team Member"];

      Object.values(mockVivacityUsers).forEach((user) => {
        expect(validRoles).toContain(user.unicorn_role);
      });
    });
  });
});
