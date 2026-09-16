/**
 * Regression checks for the Edge Function affected-set selector.
 *
 * Run: node --test scripts/select-affected-edge-functions.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectAffectedFunctions } from "./select-affected-edge-functions.mjs";

describe("selectAffectedFunctions", () => {
  it("a function whose own index.ts changed is affected", () => {
    const result = selectAffectedFunctions({
      changedFilesList: ["supabase/functions/ai-suggest-rock/index.ts"],
    });
    assert.ok(result.includes("ai-suggest-rock"));
  });

  it("a shared file used by many functions marks all of them affected, not just the directly-changed one", () => {
    // auth-helpers.ts is imported (directly or transitively) by many
    // functions in the real repo, including ai-suggest-rock and
    // ask-viv-assistant-client -- this is the exact class of gap that
    // caused a real incident (2026-09-15): only some importers got
    // redeployed after a shared security fix.
    const result = selectAffectedFunctions({
      changedFilesList: ["supabase/functions/_shared/auth-helpers.ts"],
    });
    assert.ok(result.includes("ai-suggest-rock"));
    assert.ok(result.includes("ask-viv-assistant-client"));
    assert.ok(result.length > 5, "expected many functions to depend on auth-helpers.ts");
  });

  it("a nested shared subdirectory module (ask-viv-fact-builder/) is followed transitively", () => {
    // This subdirectory import was the exact gap missed during the manual
    // 2026-09-15 rollout -- ask-viv-assistant-client imports
    // ../_shared/ask-viv-fact-builder/index.ts, which itself imports
    // several sibling files in that same subdirectory.
    const result = selectAffectedFunctions({
      changedFilesList: ["supabase/functions/_shared/ask-viv-fact-builder/data-retrieval.ts"],
    });
    assert.ok(result.includes("ask-viv-assistant-client"));
  });

  it("a completely unrelated function's own file does not affect other functions", () => {
    const result = selectAffectedFunctions({
      changedFilesList: ["supabase/functions/tga-rto-sync/index.ts"],
    });
    assert.ok(result.includes("tga-rto-sync"));
    assert.ok(!result.includes("ai-suggest-rock"));
  });

  it("a change with no matches returns an empty list", () => {
    const result = selectAffectedFunctions({
      changedFilesList: ["supabase/functions/_shared/this-file-does-not-exist.ts"],
    });
    assert.deepEqual(result, []);
  });
});
