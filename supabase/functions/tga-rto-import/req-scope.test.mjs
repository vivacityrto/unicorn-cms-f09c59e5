import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// L10 #29 regression guard: handleImport/handleStatus previously called
// jsonResponse(req, ...) internally without receiving `req` as a parameter
// -- `req` only existed in the outer serve(async (req) => {...}) closure, so
// every real invocation of action=import or the default/status path threw
// `ReferenceError: req is not defined` instead of returning a response.
// Both helpers must declare `req: Request` as their first parameter, and
// every call site must pass `req` as the first argument.

assert.match(
  source,
  /async function handleImport\(\s*req: Request,/,
  'handleImport must declare req: Request as its first parameter',
);
assert.match(
  source,
  /async function handleStatus\(\s*req: Request,/,
  'handleStatus must declare req: Request as its first parameter',
);

const handleImportCalls = [...source.matchAll(/handleImport\(([^,]+),/g)].map((m) => m[1].trim());
const handleStatusCalls = [...source.matchAll(/handleStatus\(([^,]+),/g)].map((m) => m[1].trim());

// Exclude the function declarations themselves (matched above), keep only
// call sites -- a declaration line starts with `async function`.
const isDeclaration = (fullMatch) => /^\s*async function/.test(fullMatch);
const importCallSites = [...source.matchAll(/(async function )?handleImport\(([^,]+),/g)]
  .filter((m) => !isDeclaration(m[1] || ''))
  .map((m) => m[2].trim());
const statusCallSites = [...source.matchAll(/(async function )?handleStatus\(([^,]+),/g)]
  .filter((m) => !isDeclaration(m[1] || ''))
  .map((m) => m[2].trim());

assert.ok(importCallSites.length > 0, 'must find at least one handleImport(...) call site');
assert.ok(statusCallSites.length > 0, 'must find at least one handleStatus(...) call site');

for (const firstArg of importCallSites) {
  assert.equal(firstArg, 'req', `handleImport(...) call must pass req as its first argument, found "${firstArg}"`);
}
for (const firstArg of statusCallSites) {
  assert.equal(firstArg, 'req', `handleStatus(...) call must pass req as its first argument, found "${firstArg}"`);
}

console.log('tga-rto-import req-scope checks passed');
