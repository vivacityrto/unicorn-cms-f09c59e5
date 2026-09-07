#!/usr/bin/env node

/**
 * Static safety audit for Supabase migrations.
 *
 * This is intentionally a conservative scanner, not a SQL parser. It is a
 * review aid and a CI guardrail: it must never claim that arbitrary SQL is
 * safe merely because a regular expression did not recognise it.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const DEFAULT_ALLOWLIST = join(ROOT, "supabase", "migration-safety-allowlist.json");
const PRODUCTION_PROJECT_REF = "yxkgdalkbrriasiyyrwk";
const MAX_ALLOWLIST_DAYS = 31;

const RISK_CATEGORIES = new Set([
  "production-url",
  "cron-registration",
  "cron-unschedule",
  "http-call",
  "data-mutation",
  "destructive-mutation",
  "modified-applied-migration",
]);

const TAG_PATTERNS = [
  ["backfill", /(?:^|[^a-z])backfill(?:s|ed|ing)?(?=$|[^a-z])/i],
  ["seed", /(?:^|[^a-z])seed(?:s|ed|ing)?(?=$|[^a-z])/i],
  ["requeue", /(?:^|[^a-z])requeue(?:s|d|ing)?(?=$|[^a-z])/i],
  ["duplicate-removal", /(?:^|[^a-z])(?:dedup(?:e|lication)|duplicate(?:s|d)?[ _-]+(?:removal|cleanup)|remove[_ -]?duplicates)(?=$|[^a-z])/i],
  ["cleanup", /(?:^|[^a-z])cleanup(?=$|[^a-z])|(?:^|[^a-z])clean[_ -]?up(?=$|[^a-z])/i],
];

const PRODUCTION_URL_RE = /https?:\/\/([a-z0-9-]+)\.supabase\.co(?:[/:\s'"`]|$)/gi;
const PROJECT_REF_RE = /\b[a-z0-9]{20}\b/gi;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const NUMERIC_ID_RE = /\b(?:tenant_id|user_id|package_id|stage_id|job_id|jobid|document_id|instance_id)\s*=\s*['"]?\d+['"]?/gi;
const CRON_RE = /\bcron\.(schedule|unschedule)\s*\(/gi;
const HTTP_RE = /\bnet\.http_(post|get|head|patch|delete)\s*\(/gi;
const EXTENSION_RE = /\b(?:create\s+extension|pg_(?:cron|net)|extensions\.(?:http_|cron))\b/gi;
const INSERT_RE = /\binsert\s+into\b/gi;
const UPDATE_RE = /(?<!for\s)\bupdate\s+(?:only\s+)?[a-z_][\w.]*/gi;
const DELETE_RE = /\bdelete\s+from\b/gi;
const TRUNCATE_RE = /\btruncate\s+(?:table\s+)?/gi;
const BACKUP_TABLE_RE = /\b(?:create\s+(?:table|table\s+if\s+not\s+exists)|alter\s+table)\s+[a-z0-9_.]*(?:backup|bak|archive|old)\b/i;
const TARGET_MARKER_RE = /^\s*--\s*migration-target-project\s*:\s*([^\s#]+)\s*(?:#.*)?$/im;

function relativePath(file) {
  return relative(ROOT, file).split("\\").join("/");
}

function listMigrationFiles(dir = MIGRATIONS_DIR) {
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const file = join(dir, entry.name);
      return entry.isDirectory() ? listMigrationFiles(file) : entry.isFile() && entry.name.endsWith(".sql") ? [file] : [];
    })
    .sort();
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split("\n").length;
}

function lineAt(content, lineNumber) {
  return content.split("\n")[lineNumber - 1]?.trim() ?? "";
}

function maskSqlComments(content) {
  const chars = [...content];
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < chars.length; i += 1) {
    if (lineComment) {
      if (chars[i] === "\n") lineComment = false;
      else chars[i] = " ";
      continue;
    }
    if (blockComment) {
      if (chars[i] === "*" && chars[i + 1] === "/") {
        chars[i] = " ";
        chars[i + 1] = " ";
        i += 1;
        blockComment = false;
      } else if (chars[i] !== "\n") {
        chars[i] = " ";
      }
      continue;
    }
    if (chars[i] === "-" && chars[i + 1] === "-") {
      chars[i] = " ";
      chars[i + 1] = " ";
      i += 1;
      lineComment = true;
    } else if (chars[i] === "/" && chars[i + 1] === "*") {
      chars[i] = " ";
      chars[i + 1] = " ";
      i += 1;
      blockComment = true;
    }
  }
  return chars.join("");
}

function addMatch(findings, content, file, category, operation, match, extra = {}) {
  const line = lineNumberAt(content, match.index ?? 0);
  findings.push({
    file,
    line,
    category,
    operation,
    match: lineAt(content, line),
    ...extra,
  });
}

function findAll(re, content) {
  re.lastIndex = 0;
  return [...content.matchAll(re)];
}

function classifyReplaySafety({ category, operation, content, line }) {
  if (category === "production-url" || category === "cron-registration" || category === "http-call") {
    return {
      replaySafety: "unsafe-without-review",
      replayReason: "The operation can target hosted services or create an external side effect during QA replay.",
    };
  }
  if (category === "destructive-mutation") {
    const statement = content.split("\n")[line - 1] ?? "";
    return {
      replaySafety: "requires-review",
      replayReason: /\bwhere\b/i.test(statement) ? "Destructive DML has a predicate and still requires reviewer confirmation." : "Destructive DML has no detectable predicate and may affect all rows.",
    };
  }
  if (category === "data-mutation") {
    return {
      replaySafety: /on\s+conflict|if\s+not\s+exists|create\s+or\s+replace/i.test(content) ? "likely-safe-with-review" : "requires-review",
      replayReason: "Migration-time DML must be idempotent and explicitly reviewed for empty-QA replay.",
    };
  }
  if (category === "modified-applied-migration") {
    return { replaySafety: "blocked", replayReason: "Applied migration history must not be rewritten." };
  }
  return { replaySafety: "likely-safe", replayReason: "No high-risk side effect was detected by this static scanner." };
}

function detectTags(file, content) {
  const haystack = `${file}\n${content}`;
  return TAG_PATTERNS.filter(([, pattern]) => pattern.test(haystack)).map(([tag]) => tag);
}

function scanMigration(file, content) {
  const findings = [];
  const scanContent = maskSqlComments(content);
  const targetMarker = content.match(TARGET_MARKER_RE)?.[1] ?? null;
  const urls = findAll(PRODUCTION_URL_RE, scanContent);
  const projectRefs = new Set();

  for (const match of urls) {
    const targetProject = match[1].toLowerCase();
    projectRefs.add(targetProject);
    addMatch(findings, content, file, "production-url", "hosted-url", match, {
      targetProject,
      productionProject: targetProject === PRODUCTION_PROJECT_REF,
    });
  }

  for (const match of findAll(PROJECT_REF_RE, scanContent)) {
    const ref = match[0].toLowerCase();
    if (ref === PRODUCTION_PROJECT_REF && !projectRefs.has(ref)) {
      projectRefs.add(ref);
      addMatch(findings, content, file, "production-url", "project-ref", match, {
        targetProject: ref,
        productionProject: true,
      });
    }
  }

  for (const match of findAll(CRON_RE, scanContent)) {
    const action = match[1].toLowerCase();
    addMatch(findings, content, file, action === "schedule" ? "cron-registration" : "cron-unschedule", `cron.${action}`, match, {
      targetProject: [...projectRefs][0] ?? targetMarker ?? "unresolved",
    });
  }

  for (const match of findAll(HTTP_RE, scanContent)) {
    addMatch(findings, content, file, "http-call", `net.http_${match[1].toLowerCase()}`, match, {
      targetProject: [...projectRefs][0] ?? targetMarker ?? "unresolved",
    });
  }

  for (const match of findAll(EXTENSION_RE, scanContent)) {
    addMatch(findings, content, file, "extension-assumption", "extension", match, {
      extension: match[0],
    });
  }

  for (const match of findAll(INSERT_RE, scanContent)) {
    addMatch(findings, content, file, "data-mutation", "insert", match);
  }
  for (const match of findAll(UPDATE_RE, scanContent)) {
    addMatch(findings, content, file, "destructive-mutation", "update", match);
  }
  for (const match of findAll(DELETE_RE, scanContent)) {
    addMatch(findings, content, file, "destructive-mutation", "delete", match);
  }
  for (const match of findAll(TRUNCATE_RE, scanContent)) {
    addMatch(findings, content, file, "destructive-mutation", "truncate", match);
  }

  for (const match of findAll(UUID_RE, scanContent)) {
    addMatch(findings, content, file, "hard-coded-id", "uuid-literal", match, { value: match[0] });
  }
  for (const match of findAll(NUMERIC_ID_RE, scanContent)) {
    addMatch(findings, content, file, "hard-coded-id", "numeric-id-literal", match, { value: match[0] });
  }
  if (BACKUP_TABLE_RE.test(scanContent)) {
    const match = BACKUP_TABLE_RE.exec(scanContent);
    addMatch(findings, content, file, "backup-table", "backup-table", match);
  }

  const tags = detectTags(file, content);
  for (const finding of findings) {
    Object.assign(finding, classifyReplaySafety({ ...finding, content }));
  }

  return {
    file,
    tags,
    targetProject: [...projectRefs][0] ?? targetMarker ?? null,
    findings,
    replaySafety: findings.some((finding) => finding.replaySafety === "blocked" || finding.replaySafety === "unsafe-without-review")
      ? "unsafe-without-review"
      : findings.some((finding) => finding.replaySafety === "requires-review")
        ? "requires-review"
        : "likely-safe",
  };
}

function parseAllowlist(file = DEFAULT_ALLOWLIST) {
  if (!statSync(file, { throwIfNoEntry: false })) return [];
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (!parsed || !Array.isArray(parsed.entries)) throw new Error(`${relativePath(file)} must contain an entries array`);
  return parsed.entries;
}

function dateOnly(value) {
  return new Date(`${value}T00:00:00Z`);
}

function validateAllowlist(entries, now = new Date()) {
  const errors = [];
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (const entry of entries) {
    for (const key of ["id", "file", "targetProject", "owner", "reason", "expires"]) {
      if (typeof entry?.[key] !== "string" || entry[key].trim() === "") errors.push(`allowlist entry is missing ${key}`);
    }
    if (!entry?.categories && !entry?.category) errors.push(`allowlist entry ${entry?.id ?? "<unknown>"} is missing category/categories`);
    const expiry = typeof entry?.expires === "string" ? dateOnly(entry.expires) : null;
    if (!expiry || Number.isNaN(expiry.getTime())) {
      errors.push(`allowlist entry ${entry?.id ?? "<unknown>"} has an invalid expires date`);
    } else {
      const max = new Date(today);
      max.setUTCDate(max.getUTCDate() + MAX_ALLOWLIST_DAYS);
      if (expiry < today) errors.push(`allowlist entry ${entry.id} is expired (${entry.expires})`);
      if (expiry > max) errors.push(`allowlist entry ${entry.id} expires more than ${MAX_ALLOWLIST_DAYS} days from today`);
    }
    if (["unresolved", "unknown", "not-specified"].includes(entry?.targetProject)) {
      errors.push(`allowlist entry ${entry?.id ?? "<unknown>"} must name a concrete target project`);
    }
  }
  return errors;
}

function categoriesFor(entry) {
  return new Set([...(Array.isArray(entry.categories) ? entry.categories : []), ...(entry.category ? [entry.category] : [])]);
}

function isAllowlisted(finding, entries) {
  if (!RISK_CATEGORIES.has(finding.category)) return false;
  return entries.some((entry) => {
    const fileMatches = entry.file === finding.file || entry.file === "*";
    const targetMatches = entry.targetProject === finding.targetProject;
    return fileMatches && targetMatches && categoriesFor(entry).has(finding.category);
  });
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function changedMigrationFiles(baseRef) {
  let output;
  try {
    output = git(["diff", "--name-status", "--diff-filter=ACMR", `${baseRef}...HEAD`, "--", "supabase/migrations"]);
  } catch (error) {
    throw new Error(`base ref '${baseRef}' is not available; fetch it before running the migration guardrail`);
  }
  return output
    ? output.split(/\r?\n/).filter(Boolean).map((line) => {
      const [status, ...parts] = line.split("\t");
      return { status: status[0], file: parts.at(-1) };
    })
    : [];
}

function loadFiles({ changedOnly, baseRef }) {
  if (!changedOnly) return listMigrationFiles().map((file) => ({ status: "A", file: relativePath(file), fullPath: file }));
  return changedMigrationFiles(baseRef).map((entry) => ({
    ...entry,
    fullPath: join(ROOT, entry.file),
  }));
}

function audit({ changedOnly = false, baseRef = "origin/main", allowlistFile = DEFAULT_ALLOWLIST, now = new Date() } = {}) {
  const allowlist = parseAllowlist(allowlistFile);
  const allowlistErrors = validateAllowlist(allowlist, now);
  if (allowlistErrors.length) throw new Error(allowlistErrors.join("\n"));

  const files = loadFiles({ changedOnly, baseRef });
  const reports = [];
  for (const entry of files) {
    if (!statSync(entry.fullPath, { throwIfNoEntry: false })) continue;
    const file = relativePath(entry.fullPath);
    const content = readFileSync(entry.fullPath, "utf8");
    const report = scanMigration(file, content);
    if (changedOnly && entry.status !== "A") {
      report.findings.unshift({
        file,
        line: 1,
        category: "modified-applied-migration",
        operation: `git-status:${entry.status}`,
        match: `Migration file has status ${entry.status}; create a new corrective migration instead of editing history.`,
        replaySafety: "blocked",
        replayReason: "Applied migration history must not be rewritten.",
      });
      report.replaySafety = "unsafe-without-review";
    }
    for (const finding of report.findings) finding.allowlisted = isAllowlisted(finding, allowlist);
    reports.push(report);
  }

  const blockingFindings = reports.flatMap((report) => report.findings.filter((finding) => RISK_CATEGORIES.has(finding.category) && !finding.allowlisted));
  return {
    generatedAt: new Date().toISOString(),
    changedOnly,
    baseRef: changedOnly ? baseRef : null,
    allowlistFile: relativePath(allowlistFile),
    files: reports,
    findings: reports.flatMap((report) => report.findings),
    blockingFindings,
    summary: {
      filesScanned: reports.length,
      findings: reports.reduce((count, report) => count + report.findings.length, 0),
      blockingFindings: blockingFindings.length,
      allowlistedFindings: reports.reduce((count, report) => count + report.findings.filter((finding) => finding.allowlisted).length, 0),
      taggedMigrations: reports.filter((report) => report.tags.length > 0).length,
    },
  };
}

function printHuman(report) {
  console.log(`migration audit: scanned ${report.summary.filesScanned} migration file(s), ${report.summary.findings} finding(s)`);
  console.log(`migration audit: ${report.summary.blockingFindings} blocking, ${report.summary.allowlistedFindings} allowlisted, ${report.summary.taggedMigrations} tagged`);
  if (!report.changedOnly) {
    const counts = new Map();
    for (const finding of report.findings) counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
    console.log(`migration audit: historical findings by category: ${[...counts.entries()].map(([category, count]) => `${category}=${count}`).join(", ")}`);
    console.log("migration audit: use --format json for the complete full-tree report; historical findings do not fail this command");
    return;
  }
  for (const finding of report.findings) {
    const state = finding.allowlisted ? "ALLOWLISTED" : RISK_CATEGORIES.has(finding.category) ? "BLOCK" : "REVIEW";
    console.log(`${state} ${finding.category} ${finding.file}:${finding.line} — ${finding.operation} — ${finding.match}`);
  }
  if (report.changedOnly && report.summary.blockingFindings > 0) {
    console.error("\nMigration safety guardrail failed. Add a new migration, or use a reviewed short-lived allowlist entry with targetProject, owner, reason, and expires.");
  }
}

function parseArgs(argv) {
  const options = { changedOnly: false, baseRef: "origin/main", allowlistFile: DEFAULT_ALLOWLIST, format: "text" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--changed-only") options.changedOnly = true;
    else if (arg === "--base-ref") options.baseRef = argv[++i];
    else if (arg === "--allowlist") options.allowlistFile = resolve(ROOT, argv[++i]);
    else if (arg === "--format") options.format = argv[++i];
    else if (arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/audit-migrations.mjs [--changed-only --base-ref <ref>] [--allowlist <file>] [--format text|json]");
      process.exit(0);
    }
    const report = audit(options);
    if (options.format === "json") console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    // Full-tree audits intentionally report historical findings without
    // failing. CI uses --changed-only, where every unallowlisted blocking
    // finding is a new review gate.
    process.exit(options.changedOnly && report.summary.blockingFindings > 0 ? 1 : 0);
  } catch (error) {
    console.error(`migration audit error: ${error.message}`);
    process.exit(1);
  }
}

export {
  audit,
  classifyReplaySafety,
  detectTags,
  isAllowlisted,
  parseAllowlist,
  scanMigration,
  validateAllowlist,
};
