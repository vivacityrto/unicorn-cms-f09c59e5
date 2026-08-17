import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("browse handler receives the request needed for CORS responses", () => {
  assert.match(source, /handleBrowse\(req, supabase, body\)/);
  assert.match(
    source,
    /async function handleBrowse\(\s*req: Request,\s*supabase:/s,
  );
});
