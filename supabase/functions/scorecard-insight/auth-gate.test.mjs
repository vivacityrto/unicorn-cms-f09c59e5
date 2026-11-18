/**
 * Source-level checks for scorecard-insight.
 *
 * The function reads scorecard and client data with the service role and calls a paid AI service, so the
 * properties that matter are: staff-only access is checked before anything is read or spent, the only caller
 * input is a validated measure id and week, it writes nothing, it sends no learner or email data, and the AI's
 * output is validated before it is returned.
 *
 * Run: node --test supabase/functions/scorecard-insight/auth-gate.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "index.ts"), "utf8");
const shared = readFileSync(join(here, "..", "_shared", "scorecard-insight.ts"), "utf8");
const config = readFileSync(join(here, "..", "..", "config.toml"), "utf8");

describe("scorecard-insight", () => {
  it("runs the staff AI gate before reading the body, the database or the AI", () => {
    assert.match(src, /import \{[^}]*requireCaller[^}]*\} from "\.\.\/_shared\/requireCaller\.ts"/);
    assert.match(src, /featureKey: FeatureKeys\.staffAi/);
    const gate = src.indexOf("await requireCaller(");
    for (const later of ["req.json()", '.from("eos_scorecard_metrics")', "await callAnthropic("]) {
      const at = src.indexOf(later);
      assert.ok(gate > 0 && at > gate, `gate must come before ${later}`);
    }
    assert.match(src, /if \(!caller\.ok\) return caller\.response;/);
  });

  it("only uses a validated measure id and a Monday week key from the request", () => {
    assert.match(src, /UUID\.test\(metricId\)/);
    assert.match(src, /DAY\.test\(weekKey\)/);
    assert.match(src, /getUTCDay\(\) !== 1/);
    assert.equal((src.match(/req\.json\(\)/g) ?? []).length, 1);
    assert.doesNotMatch(src, /new URL\(req\.url|searchParams/);
  });

  it("writes nothing", () => {
    assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\(/);
  });

  it("makes no outbound call of its own, only the shared Anthropic client", () => {
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.match(src, /import \{[^}]*callAnthropic[^}]*\} from "\.\.\/_shared\/anthropic-client\.ts"/);
    assert.equal((src.match(/await callAnthropic\(/g) ?? []).length, 1);
    assert.match(src, /tool_choice: \{ type: "tool", name: INSIGHT_TOOL\.name \}/);
  });

  it("sends no learner names or email addresses to the AI", () => {
    assert.doesNotMatch(src, /select\("[^"]*\bemail\b/);
    // Certificates are counted by course and client; the learner is never selected.
    assert.match(src, /\.select\("course_id, tenant_id, issued_at"\)/);
    assert.doesNotMatch(shared, /first_name|last_name|email/i);
    // The only people read are the measure owner and the CSCs, by name.
    const userReads = src.match(/\.from\("users"\)\s*\.select\("([^"]*)"\)/g) ?? [];
    assert.ok(userReads.length >= 1 && userReads.every((r) => /first_name, last_name/.test(r) && !/email/.test(r)));
  });

  it("validates the AI output and does not return a raw failure", () => {
    assert.match(src, /parseInsight\(/);
    assert.doesNotMatch(src, /error: String\(error\)|error\.message \}/);
    assert.match(src, /json\(req, 502,/);
  });

  it("does not call a client never active when the last-activity read failed", () => {
    assert.match(src, /lastSeen\.error/);
    assert.match(src, /!activityKnown \? undefined/);
  });

  it("does not send a temperature, which the current model rejects with a 400", () => {
    assert.doesNotMatch(src, /^\s*temperature\s*:/m);
  });

  it("bounds the AI call with a timeout", () => {
    assert.match(src, /AbortController/);
    assert.match(src, /AI_TIMEOUT_MS/);
  });

  it("is registered in config.toml with in-function auth", () => {
    assert.match(config, /\[functions\.scorecard-insight\]\s*\r?\nverify_jwt = false/);
  });
});
