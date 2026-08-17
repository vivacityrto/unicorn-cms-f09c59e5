import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Vimeo duration backfill is an unauthenticated-safe retirement stub", async () => {
  const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(source, /FUNCTION_RETIRED/);
  assert.match(source, /status:\s*410/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin/);
});
