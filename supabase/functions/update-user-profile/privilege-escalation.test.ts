/**
 * Regression: a non-super-admin must not escalate via update-user-profile.
 *
 * A caller without admin.team_users.manage who sends superadmin_level on
 * their own row must receive 403, and applyUsersProfileUpdate must not
 * invoke the write callback — the row stays unchanged.
 *
 * Run:
 *   node --experimental-strip-types --test supabase/functions/update-user-profile/privilege-escalation.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_ADMIN_FIELDS,
  ALLOWED_SELF_FIELDS,
  PROTECTED_USER_FIELDS,
  applyUsersProfileUpdate,
  authorizeAndBuildProfileUpdate,
  authorizeRoleUpdateBody,
  buildAllowlistedProfileUpdates,
  findProtectedFieldsInBody,
} from "../_shared/users-write-allowlist.ts";

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(join(here, "index.ts"), "utf8");
const allowlistSrc = readFileSync(
  join(here, "../_shared/users-write-allowlist.ts"),
  "utf8",
);

const SELF_ID = "11111111-1111-1111-1111-111111111111";

describe("update-user-profile privilege escalation", () => {
  it("non-super-admin setting superadmin_level on own row gets 403 and the row is unchanged", async () => {
    let writeCalls = 0;
    const prior = { superadmin_level: null as string | null, first_name: "Ada" };
    const row = { ...prior };

    const result = await applyUsersProfileUpdate({
      callerId: SELF_ID,
      targetUserUuid: SELF_ID,
      hasManagePermission: false,
      isClientAdmin: false,
      body: {
        user_uuid: SELF_ID,
        first_name: "Hacked",
        superadmin_level: "Administrator",
      },
      updateRow: async (_uuid, updates) => {
        writeCalls += 1;
        Object.assign(row, updates);
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected failure");
    assert.equal(result.status, 403);
    assert.equal(result.code, "FORBIDDEN");
    assert.match(result.detail, /superadmin_level/);
    assert.equal(writeCalls, 0);
    assert.deepEqual(row, prior);
  });

  it("rejects every protected field for a non-super-admin self-edit", () => {
    for (const field of PROTECTED_USER_FIELDS) {
      const decision = authorizeAndBuildProfileUpdate({
        callerId: SELF_ID,
        targetUserUuid: SELF_ID,
        hasManagePermission: false,
        isClientAdmin: false,
        body: { user_uuid: SELF_ID, [field]: "escalation" },
      });
      assert.equal(decision.ok, false, `${field} must 403`);
      assert.equal(decision.status, 403);
    }
  });

  it("does not spread unknown or protected columns into a self-edit payload", () => {
    const updates = buildAllowlistedProfileUpdates(
      {
        user_uuid: SELF_ID,
        first_name: "Ada",
        timezone: "Australia/Sydney",
        superadmin_level: "Administrator",
        is_vivacity_internal: true,
        global_role: "superadmin",
        tenant_id: 1,
        email: "stolen@example.com",
        not_a_column: "nope",
      },
      { isSelf: true, hasManagePermission: false },
    );

    assert.deepEqual(updates, {
      first_name: "Ada",
      timezone: "Australia/Sydney",
    });
    assert.equal("superadmin_level" in updates, false);
    assert.equal("email" in updates, false);
  });

  it("allows a self-edit of an allowlisted profile field", async () => {
    let written: Record<string, unknown> | null = null;
    const result = await applyUsersProfileUpdate({
      callerId: SELF_ID,
      targetUserUuid: SELF_ID,
      hasManagePermission: false,
      isClientAdmin: false,
      body: { user_uuid: SELF_ID, first_name: "Ada", preferred_name: "A" },
      updateRow: async (_uuid, updates) => {
        written = updates;
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(written, { first_name: "Ada", preferred_name: "A" });
  });
});

describe("update-user-profile wiring", () => {
  it("creates the users client with the anon key + caller JWT, not service role", () => {
    assert.match(indexSrc, /createUserClient\(authHeader\)/);
    assert.match(indexSrc, /from\("users"\)[\s\S]*?\.update\(updatePayload\)/);
    assert.doesNotMatch(
      indexSrc,
      /createClient\([\s\S]*SUPABASE_SERVICE_ROLE_KEY[\s\S]*Authorization/,
    );
    const updateIdx = indexSrc.indexOf('from("users")');
    const serviceUpdate = indexSrc.indexOf("serviceClient.from(\"users\")");
    assert.ok(updateIdx >= 0, "users write present");
    assert.equal(serviceUpdate, -1, "service client must not write public.users");
  });

  it("never spreads an unfiltered rest object into the UPDATE", () => {
    assert.doesNotMatch(indexSrc, /\.\.\.(updates|body|rest)\b/);
    assert.match(indexSrc, /applyUsersProfileUpdate/);
    assert.match(indexSrc, /Object\.assign\(\{\}, updates/);
  });

  it("403s protected fields before any write", () => {
    assert.match(allowlistSrc, /findProtectedFieldsInBody/);
    for (const field of [
      "is_vivacity_internal",
      "global_role",
      "superadmin_level",
      "tenant_id",
      "unicorn_role",
      "user_type",
      "archived",
    ]) {
      assert.match(allowlistSrc, new RegExp(`["']${field}["']`));
    }
    assert.ok(
      findProtectedFieldsInBody({ superadmin_level: "Administrator" }).includes(
        "superadmin_level",
      ),
    );
  });

  it("update-user-role rejects privilege columns outside its contract", () => {
    const blocked = authorizeRoleUpdateBody({
      user_uuid: SELF_ID,
      unicorn_role: "Team Member",
      is_vivacity_internal: true,
      global_role: "superadmin",
      archived: true,
    });
    assert.equal(blocked.ok, false);
    if (blocked.ok) throw new Error("expected failure");
    assert.equal(blocked.status, 403);
    assert.match(blocked.detail, /is_vivacity_internal/);

    const allowed = authorizeRoleUpdateBody({
      user_uuid: SELF_ID,
      unicorn_role: "Team Member",
      superadmin_level: "Team Leader",
      tenant_id: 6372,
    });
    assert.equal(allowed.ok, true);
    if (!allowed.ok) throw new Error("expected success");
    assert.deepEqual(allowed.updates, {
      unicorn_role: "Team Member",
      superadmin_level: "Team Leader",
      tenant_id: 6372,
    });
  });

  it("keeps staff-safe columns in the self allowlist and privilege columns out", () => {
    const self = ALLOWED_SELF_FIELDS as readonly string[];
    const admin = ALLOWED_ADMIN_FIELDS as readonly string[];
    for (const col of ["full_name", "job_title", "phone"]) {
      assert.ok(self.includes(col), `${col} is a user_staff_safe_fields column`);
    }
    for (const col of PROTECTED_USER_FIELDS) {
      assert.equal(self.includes(col), false, `${col} must not be self-editable`);
    }
    assert.ok(admin.includes("email"));
    assert.equal(admin.includes("superadmin_level"), false);
  });
});
