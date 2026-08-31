#!/usr/bin/env node
// Repeatable architecture metrics (P0.5, docs/kb/reference/codebase-optimization-plan-2026-08-28.md).
//
// Reproduces the baseline numbers in that plan's section 3 from a script
// instead of an ad-hoc one-off pass, so every PR can report the same shape
// of before/after numbers. Deliberately excludes generated Supabase types,
// migrations, and audit-log history from every LOC/product count -- those
// would make "progress" look like it moved when only generated code or
// history did.
//
// Usage: node scripts/architecture-metrics.mjs [--json] [--out <file>]

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
// Walking only these two named roots (never the repo root itself) means a
// stray nested git worktree at the repo root (see AGENTS.md -> "Local dev
// server troubleshooting") is never visited in the first place -- no
// separate exclusion needed, unlike eslint.config.js's top-level `ignores`.
const ROOTS = ["src", "supabase/functions"];
const GENERATED_TYPES = "src/integrations/supabase/types.ts";

const TEST_PATTERN = /\.test\.(mjs|ts|tsx)$|_test\.ts$|\.node-test\.ts$|\.spec\.(ts|tsx)$/;
const PRODUCT_EXT = /\.(ts|tsx|js|mjs|cjs)$/;
const SUPABASE_IMPORT = /from\s+["']@\/integrations\/supabase\/client["']|from\s+["']@supabase\/supabase-js["']/;
const DIRECT_CALL = /\bsupabase\s*\.\s*(from|rpc|storage|functions)\s*\(/;

function listFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      listFiles(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function relPath(p) {
  return relative(ROOT, p).split("\\").join("/");
}

function lineCount(content) {
  if (content.length === 0) return 0;
  return content.split("\n").length;
}

function main() {
  const allFiles = ROOTS.flatMap((r) => listFiles(join(ROOT, r)))
    .map(relPath)
    .filter((f) => PRODUCT_EXT.test(f));

  let physicalLines = 0;
  let linesExclGenerated = 0;
  let productLinesExclGeneratedAndTests = 0;
  let frontendProductLines = 0, frontendProductFiles = 0;
  let edgeProductLines = 0, edgeProductFiles = 0;

  const over600 = [];
  const over1000 = [];
  let linesInOver600 = 0;

  const wrapperFiles = [];
  let wrapperLines = 0;

  let testFilesFrontend = 0, testFilesEdgeMjs = 0, testFilesEdgeTs = 0;

  const supabaseImportsByGroup = { pages: 0, components: 0, hooks: 0 };
  const directCallsByGroup = { pages: 0, components: 0, hooks: 0 };
  let zodFiles = 0;
  let unicornRoleFiles = 0;
  let anyHits = 0;

  for (const f of allFiles) {
    const abs = join(ROOT, f);
    const content = readFileSync(abs, "utf8");
    const lines = lineCount(content);
    const isGenerated = f === GENERATED_TYPES;
    const isTest = TEST_PATTERN.test(f);
    const isFrontend = f.startsWith("src/");
    const isEdge = f.startsWith("supabase/functions/");

    physicalLines += lines;
    if (!isGenerated) linesExclGenerated += lines;
    if (!isGenerated && !isTest) {
      productLinesExclGeneratedAndTests += lines;
      if (isFrontend) {
        frontendProductLines += lines;
        frontendProductFiles++;
      } else if (isEdge) {
        edgeProductLines += lines;
        edgeProductFiles++;
      }

      if (lines > 600) {
        over600.push({ file: f, lines });
        linesInOver600 += lines;
      }
      if (lines > 1000) over1000.push({ file: f, lines });

      if (/Wrapper\.tsx$/.test(f)) {
        wrapperFiles.push(f);
        wrapperLines += lines;
      }

      if (/^src\/pages\//.test(f) || /^src\/components\//.test(f) || /^src\/hooks\//.test(f)) {
        const group = f.startsWith("src/pages/") ? "pages" : f.startsWith("src/components/") ? "components" : "hooks";
        if (SUPABASE_IMPORT.test(content)) supabaseImportsByGroup[group]++;
        if (DIRECT_CALL.test(content)) directCallsByGroup[group]++;
      }

      if (/from\s+["']zod["']/.test(content)) zodFiles++;
      if (content.includes("unicorn_role")) unicornRoleFiles++;
      const anyMatches = content.match(/\bany\b/g);
      if (anyMatches) anyHits += anyMatches.length;
    }

    if (isTest) {
      if (isFrontend) testFilesFrontend++;
      else if (isEdge && f.endsWith(".test.mjs")) testFilesEdgeMjs++;
      else if (isEdge) testFilesEdgeTs++;
    }
  }

  over600.sort((a, b) => b.lines - a.lines);
  over1000.sort((a, b) => b.lines - a.lines);

  const report = {
    measuredAt: new Date().toISOString(),
    // supabase/migrations/** and docs/audit-log/** are never walked at all
    // (out of scope, not merely filtered) since ROOTS only names src/ and
    // supabase/functions/.
    excludes: [GENERATED_TYPES, "supabase/migrations/**", "docs/audit-log/**"],
    codeFootprint: {
      trackedProductFiles: allFiles.length,
      physicalLines,
      linesExcludingGeneratedTypes: linesExclGenerated,
      productLinesExcludingGeneratedAndTests: productLinesExclGeneratedAndTests,
      frontend: { files: frontendProductFiles, lines: frontendProductLines },
      edgeFunctions: { files: edgeProductFiles, lines: edgeProductLines },
      filesOver600: over600.length,
      linesHeldByFilesOver600: linesInOver600,
      filesOver1000: over1000.length,
      wrapperFiles: wrapperFiles.length,
      wrapperLines,
      testFiles: {
        frontend: testFilesFrontend,
        edgeMjs: testFilesEdgeMjs,
        edgeTsOrDeno: testFilesEdgeTs,
      },
    },
    boundaryIndicators: {
      supabaseClientImports: supabaseImportsByGroup,
      directSupabaseCalls: directCallsByGroup,
      zodAdoptionFiles: zodFiles,
      unicornRoleFiles,
      anyKeywordHits: anyHits,
    },
    largestFiles: over1000.slice(0, 15),
  };

  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const outIdx = args.indexOf("--out");
  const outFile = outIdx !== -1 ? args[outIdx + 1] : null;

  const output = asJson ? JSON.stringify(report, null, 2) : toMarkdown(report);

  if (outFile) {
    writeFileSync(outFile, output);
    console.log(`Wrote ${outFile}`);
  } else {
    console.log(output);
  }
}

function toMarkdown(r) {
  const cf = r.codeFootprint;
  const bi = r.boundaryIndicators;
  const lines = [];
  lines.push(`# Architecture metrics`);
  lines.push(``);
  lines.push(`Measured: ${r.measuredAt}`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---:|`);
  lines.push(`| Tracked product files (src + supabase/functions) | ${cf.trackedProductFiles} |`);
  lines.push(`| Physical lines | ${cf.physicalLines} |`);
  lines.push(`| Lines excluding generated types.ts | ${cf.linesExcludingGeneratedTypes} |`);
  lines.push(`| Product lines excluding generated types + tests | ${cf.productLinesExcludingGeneratedAndTests} |`);
  lines.push(`| Frontend product files / lines | ${cf.frontend.files} / ${cf.frontend.lines} |`);
  lines.push(`| Edge Function product files / lines | ${cf.edgeFunctions.files} / ${cf.edgeFunctions.lines} |`);
  lines.push(`| Files over 600 lines | ${cf.filesOver600} |`);
  lines.push(`| Lines held by files over 600 | ${cf.linesHeldByFilesOver600} |`);
  lines.push(`| Files over 1000 lines | ${cf.filesOver1000} |`);
  lines.push(`| \`*Wrapper.tsx\` files / lines | ${cf.wrapperFiles} / ${cf.wrapperLines} |`);
  lines.push(`| Frontend test files | ${cf.testFiles.frontend} |`);
  lines.push(`| Edge test files (.mjs / .ts+Deno) | ${cf.testFiles.edgeMjs} / ${cf.testFiles.edgeTsOrDeno} |`);
  lines.push(``);
  lines.push(`| Boundary indicator | pages | components | hooks |`);
  lines.push(`|---|---:|---:|---:|`);
  lines.push(`| Supabase client imports | ${bi.supabaseClientImports.pages} | ${bi.supabaseClientImports.components} | ${bi.supabaseClientImports.hooks} |`);
  lines.push(`| Direct Supabase calls | ${bi.directSupabaseCalls.pages} | ${bi.directSupabaseCalls.components} | ${bi.directSupabaseCalls.hooks} |`);
  lines.push(``);
  lines.push(`Zod adoption: ${bi.zodAdoptionFiles} files. \`unicorn_role\` appears in ${bi.unicornRoleFiles} files. \`any\` keyword hits: ${bi.anyKeywordHits}.`);
  lines.push(``);
  lines.push(`## Largest files (over 1000 lines)`);
  lines.push(``);
  lines.push(`| File | Lines |`);
  lines.push(`|---|---:|`);
  for (const f of r.largestFiles) lines.push(`| ${f.file} | ${f.lines} |`);
  return lines.join("\n");
}

main();
