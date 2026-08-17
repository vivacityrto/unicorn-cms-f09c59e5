import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

for (const functionName of ['get-email-status', 'report-delivery-issue']) {
  test(`${functionName} forwards the caller bearer token to PostgREST`, () => {
    const source = readFileSync(new URL(`./${functionName}/index.ts`, import.meta.url), 'utf8');
    assert.match(source, /Authorization: req\.headers\.get\('Authorization'\) \?\? ''/);
  });
}
