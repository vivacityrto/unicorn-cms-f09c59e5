/**
 * Source-level checks for summarise-rock-notes.
 *
 * The function reads Rock notes with the service role and calls a paid AI gateway, so the
 * properties that matter are: staff-only access is checked before anything is read or spent,
 * the only caller input is a validated Rock id, the AI can only produce a stored summary (it
 * creates nothing else), and its output is validated before it is stored.
 *
 * Run: node --test supabase/functions/summarise-rock-notes/auth-gate.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "index.ts"), "utf8");
const config = readFileSync(join(here, "..", "..", "config.toml"), "utf8");

describe("summarise-rock-notes", () => {
  it("runs the staff AI gate before reading the body, the database or the AI gateway", () => {
    assert.match(src, /import \{[^}]*requireCaller[^}]*\} from "\.\.\/_shared\/requireCaller\.ts"/);
    assert.match(src, /featureKey: FeatureKeys\.staffAi/);
    const gate = src.indexOf("await requireCaller(");
    for (const later of ["req.json()", '.from("eos_rocks")', "fetch(\"https://ai.gateway"]) {
      const at = src.indexOf(later);
      assert.ok(gate > 0 && at > gate, `gate must come before ${later}`);
    }
    assert.match(src, /if \(!caller\.ok\) return caller\.response;/);
  });

  it("only uses a validated uuid from the request", () => {
    assert.match(src, /const UUID = /);
    assert.match(src, /UUID\.test\(rockId\)/);
    assert.equal((src.match(/req\.json\(\)/g) ?? []).length, 1);
    assert.doesNotMatch(src, /new URL\(req\.url|searchParams/);
  });

  it("makes exactly one outbound call, to the fixed AI gateway", () => {
    const fetches = src.match(/\bfetch\(/g) ?? [];
    assert.equal(fetches.length, 1);
    assert.match(src, /fetch\("https:\/\/ai\.gateway\.lovable\.dev\/v1\/chat\/completions"/);
  });

  it("stores only a validated summary and writes to nothing else", () => {
    assert.match(src, /parseSummary\(/);
    const writes = src.match(/\.(insert|update|upsert|delete)\(/g) ?? [];
    assert.deepEqual(writes, [".insert("]);
    assert.match(src, /\.from\("eos_rock_note_summaries"\)\s*\n\s*\.insert\(/);
    assert.doesNotMatch(src, /\.from\("eos_todos"\)/);
  });

  it("does not return a raw AI failure to the caller", () => {
    assert.doesNotMatch(src, /error: String\(error\)|error\.message \}/);
    assert.match(src, /json\(req, 502,/);
  });

  it("is registered in config.toml with in-function auth", () => {
    assert.match(config, /\[functions\.summarise-rock-notes\]\s*\nverify_jwt = false/);
  });
});
