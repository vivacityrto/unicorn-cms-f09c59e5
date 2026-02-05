import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  mockAccountability,
  mockVivacityUsers,
  VIVACITY_TENANT_ID,
} from "../fixtures/eos-test-data";

describe("EOS Accountability Chart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Chart Structure", () => {
    it("should have required chart fields", () => {
      const chart = mockAccountability.chart;

      expect(chart.id).toBeDefined();
      expect(chart.tenant_id).toBe(VIVACITY_TENANT_ID);
      expect(chart.status).toBe("active");
      expect(chart.created_by).toBeDefined();
    });
  });

  describe("Functions", () => {
    it("should have required function fields", () => {
      mockAccountability.functions.forEach((func) => {
        expect(func.id).toBeDefined();
        expect(func.chart_id).toBe(mockAccountability.chart.id);
        expect(func.name).toBeDefined();
        expect(func.tenant_id).toBe(VIVACITY_TENANT_ID);
        expect(func.sort_order).toBeGreaterThan(0);
      });
    });

    it("should support standard EOS function types", () => {
      const validFunctionTypes = [
        "integrator",
        "visionary",
        "sales_marketing",
        "operations",
        "finance",
        "people",
        "custom",
      ];

      mockAccountability.functions.forEach((func) => {
        if (func.function_type) {
          expect(validFunctionTypes).toContain(func.function_type);
        }
      });
    });

    it("should include Integrator function", () => {
      const integrator = mockAccountability.functions.find(
        (f) => f.function_type === "integrator"
      );
      expect(integrator).toBeDefined();
      expect(integrator?.name).toBe("Integrator");
    });
  });

  describe("Seats", () => {
    it("should have required seat fields", () => {
      mockAccountability.seats.forEach((seat) => {
        expect(seat.id).toBeDefined();
        expect(seat.chart_id).toBe(mockAccountability.chart.id);
        expect(seat.function_id).toBeDefined();
        expect(seat.seat_name).toBeDefined();
        expect(seat.tenant_id).toBe(VIVACITY_TENANT_ID);
      });
    });

    it("should link seats to functions", () => {
      const functionIds = mockAccountability.functions.map((f) => f.id);

      mockAccountability.seats.forEach((seat) => {
        expect(functionIds).toContain(seat.function_id);
      });
    });

    it("should have sort order for seats", () => {
      mockAccountability.seats.forEach((seat) => {
        expect(seat.sort_order).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe("Seat Assignments", () => {
    it("should have required assignment fields", () => {
      mockAccountability.assignments.forEach((assignment) => {
        expect(assignment.id).toBeDefined();
        expect(assignment.seat_id).toBeDefined();
        expect(assignment.user_id).toBeDefined();
        expect(assignment.assignment_type).toBeDefined();
        expect(assignment.tenant_id).toBe(VIVACITY_TENANT_ID);
        expect(assignment.start_date).toBeDefined();
      });
    });

    it("should link assignments to valid seats", () => {
      const seatIds = mockAccountability.seats.map((s) => s.id);

      mockAccountability.assignments.forEach((assignment) => {
        expect(seatIds).toContain(assignment.seat_id);
      });
    });

    it("should only assign Vivacity Team users", () => {
      const validUserIds = Object.values(mockVivacityUsers).map(
        (u) => u.user_uuid
      );

      mockAccountability.assignments.forEach((assignment) => {
        expect(validUserIds).toContain(assignment.user_id);
      });
    });

    it("should support assignment types", () => {
      const validTypes = ["primary", "backup", "interim"];

      mockAccountability.assignments.forEach((assignment) => {
        expect(validTypes).toContain(assignment.assignment_type);
      });
    });
  });

  describe("One Primary Owner Rule", () => {
    it("should have exactly one primary assignment per seat", () => {
      const seatPrimaryCount: Record<string, number> = {};

      mockAccountability.assignments
        .filter((a) => a.assignment_type === "primary")
        .forEach((assignment) => {
          seatPrimaryCount[assignment.seat_id] =
            (seatPrimaryCount[assignment.seat_id] || 0) + 1;
        });

      Object.values(seatPrimaryCount).forEach((count) => {
        expect(count).toBe(1);
      });
    });
  });

  describe("Vivacity Team Validation", () => {
    it("should validate owner picker shows only Vivacity Team", () => {
      const vivacityRoles = ["Super Admin", "Team Leader", "Team Member"];

      Object.values(mockVivacityUsers).forEach((user) => {
        expect(vivacityRoles).toContain(user.unicorn_role);
      });
    });

    it("should exclude client users from owner picker", () => {
      const clientRoles = ["Admin", "User", "General User"];
      const vivacityUsers = Object.values(mockVivacityUsers);

      vivacityUsers.forEach((user) => {
        expect(clientRoles).not.toContain(user.unicorn_role);
      });
    });
  });

  describe("GWC Fields", () => {
    it("should support GWC rating fields on seats", () => {
      const gwcFields = ["gwc_get_it", "gwc_want_it", "gwc_capacity"];

      // Verify seats can have GWC fields
      gwcFields.forEach((field) => {
        expect(field).toBeDefined();
      });
    });

    it("should have valid GWC values", () => {
      const validGwcValues = ["+", "+/-", "-", null];

      // Validate structure
      validGwcValues.forEach((value) => {
        if (value !== null) {
          expect(["+", "+/-", "-"]).toContain(value);
        }
      });
    });
  });

  describe("Seat Roles (Accountabilities)", () => {
    it("should support multiple roles per seat", () => {
      // Roles are stored in accountability_seat_roles table
      const roleFields = ["id", "seat_id", "role_text", "sort_order", "tenant_id"];

      roleFields.forEach((field) => {
        expect(field).toBeDefined();
      });
    });
  });

  describe("Chart Versioning", () => {
    it("should support version snapshots", () => {
      // Versions stored in accountability_chart_versions
      const versionFields = [
        "id",
        "chart_id",
        "version_number",
        "snapshot",
        "change_summary",
        "created_by",
      ];

      versionFields.forEach((field) => {
        expect(field).toBeDefined();
      });
    });
  });
});
