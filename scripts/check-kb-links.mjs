#!/usr/bin/env node
// Local Markdown link checker (Phase 1, docs/kb/reference/codebase-optimization-plan-2026-08-28.md).
//
// Resolves every local (non-http, non-anchor-only) Markdown link in the KB
// and the audit-log index relative to the linking file's own directory, and
// reports any that don't resolve to a real file or directory. Anchors
// (#fragment) are stripped before resolution -- this checks the target
// exists, not that the specific heading anchor inside it does.
//
// Usage: node scripts/check-kb-links.mjs [--json]

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const TARGETS = ["docs/kb", "docs/audit-log/INDEX.md"];

const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

function listMarkdownFiles(absPath) {
  const stat = existsSync(absPath) ? statSync(absPath) : null;
  if (!stat) return [];
  if (stat.isFile()) return absPath.endsWith(".md") ? [absPath] : [];
  const out = [];
  for (const entry of readdirSync(absPath, { withFileTypes: true })) {
    const full = join(absPath, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdownFiles(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function isLocalLink(target) {
  if (/^https?:\/\//.test(target)) return false;
  if (target.startsWith("mailto:")) return false;
  if (target.startsWith("#")) return false; // same-file anchor only
  return true;
}

function main() {
  const files = TARGETS.flatMap((t) => listMarkdownFiles(join(ROOT, t)));
  const broken = [];
  let totalLinks = 0;

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const relFile = relative(ROOT, file).split("\\").join("/");
    for (const match of content.matchAll(LINK_RE)) {
      const target = match[2].trim();
      if (!isLocalLink(target)) continue;
      totalLinks++;
      const [pathPart] = target.split("#");
      if (!pathPart) continue; // pure same-file anchor via a captured group quirk
      const resolved = resolve(dirname(file), pathPart);
      if (!existsSync(resolved)) {
        broken.push({ file: relFile, link: target, resolvedTo: relative(ROOT, resolved).split("\\").join("/") });
      }
    }
  }

  const args = process.argv.slice(2);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ filesScanned: files.length, totalLinks, brokenCount: broken.length, broken }, null, 2));
    return;
  }

  console.log(`check-kb-links: ${files.length} files, ${totalLinks} local links, ${broken.length} broken`);
  if (broken.length > 0) {
    console.log("");
    for (const b of broken) console.log(`${b.file} -> ${b.link}  (missing: ${b.resolvedTo})`);
    process.exitCode = 1;
  }
}

main();
