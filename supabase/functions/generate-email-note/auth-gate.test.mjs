/**
 * Regression checks for generate-email-note IDOR + privacy gates.
 *
 * Run: node --test supabase/functions/generate-email-note/auth-gate.test.mjs
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

describe("generate-email-note authorization and privacy gates", () => {
  it("fetches the email with the ANON-key caller client before service role", () => {
    const userFetch = src.indexOf('userClient\n      .from("email_messages")');
    const userFetchAlt = src.indexOf(".from(\"email_messages\")");
    const serviceIdx = src.indexOf("createClient(SUPABASE_URL, SERVICE_ROLE)");
    const firstEmailFrom = src.indexOf('.from("email_messages")');
    assert.ok(firstEmailFrom >= 0, "email_messages fetch present");
    assert.ok(firstEmailFrom < serviceIdx, "RLS-scoped fetch before service role");
    assert.match(src, /createClient\(SUPABASE_URL,\s*ANON_KEY/);
    assert.match(src, /Authorization:\s*authHeader/);
  });

  it("returns 404 when the caller-scoped fetch is empty", () => {
    assert.match(src, /if\s*\(\s*emailErr\s*\|\|\s*!email\s*\)/);
    assert.match(src, /json\(\s*(?:req,\s*)?404/);
  });

  it("does not use service role to fetch the email body", () => {
    const serviceBlock = src.slice(src.indexOf("createClient(SUPABASE_URL, SERVICE_ROLE)"));
    assert.doesNotMatch(serviceBlock, /\.from\(\s*["']email_messages["']\s*\)/);
  });

  it("gates the external AI forward on the per-tenant opt-in flag", () => {
    assert.match(src, /ai_email_note_external_forward_enabled/);
    assert.match(src, /AI_FORWARD_NOT_OPTED_IN/);
    const flagIdx = src.indexOf("tenantAllowsExternalEmailForward");
    const aiIdx = src.indexOf("AI_DESTINATION");
    const fetchAi = src.lastIndexOf("await fetch(AI_DESTINATION");
    assert.ok(flagIdx >= 0 && fetchAi >= 0);
    assert.ok(flagIdx < fetchAi, "opt-in check before AI fetch");
  });

  it("writes an audit row with caller id, email id, and destination before forwarding", () => {
    assert.match(src, /action:\s*["']ai\.email_forwarded_external["']/);
    assert.match(src, /caller_id:\s*userData\.user\.id/);
    assert.match(src, /email_id/);
    assert.match(src, /destination:\s*AI_DESTINATION/);
    const auditIdx = src.indexOf("client_audit_log");
    const fetchAi = src.lastIndexOf("await fetch(AI_DESTINATION");
    assert.ok(auditIdx >= 0 && auditIdx < fetchAi, "audit insert before AI fetch");
  });
});
