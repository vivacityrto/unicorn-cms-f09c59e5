/**
 * Regression checks for the shared verifyAuth account-status gate and its
 * downstream Ask Viv consumers.
 *
 * Background: verifyAuth() (and a second, independent copy in
 * ask-viv-access.ts's validateClientAskVivAccess) used to reject a caller
 * whose profile.state was 'inactive' or 'suspended'. public.users.state is
 * actually a bigint column unrelated to account status, so that comparison
 * could never match -- the gate was silently dead. Disabling/archiving a
 * user never revokes their Supabase Auth session (the toggle-status RPC
 * only flips public.users.disabled), so a disabled/archived account's
 * still-valid session retained full access to every function relying on
 * this gate. Fixed 2026-09-15 -- see
 * docs/audit-log/entries/2026-09-15-fix-verify-auth-dead-account-status-check.md.
 *
 * Run: node --test supabase/functions/_shared/auth-helpers.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const authHelpersSrc = readFileSync(join(here, "auth-helpers.ts"), "utf8");
const askVivAccessSrc = readFileSync(join(here, "ask-viv-access.ts"), "utf8");

describe("verifyAuth account-status gate (auth-helpers.ts)", () => {
  it("selects disabled and archived from public.users", () => {
    assert.match(
      authHelpersSrc,
      /\.select\(\s*["']user_uuid, unicorn_role, email, first_name, last_name, state, disabled, archived["']\s*\)/,
    );
  });

  it("rejects a disabled or archived profile", () => {
    assert.match(authHelpersSrc, /if\s*\(\s*profile\.disabled\s*\|\|\s*profile\.archived\s*\)/);
  });

  it("no longer compares profile.state to 'inactive'/'suspended' (the dead check)", () => {
    assert.doesNotMatch(authHelpersSrc, /profile\.state\s*===\s*["']inactive["']/);
    assert.doesNotMatch(authHelpersSrc, /profile\.state\s*===\s*["']suspended["']/);
  });

  it("UserProfile interface exposes disabled/archived as booleans", () => {
    assert.match(authHelpersSrc, /disabled:\s*boolean\s*\|\s*null;/);
    assert.match(authHelpersSrc, /archived:\s*boolean\s*\|\s*null;/);
  });
});

describe("validateClientAskVivAccess account-status gate (ask-viv-access.ts)", () => {
  it("checks profile.disabled/profile.archived, not the dead profile.state comparison", () => {
    assert.match(askVivAccessSrc, /if\s*\(\s*profile\?\.disabled\s*\|\|\s*profile\?\.archived\s*\)/);
    assert.doesNotMatch(askVivAccessSrc, /profile\?\.state\s*===\s*["']inactive["']/);
    assert.doesNotMatch(askVivAccessSrc, /profile\?\.state\s*===\s*["']suspended["']/);
  });

  it("still denies with the same reason code and user-facing message", () => {
    assert.match(askVivAccessSrc, /logDeniedAccess\(supabase, userId, role, endpoint, ["']user_archived["']\)/);
    assert.match(askVivAccessSrc, /return\s*\{\s*allowed:\s*false,\s*reason:\s*["']user_archived["']\s*\}/);
  });
});
