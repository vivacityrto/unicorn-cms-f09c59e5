#!/usr/bin/env node
// Read-only source inventory for tenant-plan P0.1.
//
// This intentionally does not connect to Supabase or execute SQL. It extracts
// the current Manage Tenants request graph and displayed contract from source,
// so the result is safe to run against any checkout. Live catalog/statistics
// evidence belongs to the separately authorized P0.1 metadata run.
//
// Usage: node scripts/tenant-p0-inventory.mjs [--json] [--out <file>]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = [
  "src/pages/ManageTenants.tsx",
  "src/hooks/useTenantsBasic.ts",
  "src/hooks/useTenantPackages.ts",
  "src/hooks/useTenantContacts.ts",
  "src/hooks/useCscAssignments.ts",
  "src/hooks/useTenantNotes.ts",
];

const fields = [
  "id", "name", "slug", "status", "lifecycle_status", "access_status", "risk_level",
  "created_at", "rto_id", "complyhub_membership_tier", "archived_at", "xero_invoice_paid",
  "xero_invoice_due_date", "xero_repeating_invoice_url", "member_count", "primary_contact_name",
  "state", "csc_user_id", "csc_name", "csc_avatar", "csc_archived", "package_name",
  "package_full_text", "package_id", "all_packages", "next_renewal_date", "last_note_date",
  "last_note_snippet", "hours_used_minutes", "hours_included_minutes", "registration_end_date",
];

function source(path) { return readFileSync(join(ROOT, path), "utf8"); }
function unique(values) { return [...new Set(values)]; }
function fromCalls(text) {
  return unique([...text.matchAll(/\.from\((['"])([^'"]+)\1\)/g)].map((m) => m[2]));
}
function rpcCalls(text) {
  return unique([...text.matchAll(/\.rpc\((['"])([^'"]+)\1/g)].map((m) => m[2]));
}
function requestGraph() {
  return TARGETS.flatMap((path) => {
    const text = source(path);
    const writes = [...text.matchAll(/\.(insert|upsert|update|delete)\s*\(/g)]
      .filter((m) => text.slice(Math.max(0, m.index - 320), m.index).includes("supabase"))
      .map((m) => m[1]);
    return [{
      file: path,
      tables: fromCalls(text),
      rpc: rpcCalls(text),
      writes,
    }];
  });
}

function build() {
  const page = source(TARGETS[0]);
  const interfaces = unique([...page.matchAll(/interface\s+(Tenant\w*)\s*\{([\s\S]*?)\n\}/g)]
    .flatMap((m) => [...m[2].matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\??\s*:/gm)].map((f) => f[1])));
  const displayedFields = fields.filter((field) => new RegExp(`\\b${field}\\b`).test(page));
  const tables = unique(requestGraph().flatMap((entry) => entry.tables));
  const writes = requestGraph().flatMap((entry) => entry.writes.map((op) => ({ file: entry.file, operation: op })));
  return {
    generatedAt: new Date().toISOString(),
    scope: "P0.1 source evidence; no live database access",
    targets: TARGETS,
    tenantContract: { displayedFields, interfaceFields: interfaces },
    requestGraph: requestGraph(),
    tables,
    writes,
    observations: [
      "useTenantsBasic selects tenants.* and requests range(0, 9999), so the first viewport is coupled to the full tenant row shape.",
      "Packages, contacts, CSC assignments, and notes are assembled through independent query hooks keyed by the full tenant-id set.",
      "Notes performs batched reads and subscribes to table-wide INSERT/UPDATE realtime events; this is a candidate for measured invalidation narrowing.",
      "ManageTenants contains connected_tenants upsert/delete write paths; P0 inventory records them but does not change them.",
      "The source inventory cannot establish table keys, policies, grants, triggers, statistics, or effective authorization; those remain live metadata evidence items.",
    ],
  };
}

function markdown(report) {
  const lines = [
    "# Tenant P0.1 Source Inventory",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "> This artifact is source evidence only. It does not connect to Supabase, execute SQL, or claim live authorization/metadata results.",
    "",
    "## Request graph",
    "",
    "| Source | Reads | RPCs | Write methods present |",
    "|---|---|---|---|",
    ...report.requestGraph.map((e) => `| \`${e.file}\` | ${e.tables.join(", ") || "—"} | ${e.rpc.join(", ") || "—"} | ${e.writes.join(", ") || "—"} |`),
    "",
    `Unique tables referenced: ${report.tables.join(", ") || "—"}`,
    "",
    "## Visible contract fields",
    "",
    report.tenantContract.displayedFields.map((f) => `- \`${f}\``).join("\n"),
    "",
    "## P0.1 observations",
    "",
    report.observations.map((o) => `- ${o}`).join("\n"),
    "",
    "## Evidence still required",
    "",
    "- Live catalog inventory: keys, FKs, constraints, policies, grants, functions, triggers, views, realtime publications, and relation sizes.",
    "- Signed tenant/client identity ledger with semantic domains, canonical targets, unmatched classifications, and migration dispositions.",
    "- View/RPC contract catalogue and write-path dependency graph beyond the Manage Tenants source slice.",
  ];
  return lines.join("\n") + "\n";
}

const report = build();
const args = process.argv.slice(2);
const json = args.includes("--json");
const outIndex = args.indexOf("--out");
const output = outIndex >= 0 ? args[outIndex + 1] : null;
const rendered = json ? JSON.stringify(report, null, 2) + "\n" : markdown(report);
if (output) writeFileSync(join(ROOT, output), rendered);
else process.stdout.write(rendered);
