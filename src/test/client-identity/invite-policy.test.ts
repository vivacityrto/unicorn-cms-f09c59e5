import { describe, expect, it } from "vitest";

import {
  CLIENT_INVITE_ROLE_MAP,
  mapClientInviteAccess,
} from "@/features/client-identity/invite-policy";

describe("client invitation policy", () => {
  it("keeps the client portal ceiling to the three supported access levels", () => {
    expect(Object.keys(CLIENT_INVITE_ROLE_MAP).sort()).toEqual([
      "academy",
      "secondary",
      "user",
    ]);
  });

  it.each([
    ["academy", { unicorn_role: "User", relationship_role: "academy_user" }],
    ["secondary", { unicorn_role: "Admin", relationship_role: "secondary_contact" }],
    ["user", { unicorn_role: "User", relationship_role: "user" }],
  ] as const)("maps %s without widening its role contract", (accessLevel, expected) => {
    expect(mapClientInviteAccess(accessLevel)).toEqual(expected);
  });
});
