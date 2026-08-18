/**
 * Regression: import-unicorn1-client must validate the caller-supplied
 * client_id against the Unicorn 1 source BEFORE running any destructive
 * clearTenantInstanceData call, and must record the destructive action
 * in client_audit_log. The bug (N4, 2026-08-16 audit) was that validation
 * only ran inside the `opts.tenant` branch, after cleanup had already
 * executed — so an invalid/arbitrary client_id still wiped a tenant's
 * package/stage/task/document instances before the 404 was ever reached.
 *
 * Run: node --test supabase/functions/import-unicorn1-client/ordering.test.mjs
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

describe("import-unicorn1-client destructive ordering", () => {
  it("validates the client exists in Unicorn 1 before clearing tenant data", () => {
    const validateIdx = src.indexOf("FROM [dbo].[Users] WHERE [Discriminator] = 'Client'");
    const clearIdx = src.indexOf("await clearTenantInstanceData(svcClient, client_id)");
    assert.ok(validateIdx >= 0, "U1 client existence query present");
    assert.ok(clearIdx >= 0, "clearTenantInstanceData call present");
    assert.ok(
      validateIdx < clearIdx,
      "Unicorn 1 client validation must run before the destructive clear",
    );
  });

  it("runs the validation unconditionally, not gated on opts.tenant", () => {
    const optsTenantIdx = src.indexOf("if (opts.tenant)");
    const validateIdx = src.indexOf("FROM [dbo].[Users] WHERE [Discriminator] = 'Client'");
    assert.ok(
      validateIdx < optsTenantIdx,
      "validation must happen before the opts.tenant branch, not inside it",
    );
  });

  it("returns 404 without touching instance data when the client is not found", () => {
    const notFoundIdx = src.indexOf("not found in Unicorn 1");
    const clearIdx = src.indexOf("await clearTenantInstanceData(svcClient, client_id)");
    assert.ok(notFoundIdx >= 0 && notFoundIdx < clearIdx, "404 branch precedes the clear");
  });

  it("writes a client_audit_log row for the destructive clear before returning results", () => {
    assert.match(src, /action:\s*["']unicorn1_import_cleared["']/);
    assert.match(src, /entity_type:\s*["']tenant["']/);
    assert.match(src, /actor_user_id:\s*caller\.user\.id/);
    const auditIdx = src.indexOf("unicorn1_import_cleared");
    const clearIdx = src.indexOf("await clearTenantInstanceData(svcClient, client_id)");
    const returnIdx = src.indexOf("return new Response(JSON.stringify(results)");
    assert.ok(clearIdx < auditIdx, "audit write happens after the clear it documents");
    assert.ok(auditIdx < returnIdx, "audit write happens before the success response");
  });
});
