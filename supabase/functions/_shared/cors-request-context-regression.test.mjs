import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const functions = [
  "embed-ask-viv-corpus",
  "embed-ask-viv-documents",
];

for (const functionName of functions) {
  test(`${functionName} passes its request to CORS-aware JSON responses`, () => {
    const source = readFileSync(
      new URL(`../${functionName}/index.ts`, import.meta.url),
      "utf8",
    );

    assert.match(source, /function json\(req: Request, body: unknown, status: number\)/);
    assert.doesNotMatch(source, /return json\(\s*\{/);
  });
}

test("set-invite-password passes its request on every JSON response path", () => {
  const source = readFileSync(
    new URL("../set-invite-password/index.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /return json\((?!req,)/);
});
