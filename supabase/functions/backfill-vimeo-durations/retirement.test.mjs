import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Vimeo duration backfill preserves the UI batch contract behind Super Admin auth", async () => {
  const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(source, /supabase\.auth\.getUser\(token\)/);
  assert.match(source, /unicorn_role !== "Super Admin"/);
  assert.match(source, /body\?\.batchSize/);
  assert.match(source, /VIMEO_ACCESS_TOKEN/);
  assert.match(source, /remaining_null/);
  assert.doesNotMatch(source, /Allow-Origin.*\*/);
});
