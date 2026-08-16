import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertStateCaller } from "./oauth-states.ts";

Deno.test("assertStateCaller accepts a matching verified caller", () => {
  assertEquals(assertStateCaller("user-1", "user-1"), { ok: true });
});

Deno.test("assertStateCaller rejects a different caller", () => {
  const result = assertStateCaller("attacker", "user-1");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 403);
  }
});

Deno.test("assertStateCaller rejects a missing state user_id", () => {
  const result = assertStateCaller("user-1", undefined);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 400);
  }
});
