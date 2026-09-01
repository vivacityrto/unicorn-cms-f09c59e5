#!/usr/bin/env node
// Module-aware route manifest (P0.6, docs/kb/reference/codebase-optimization-plan-2026-08-28.md).
//
// Replaces the previous scripts/generate-route-inventory.mjs, whose block
// extraction read the next 800-4000 characters after a <Route> match using
// an indentation-sensitive string search ("\n            <Route", a
// hardcoded 12-space assumption). That silently mis-parsed anything not
// shaped exactly like the routes it was written against, and could only
// ever look at src/App.tsx.
//
// This walks a real TypeScript/TSX AST (the same `typescript` package
// already a project dependency) instead of slicing strings, and scans every
// .tsx file under src/ for <Route> JSX rather than hardcoding App.tsx --
// so a route extracted into its own module later (P1.2) is picked up
// automatically, not silently dropped. Emits path, rendered component (with
// its import source and whether it's lazy-loaded), guard wrapper chain +
// exact guard props, redirect target + `replace`, dynamic path params, the
// declaring file, and duplicate-path detection.
//
// Usage: node scripts/generate-route-manifest.mjs [--json] [--out <file>]

import ts from "typescript";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = join(ROOT, "src");

function listTsxFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      listTsxFiles(full, out);
    } else if (entry.isFile() && /\.tsx$/.test(entry.name) && !/\.(test|spec)\.tsx$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function relPath(p) {
  return relative(ROOT, p).split("\\").join("/");
}

// --- lazy-import / static-import resolution -------------------------------

function collectImportSources(sourceFile) {
  // name -> { source, lazy }
  const map = new Map();

  function visit(node) {
    if (ts.isImportDeclaration(node) && node.importClause) {
      const source = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (clause.name) map.set(clause.name.text, { source, lazy: false });
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          map.set(el.name.text, { source, lazy: false });
        }
      }
    }

    // const Foo = lazy(() => import("./pages/Foo"));
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.length === 1
    ) {
      const decl = node.declarationList.declarations[0];
      if (
        decl.name &&
        ts.isIdentifier(decl.name) &&
        decl.initializer &&
        ts.isCallExpression(decl.initializer) &&
        ts.isIdentifier(decl.initializer.expression) &&
        decl.initializer.expression.text === "lazy"
      ) {
        const arrowFn = decl.initializer.arguments[0];
        let importPath = null;
        if (arrowFn && ts.isArrowFunction(arrowFn)) {
          const body = arrowFn.body;
          const callExpr = ts.isCallExpression(body) ? body : null;
          if (
            callExpr &&
            callExpr.expression.kind === ts.SyntaxKind.ImportKeyword &&
            callExpr.arguments[0] &&
            ts.isStringLiteral(callExpr.arguments[0])
          ) {
            importPath = callExpr.arguments[0].text;
          }
        }
        map.set(decl.name.text, { source: importPath, lazy: true });
      }
    }

    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return map;
}

// --- JSX helpers ------------------------------------------------------------

function jsxTagName(node) {
  const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return tag && ts.isIdentifier(tag) ? tag.text : null;
}

function jsxAttrs(node) {
  const attributes = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
  const out = {};
  for (const attr of attributes.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    const name = attr.name.getText();
    if (!attr.initializer) {
      out[name] = true; // boolean shorthand: <Foo requireSuperAdmin>
    } else if (ts.isStringLiteral(attr.initializer)) {
      out[name] = attr.initializer.text;
    } else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      out[name] = attr.initializer.expression.getText();
    }
  }
  return out;
}

function jsxChildElement(node) {
  // First non-whitespace JSX child of a <Foo>...</Foo>, if any (for guard
  // wrappers like <ProtectedRoute><Page /></ProtectedRoute>).
  if (!ts.isJsxElement(node)) return null;
  for (const child of node.children) {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) return child;
  }
  return null;
}

// Walks the `element={...}` expression of a <Route>, unwrapping known guard
// wrappers, to find what's actually rendered.
function resolveElement(exprNode) {
  // No hardcoded guard-name whitelist: any wrapping JSX element that itself
  // has a nested JSX element/self-closing child is treated as a guard layer
  // (works for ProtectedRoute today and for whatever P1.4's route-metadata
  // consolidation wraps things in later), so this doesn't silently miss a
  // guard it doesn't recognize by name. The terminal node -- the one with no
  // further nested JSX child -- is the rendered component, unless it's
  // <Navigate>, which is a redirect signal at any depth.
  const guardChain = [];
  const guardProps = {};
  let node = exprNode;

  while (node && (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) {
    const tag = jsxTagName(node);
    if (tag === "Navigate") {
      const attrs = jsxAttrs(node);
      return { guardChain, guardProps, redirect: { to: attrs.to ?? null, replace: Boolean(attrs.replace) } };
    }
    const child = jsxChildElement(node);
    if (!child) {
      return { guardChain, guardProps, component: tag, redirect: null };
    }
    guardChain.push(tag);
    Object.assign(guardProps, jsxAttrs(node));
    node = child;
  }
  return { guardChain, guardProps, component: null, redirect: null };
}

// --- route extraction --------------------------------------------------

// True if this <Route>...</Route> has one or more nested <Route> JSX
// children (React Router's "layout route" pattern: <Route path="/x"
// element={<Layout/>}><Route index .../><Route path="y" .../></Route>).
// A route shaped like this is not itself independently navigable -- its
// own `element` only ever renders via a child's <Outlet/>, and its actual
// navigable path(s) come from its children (including its own path, via an
// `index` child) -- so it's excluded from the emitted route list, but its
// path and effective guard chain still become the base context for
// composing/prepending onto its children below.
function hasNestedRouteChildren(node) {
  if (!ts.isJsxElement(node)) return false;
  for (const child of node.children) {
    if ((ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) && jsxTagName(child) === "Route") {
      return true;
    }
  }
  return false;
}

// Composes a nested <Route>'s own `path`/`index` against its parent
// layout-route's already-composed path, matching React Router v6 nesting
// semantics: an `index` child inherits the parent's exact path; an
// absolute child path (leading "/") overrides the parent entirely; anything
// else is a relative segment appended under the parent.
function composePath(parentPath, ownPath) {
  if (ownPath === "(index)") return parentPath;
  if (ownPath.startsWith("/")) return ownPath;
  if (!parentPath) return `/${ownPath}`;
  return `${parentPath.replace(/\/$/, "")}/${ownPath}`;
}

function extractRoutesFromFile(absPath) {
  const text = readFileSync(absPath, "utf8");
  if (!text.includes("<Route")) return [];

  const sourceFile = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = collectImportSources(sourceFile);
  const routes = [];

  // ctx carries the composed path/guard chain/guard props inherited from
  // any enclosing layout-route parent(s); {} at the document root.
  function visit(node, ctx) {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && jsxTagName(node) === "Route") {
      const attrs = jsxAttrs(node);
      const ownPath = typeof attrs.path === "string" ? attrs.path : attrs.index ? "(index)" : null;
      const isLayoutParent = hasNestedRouteChildren(node);
      // A layout route doesn't need its own path or index -- when its
      // children have no shared prefix (e.g. a staff-shell layout route
      // whose children are scattered across /admin/*, /tenant/*, /work/*,
      // etc. with no common ancestor segment), the parent is legitimately
      // pathless. Only skip this node entirely if it's neither a route with
      // its own path/index NOR a layout parent -- a bare `element`-only
      // <Route> with no children would be meaningless in React Router
      // anyway, so this isn't narrowing real cases.
      if (ownPath !== null || isLayoutParent) {
        const elementAttrs = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
        const elementAttr = elementAttrs.properties.find(
          (a) => ts.isJsxAttribute(a) && a.name.getText() === "element",
        );
        let resolved = { guardChain: [], guardProps: {}, component: null, redirect: null };
        if (elementAttr && elementAttr.initializer && ts.isJsxExpression(elementAttr.initializer)) {
          const inner = elementAttr.initializer.expression;
          if (inner) resolved = resolveElement(inner);
        }

        // A pathless layout parent contributes no path segment of its own --
        // children compose against ctx.path unchanged, exactly as if this
        // node weren't there, while its resolved guard chain still applies.
        const path = ownPath !== null ? composePath(ctx.path, ownPath) : ctx.path;
        const guardChain = [...ctx.guardChain, ...resolved.guardChain];
        const guardProps = { ...ctx.guardProps, ...resolved.guardProps };

        if (!isLayoutParent) {
          const componentInfo = resolved.component ? imports.get(resolved.component) : undefined;
          routes.push({
            path,
            params: [...path.matchAll(/:[A-Za-z0-9_]+/g)].map((m) => m[0]),
            component: resolved.component,
            lazy: componentInfo?.lazy ?? null,
            importSource: componentInfo?.source ?? null,
            guardChain,
            guardProps,
            redirect: resolved.redirect,
            sourceFile: relPath(absPath),
          });
        }

        // Recurse into this Route's own JSX children (nested <Route>s, for
        // a layout parent) using the composed context, instead of falling
        // through to the generic forEachChild below with the stale parent
        // ctx -- which would either miss the composition entirely or, once
        // a match is found, needs a `return` to avoid double-visiting.
        if (ts.isJsxElement(node)) {
          const childCtx = { path, guardChain, guardProps };
          for (const child of node.children) visit(child, childCtx);
        }
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, ctx));
  }
  visit(sourceFile, { path: "", guardChain: [], guardProps: {} });
  return routes;
}

function main() {
  const files = listTsxFiles(SRC).sort();
  const routes = files.flatMap(extractRoutesFromFile);

  const pathCounts = new Map();
  for (const r of routes) pathCounts.set(r.path, (pathCounts.get(r.path) ?? 0) + 1);
  const duplicatePaths = [...pathCounts.entries()].filter(([, c]) => c > 1).map(([p]) => p);

  routes.sort((a, b) => a.path.localeCompare(b.path));

  const report = {
    measuredAt: new Date().toISOString(),
    filesScanned: files.length,
    filesWithRoutes: [...new Set(routes.map((r) => r.sourceFile))].sort(),
    totalRoutes: routes.length,
    duplicatePaths,
    routes,
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

  if (duplicatePaths.length > 0) {
    console.error(`\ngenerate-route-manifest: ${duplicatePaths.length} duplicate path registration(s): ${duplicatePaths.join(", ")}`);
  }
}

function toMarkdown(r) {
  const lines = [];
  lines.push(`<!-- Generated by scripts/generate-route-manifest.mjs -- ${r.totalRoutes} routes across ${r.filesWithRoutes.length} file(s) -->`);
  lines.push("");
  if (r.duplicatePaths.length > 0) {
    lines.push(`> **Duplicate route registrations (dead code -- React Router only reaches the first match):** ${r.duplicatePaths.join(", ")}`);
    lines.push("");
  }
  lines.push("| Path | Params | Component | Lazy | Guard chain | Guard props | Redirect | Source file |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const route of r.routes) {
    const guardProps = Object.entries(route.guardProps).map(([k, v]) => (v === true ? k : `${k}=${v}`)).join(" ");
    const redirect = route.redirect ? `${route.redirect.to}${route.redirect.replace ? " (replace)" : ""}` : "";
    lines.push(
      `| \`${route.path}\` | ${route.params.join(", ")} | \`${route.component ?? "?"}\` | ${route.lazy === null ? "" : route.lazy} | ${route.guardChain.join(" > ") || "public"} | ${guardProps} | ${redirect} | ${route.sourceFile} |`,
    );
  }
  return lines.join("\n");
}

main();
