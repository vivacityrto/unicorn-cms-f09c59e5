#!/usr/bin/env node
// Fail the build when a token-bearing link key appears in an edge function
// without APP_BASE_URL on the same line.
//
// Same failure class as the 2026-06-04 redirect incident: a request header
// or body supplied the base URL of a magic/recovery link. Every remaining
// hit must be reviewed — none may draw its base URL from req.headers or
// the request body.
//
// Cross-platform replacement for the Bash-only check-email-redirect-urls.sh
// (P0.1, docs/kb/reference/codebase-optimization-plan-2026-08-28.md).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const TARGET_DIR = join(ROOT, "supabase", "functions");

const LINK_KEY_PATTERN = /action_link|redirect_to|redirectTo|emailRedirectTo/;
const SAFE_MARKER = "APP_BASE_URL";

function listFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function findHits() {
  const hits = [];
  for (const file of listFiles(TARGET_DIR)) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue; // binary/unreadable file — grep -r would skip/garble it too
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (LINK_KEY_PATTERN.test(line) && !line.includes(SAFE_MARKER)) {
        const relPath = relative(ROOT, file).split("\\").join("/");
        hits.push(`${relPath}:${i + 1}:${line}`);
      }
    }
  }
  return hits;
}

function main() {
  if (!statSync(TARGET_DIR, { throwIfNoEntry: false })) {
    console.error(`ERROR: ${relative(ROOT, TARGET_DIR)} does not exist`);
    process.exit(1);
  }

  const hits = findHits();

  if (hits.length > 0) {
    console.error("ERROR: token-bearing link key without APP_BASE_URL on the same line:");
    console.error("");
    console.error(hits.join("\n"));
    console.error("");
    console.error("Token-bearing links must be built from APP_BASE_URL, never from req.headers or the request body.");
    process.exit(1);
  }

  console.log("email-redirect-url check passed");
}

main();
