import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./index.ts", import.meta.url),
  "utf8",
);

test("test-mailgun keeps its Super Admin gate behind request-aware CORS", () => {
  assert.match(source, /import \{ corsHeaders \} from "\.\.\/_shared\/cors\.ts"/);
  assert.match(source, /corsHeaders\(req\)/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin"\s*:\s*"\*"/);
  assert.match(source, /auth\.getUser\(callerToken\)/);
  assert.match(source, /\["Super Admin", "SuperAdmin"\]/);
});
