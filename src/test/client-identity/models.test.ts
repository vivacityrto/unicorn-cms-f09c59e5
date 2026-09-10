import { describe, expect, it } from "vitest";

import {
  mapUserCapacity,
  resolveTenantMemberRelationshipRole,
} from "@/features/client-identity/models";

describe("client identity projection models", () => {
  it.each([
    [{ used: 2, limit: 5, is_unlimited: false }, { used: 2, limit: 5, isUnlimited: false, atLimit: false }],
    [{ used: 5, limit: 5, is_unlimited: false }, { used: 5, limit: 5, isUnlimited: false, atLimit: true }],
    [{ used: 9, limit: null, is_unlimited: true }, { used: 9, limit: null, isUnlimited: true, atLimit: false }],
  ] as const)("maps the capacity RPC row without changing cap semantics", (row, expected) => {
    expect(mapUserCapacity(row)).toEqual(expected);
  });

  it.each([
    [{ relationship_role: "secondary_contact", primary_contact: true, secondary_contact: false, role: "parent" }, "secondary_contact"],
    [{ relationship_role: null, primary_contact: false, secondary_contact: true, role: "child" }, "secondary_contact"],
    [{ relationship_role: null, primary_contact: true, secondary_contact: false, role: "child" }, "primary_contact"],
    [{ relationship_role: null, primary_contact: false, secondary_contact: false, role: "parent" }, "primary_contact"],
    [{ relationship_role: null, primary_contact: false, secondary_contact: false, role: "child" }, "user"],
  ] as const)("resolves canonical role before legacy fallbacks", (member, expected) => {
    expect(resolveTenantMemberRelationshipRole(member)).toBe(expected);
  });
});
