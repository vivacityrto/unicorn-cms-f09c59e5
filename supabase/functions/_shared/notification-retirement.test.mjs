/**
 * Regression checks for the M3-B notification retirement boundary.
 *
 * The schedule table remains in place for M3-C. These checks make sure the
 * dormant queue is retired without accidentally removing the active outbox
 * contract or the legacy email response paths.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(join(here, "..", relative), "utf8");

describe("M3-B notification retirement", () => {
  it("removes all dormant schedule writes but preserves the three email automation paths", () => {
    const src = read("send-automated-email/index.ts");
    assert.doesNotMatch(src, /notification_schedule/);
    assert.match(src, /audit_24hr_confirmation/);
    assert.match(src, /audit_evidence_reminder/);
    assert.match(src, /audit_docs_ready/);
  });

  it("keeps the old queue slug as a credential-free 410 stub", () => {
    const src = read("process-notification-queue/index.ts");
    assert.match(src, /FUNCTION_RETIRED/);
    assert.match(src, /status:\s*410/);
    assert.doesNotMatch(src, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(src, /notification_schedule/);
  });

  it("does not retire the active outbox worker", () => {
    const src = read("process-notification-outbox/index.ts");
    assert.doesNotMatch(src, /FUNCTION_RETIRED/);
    assert.match(src, /notification_audit_log/);
  });
});
