import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock the useAuth hook
const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

// Import after mocking
import { useRBAC, EOS_ROUTES, ADMIN_ROUTES } from "@/hooks/useRBAC";
import {
  mockVivacityProfile,
  mockClientProfile,
  mockVivacityUsers,
} from "../fixtures/eos-test-data";

describe("EOS Access Control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Vivacity Team Access", () => {
    it("should grant EOS access to SuperAdmin", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockVivacityProfile,
          unicorn_role: "Super Admin",
          global_role: "SuperAdmin",
        },
        isSuperAdmin: () => true,
      });

      const { result } = renderHook(() => useRBAC());

      expect(result.current.canAccessEOS()).toBe(true);
      expect(result.current.isSuperAdmin).toBe(true);
      expect(result.current.isVivacityTeam).toBe(true);
    });

    it("should grant EOS access to Team Leader", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockVivacityProfile,
          unicorn_role: "Team Leader",
          global_role: null,
        },
        isSuperAdmin: () => false,
      });

      const { result } = renderHook(() => useRBAC());

      expect(result.current.canAccessEOS()).toBe(true);
      expect(result.current.isSuperAdmin).toBe(false);
      expect(result.current.isVivacityTeam).toBe(true);
    });

    it("should grant EOS access to Team Member", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockVivacityProfile,
          unicorn_role: "Team Member",
          global_role: null,
        },
        isSuperAdmin: () => false,
      });

      const { result } = renderHook(() => useRBAC());

      expect(result.current.canAccessEOS()).toBe(true);
      expect(result.current.isSuperAdmin).toBe(false);
      expect(result.current.isVivacityTeam).toBe(true);
    });
  });

  describe("Client Access Blocking", () => {
    it("should deny EOS access to client Admin", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockClientProfile,
          unicorn_role: "Admin",
        },
        isSuperAdmin: () => false,
      });

      const { result } = renderHook(() => useRBAC());

      expect(result.current.canAccessEOS()).toBe(false);
      expect(result.current.isSuperAdmin).toBe(false);
      expect(result.current.isVivacityTeam).toBe(false);
    });

    it("should deny EOS access to client User", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockClientProfile,
          unicorn_role: "User",
        },
        isSuperAdmin: () => false,
      });

      const { result } = renderHook(() => useRBAC());

      expect(result.current.canAccessEOS()).toBe(false);
      expect(result.current.isVivacityTeam).toBe(false);
    });

    it("should deny EOS access to General User", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockClientProfile,
          unicorn_role: "General User",
        },
        isSuperAdmin: () => false,
      });

      const { result } = renderHook(() => useRBAC());

      expect(result.current.canAccessEOS()).toBe(false);
      expect(result.current.isVivacityTeam).toBe(false);
    });
  });

  describe("Route Access Control", () => {
    it("should allow Vivacity Team to access EOS routes", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockVivacityProfile,
          unicorn_role: "Team Member",
        },
        isSuperAdmin: () => false,
      });

      const { result } = renderHook(() => useRBAC());

      EOS_ROUTES.forEach((route) => {
        expect(result.current.canAccessRoute(route)).toBe(true);
      });
    });

    it("should block client users from EOS routes", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockClientProfile,
          unicorn_role: "Admin",
        },
        isSuperAdmin: () => false,
      });

      const { result } = renderHook(() => useRBAC());

      EOS_ROUTES.forEach((route) => {
        expect(result.current.canAccessRoute(route)).toBe(false);
      });
    });

    it("should block Team Leader from admin routes", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockVivacityProfile,
          unicorn_role: "Team Leader",
        },
        isSuperAdmin: () => false,
      });

      const { result } = renderHook(() => useRBAC());

      ADMIN_ROUTES.forEach((route) => {
        expect(result.current.canAccessRoute(route)).toBe(false);
      });
    });

    it("should allow SuperAdmin to access admin routes", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockVivacityProfile,
          unicorn_role: "Super Admin",
          global_role: "SuperAdmin",
        },
        isSuperAdmin: () => true,
      });

      const { result } = renderHook(() => useRBAC());

      ADMIN_ROUTES.forEach((route) => {
        expect(result.current.canAccessRoute(route)).toBe(true);
      });
    });
  });

  describe("Permission Checks", () => {
    it("should grant all permissions to SuperAdmin", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockVivacityProfile,
          unicorn_role: "Super Admin",
        },
        isSuperAdmin: () => true,
      });

      const { result } = renderHook(() => useRBAC());

      expect(result.current.hasPermission("eos:access")).toBe(true);
      expect(result.current.hasPermission("administration:access")).toBe(true);
      expect(result.current.hasPermission("vto:edit")).toBe(true);
      expect(result.current.hasPermission("eos_meetings:schedule")).toBe(true);
      expect(result.current.hasPermission("rocks:create")).toBe(true);
      expect(result.current.hasPermission("risks:escalate")).toBe(true);
    });

    it("should grant EOS permissions to Team Leader but not admin", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockVivacityProfile,
          unicorn_role: "Team Leader",
        },
        isSuperAdmin: () => false,
      });

      const { result } = renderHook(() => useRBAC());

      expect(result.current.hasPermission("eos:access")).toBe(true);
      expect(result.current.hasPermission("administration:access")).toBe(false);
      expect(result.current.hasPermission("vto:edit")).toBe(true);
      expect(result.current.hasPermission("eos_meetings:schedule")).toBe(true);
    });

    it("should grant limited permissions to Team Member", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockVivacityProfile,
          unicorn_role: "Team Member",
        },
        isSuperAdmin: () => false,
      });

      const { result } = renderHook(() => useRBAC());

      expect(result.current.hasPermission("eos:access")).toBe(true);
      expect(result.current.hasPermission("rocks:create")).toBe(true);
      expect(result.current.hasPermission("rocks:edit_own")).toBe(true);
      // Team Members cannot schedule meetings
      expect(result.current.hasPermission("eos_meetings:schedule")).toBe(false);
    });

    it("should grant no EOS permissions to client users", () => {
      mockUseAuth.mockReturnValue({
        profile: {
          ...mockClientProfile,
          unicorn_role: "Admin",
        },
        isSuperAdmin: () => false,
      });

      const { result } = renderHook(() => useRBAC());

      expect(result.current.hasPermission("eos:access")).toBe(false);
      expect(result.current.hasPermission("vto:edit")).toBe(false);
      expect(result.current.hasPermission("rocks:create")).toBe(false);
    });
  });

  describe("EOS Routes Array", () => {
    it("should contain all required EOS routes", () => {
      const requiredRoutes = [
        "/eos",
        "/eos/rocks",
        "/eos/meetings",
        "/eos/risks-opportunities",
        "/eos/qc",
        "/eos/accountability",
        "/eos/vto",
        "/eos/scorecard",
        "/eos/todos",
      ];

      requiredRoutes.forEach((route) => {
        expect(EOS_ROUTES).toContain(route);
      });
    });

    it("should include health-check route", () => {
      expect(EOS_ROUTES).toContain("/eos/health-check");
    });
  });
});
