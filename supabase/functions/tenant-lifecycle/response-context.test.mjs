import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

assert.match(source, /handleCors\(req\)/, "OPTIONS must pass the request to CORS");
assert.match(source, /CommonErrors\.methodNotAllowed\(req\)/, "method errors must retain request context");
assert.doesNotMatch(source, /handleCors\(\)/, "no request-less CORS handler calls");
assert.doesNotMatch(source, /CommonErrors\.[A-Za-z]+\((?!req[,\)])/,
  "all CommonErrors calls must receive request context");
assert.doesNotMatch(source, /json(?:Ok|Error)\((?!req[,\)])/,
  "all JSON responses must receive request context");

console.log("tenant-lifecycle response-context checks passed");
