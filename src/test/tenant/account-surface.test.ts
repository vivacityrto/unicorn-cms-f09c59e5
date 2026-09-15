import { describe, expect, it } from "vitest";
import { getTenantAccountType, isAcademySoloTenant } from "@/lib/tenantAccountSurface";

describe("tenant account surface classification", () => {
  it("classifies the Academy Solo metadata marker as an Academy account", () => {
    const metadata = { academy_solo: { plan_code: "academy_solo", status: "active" } };

    expect(isAcademySoloTenant(metadata)).toBe(true);
    expect(getTenantAccountType(metadata)).toBe("academy_solo");
  });

  it("keeps ordinary and malformed metadata on the RTO surface", () => {
    expect(isAcademySoloTenant({})).toBe(false);
    expect(isAcademySoloTenant({ academy_solo: true })).toBe(false);
    expect(isAcademySoloTenant(null)).toBe(false);
    expect(getTenantAccountType({})).toBe("rto");
  });
});
