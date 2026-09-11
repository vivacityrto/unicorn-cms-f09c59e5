#!/usr/bin/env node
// RBAC v6 Packet P0.1-a: static authorization inventory
// (docs/kb/reference/rbac-v6/p0/p0-1-inventory-packet-scoping.md).
//
// Walks a real TypeScript/TSX AST (the `typescript` package, already a
// project dependency -- same approach as scripts/generate-route-manifest.mjs)
// to find every usePermission() call, <PermissionGate> usage, and raw
// unicorn_role comparison under src/, plus a plain-text scan of every
// Edge Function's auth-gate import under supabase/functions/. This is a
// versioned, re-runnable inventory artifact, not a one-time snapshot --
// re-run it whenever the P0.1 evidence needs refreshing.
//
// Usage: node scripts/generate-rbac-static-inventory.mjs [--json] [--out <file>]

import ts from "typescript";
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = join(ROOT, "src");
const FUNCTIONS_DIR = join(ROOT, "supabase", "functions");

function listFiles(dir, extensions, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(full, extensions, out);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function toRel(file) {
  return relative(ROOT, file).split("\\").join("/");
}

function lineOf(sourceFile, pos) {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function literalText(node) {
  if (!node) return undefined;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return node.text;
  return node.getText();
}

/** Walk one source file's AST, collecting usePermission calls, PermissionGate
 * JSX usages, and raw unicorn_role === / !== comparisons. */
function scanFrontendFile(file) {
  const text = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  const usePermissionCalls = [];
  const permissionGateUsages = [];
  const rawRoleComparisons = [];

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "usePermission") {
      const args = node.arguments.map(literalText);
      usePermissionCalls.push({ file: toRel(file), line: lineOf(sourceFile, node.getStart()), args });
    }

    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
      const tagName = node.tagName.getText();
      if (tagName === "PermissionGate") {
        const props = {};
        for (const attr of node.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.name) {
            const name = attr.name.getText();
            let value;
            if (attr.initializer) {
              if (ts.isStringLiteral(attr.initializer)) value = attr.initializer.text;
              else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) value = attr.initializer.expression.getText();
            }
            props[name] = value;
          }
        }
        permissionGateUsages.push({ file: toRel(file), line: lineOf(sourceFile, node.getStart()), props });
      }
    }

    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
        const leftText = node.left.getText();
        const rightText = node.right.getText();
        const involvesRole = leftText.includes("unicorn_role") || rightText.includes("unicorn_role");
        if (involvesRole) {
          rawRoleComparisons.push({
            file: toRel(file),
            line: lineOf(sourceFile, node.getStart()),
            operator: op === ts.SyntaxKind.EqualsEqualsEqualsToken ? "===" : "!==",
            expression: node.getText().slice(0, 160),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { usePermissionCalls, permissionGateUsages, rawRoleComparisons };
}

// Named helpers we can attribute individually in the inventory output.
const AUTH_HELPERS = ["requireCaller", "requireSuperAdmin", "requireSharedSecret", "requireInternalEmailSecret"];

// The full recognized-gate pattern, kept identical to
// scripts/check-edge-function-auth-gate.sh's AUTH_PATTERN (the CI guardrail
// that actually enforces this) so this inventory's "no recognized gate"
// count matches what CI would flag, rather than only checking the 4 named
// helpers above and over-reporting functions that use one of the other
// legitimate idioms (inline auth.getUser()+check_permission(), cron-secret
// gating, webhook signature verification, etc.). Keep these two patterns in
// sync if the guardrail script's AUTH_PATTERN changes.
const GUARDRAIL_AUTH_PATTERN = /requireCaller\(|requireSharedSecret\(|requireInternalEmailSecret\(|requireSuperAdmin\(|isCronAuthorized\(|checkSuperAdmin\(|check_permission|auth\.getUser\(|auth\.getClaims\(|verifyAuth\(|MAILGUN_WEBHOOK_SIGNING_KEY|constantTimeEqual\(|verifyAddinToken\(|authorizeCronInvoke\(/;
const AUTH_GATE_OPT_OUT_PATTERN = /\/\/ *auth-gate: *none\b/;

/** Plain-text scan of one Edge Function's index.ts for which auth helper(s)
 * it imports, and whether it has any CI-recognized auth gate at all. */
function scanEdgeFunction(dir) {
  const indexPath = join(dir, "index.ts");
  let text;
  try {
    text = readFileSync(indexPath, "utf8");
  } catch {
    return null;
  }
  const importedHelpers = AUTH_HELPERS.filter((helper) => new RegExp(`\\b${helper}\\b`).test(text));
  const optedOut = AUTH_GATE_OPT_OUT_PATTERN.test(text);
  const hasGuardrailRecognizedGate = optedOut || GUARDRAIL_AUTH_PATTERN.test(text);
  return {
    function: relative(FUNCTIONS_DIR, dir).split("\\").join("/"),
    file: toRel(indexPath),
    authHelpers: importedHelpers,
    optedOutOfAuthGate: optedOut,
    hasNoRecognizedGate: !hasGuardrailRecognizedGate,
  };
}

function listFunctionDirs() {
  let entries;
  try {
    entries = readdirSync(FUNCTIONS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => join(FUNCTIONS_DIR, e.name));
}

function main() {
  const frontendFiles = listFiles(SRC, [".ts", ".tsx"]);
  const usePermissionCalls = [];
  const permissionGateUsages = [];
  const rawRoleComparisons = [];

  for (const file of frontendFiles) {
    const result = scanFrontendFile(file);
    usePermissionCalls.push(...result.usePermissionCalls);
    permissionGateUsages.push(...result.permissionGateUsages);
    rawRoleComparisons.push(...result.rawRoleComparisons);
  }

  const edgeFunctions = listFunctionDirs()
    .map(scanEdgeFunction)
    .filter(Boolean)
    .sort((a, b) => a.function.localeCompare(b.function));

  const summary = {
    generatedAt: new Date().toISOString(),
    counts: {
      usePermissionCalls: usePermissionCalls.length,
      permissionGateUsages: permissionGateUsages.length,
      rawRoleComparisons: rawRoleComparisons.length,
      edgeFunctionsTotal: edgeFunctions.length,
      edgeFunctionsWithNoRecognizedGate: edgeFunctions.filter((f) => f.hasNoRecognizedGate).length,
      edgeFunctionsOptedOutOfAuthGate: edgeFunctions.filter((f) => f.optedOutOfAuthGate).length,
      edgeFunctionsWithNamedHelper: edgeFunctions.filter((f) => f.authHelpers.length > 0).length,
    },
    usePermissionCalls,
    permissionGateUsages,
    rawRoleComparisons,
    edgeFunctions,
  };

  const args = process.argv.slice(2);
  const jsonOnly = args.includes("--json");
  const outIdx = args.indexOf("--out");
  const outFile = outIdx !== -1 ? args[outIdx + 1] : null;

  if (jsonOnly || outFile) {
    const json = JSON.stringify(summary, null, 2);
    if (outFile) {
      writeFileSync(outFile, json);
      console.log(`generate-rbac-static-inventory: wrote ${summary.counts.usePermissionCalls + summary.counts.permissionGateUsages + summary.counts.rawRoleComparisons} frontend call sites and ${summary.counts.edgeFunctionsTotal} Edge Functions to ${outFile}`);
    } else {
      console.log(json);
    }
    return;
  }

  console.log(`generate-rbac-static-inventory:`);
  console.log(`  usePermission() calls: ${summary.counts.usePermissionCalls}`);
  console.log(`  <PermissionGate> usages: ${summary.counts.permissionGateUsages}`);
  console.log(`  raw unicorn_role comparisons: ${summary.counts.rawRoleComparisons}`);
  console.log(`  Edge Functions scanned: ${summary.counts.edgeFunctionsTotal}`);
  console.log(`  Edge Functions with a named helper (requireCaller etc.): ${summary.counts.edgeFunctionsWithNamedHelper}`);
  console.log(`  Edge Functions with no CI-recognized auth gate at all: ${summary.counts.edgeFunctionsWithNoRecognizedGate}`);
  console.log(`  Edge Functions opted out via auth-gate:none comment: ${summary.counts.edgeFunctionsOptedOutOfAuthGate}`);
}

main();
