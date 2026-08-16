/**
 * Regression checks for capture-outlook-email tenant membership.
 *
 * The function must call has_tenant_access_safe after the caller is
 * established and before the email_messages insert or the
 * email-attachments storage upload.
 *
 * Run: node --test supabase/functions/capture-outlook-email/auth-gate.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "index.ts"),
  "utf8",
);

describe("capture-outlook-email tenant membership gate", () => {
  it("calls hasTenantAccessSafe after the caller is established", () => {
    const callerIdx = src.indexOf("claimsData.claims.sub");
    const accessIdx = src.indexOf("await hasTenantAccessSafe");
    assert.ok(callerIdx >= 0, "caller is established from JWT claims");
    assert.ok(accessIdx > callerIdx, "membership check follows caller establishment");
  });

  it("returns 403 when the caller is not a member of the requested tenant", () => {
    const accessIdx = src.indexOf("await hasTenantAccessSafe");
    const forbiddenIdx = src.indexOf("Forbidden: no access to this tenant");
    assert.ok(accessIdx >= 0, "hasTenantAccessSafe call present");
    assert.ok(forbiddenIdx > accessIdx, "403 follows the membership check");
    assert.match(src, /status:\s*403/);
  });

  it("applies the membership check before the DB insert and storage upload", () => {
    const accessIdx = src.indexOf("await hasTenantAccessSafe");
    const insertIdx = src.indexOf('.from("email_messages")');
    const uploadIdx = src.indexOf('.from("email-attachments")');

    assert.ok(accessIdx >= 0, "hasTenantAccessSafe call present");
    assert.ok(insertIdx > accessIdx, "email_messages write after membership gate");
    assert.ok(uploadIdx > accessIdx, "storage upload after membership gate");
  });
});
