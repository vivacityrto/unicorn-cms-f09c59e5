import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

for (const action of ["Import", "CheckDrift", "Publish", "Browse"]) {
  test(`${action} handler receives the request needed for CORS responses`, () => {
    assert.match(source, new RegExp(`handle${action}\\(req,`));
    assert.match(
      source,
      new RegExp(`async function handle${action}\\(\\s*req: Request,`, "s"),
    );
  });
}

test("browse handler keeps the request context wiring", () => {
  assert.match(source, /handleBrowse\(req, supabase, body\)/);
  assert.match(
    source,
    /async function handleBrowse\(\s*req: Request,\s*supabase:/s,
  );
});
