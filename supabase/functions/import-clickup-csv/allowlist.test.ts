/**
 * Regression: import-clickup-csv must not upsert caller-supplied rows
 * unfiltered, must not take tenant_id from the payload, and must gate
 * with requireCaller Version A.
 *
 * Run:
 *   node --experimental-strip-types --test supabase/functions/import-clickup-csv/allowlist.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLICKUP_TASKS_ALLOWED_COLUMNS,
  CLICKUP_TASKSDB_ALLOWED_COLUMNS,
  findBlockedPayloadColumns,
  pickAllowedClickupColumns,
} from "./clickup-csv-allowlist.ts";

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(join(here, "index.ts"), "utf8");
const allowlistSrc = readFileSync(join(here, "clickup-csv-allowlist.ts"), "utf8");

describe("pickAllowedClickupColumns", () => {
  it("keeps allowlisted columns and drops everything else", () => {
    const picked = pickAllowedClickupColumns(
      {
        task_id: "abc",
        task_name: "Renewal",
        tenant_id: 9999,
        id: 42,
        is_vivacity_internal: true,
        not_a_column: "nope",
        date_imported: "2020-01-01",
      },
      CLICKUP_TASKS_ALLOWED_COLUMNS,
    );

    assert.deepEqual(picked, { task_id: "abc", task_name: "Renewal" });
    assert.equal("tenant_id" in picked, false);
    assert.equal("id" in picked, false);
    assert.equal("is_vivacity_internal" in picked, false);
    assert.equal("date_imported" in picked, false);
  });

  it("never allows tenant_id on either table allowlist", () => {
    const tasks = CLICKUP_TASKS_ALLOWED_COLUMNS as readonly string[];
    const tasksdb = CLICKUP_TASKSDB_ALLOWED_COLUMNS as readonly string[];
    assert.equal(tasks.includes("tenant_id"), false);
    assert.equal(tasksdb.includes("tenant_id"), false);
    assert.equal(tasks.includes("id"), false);
    assert.equal(tasksdb.includes("id"), false);

    const sneaky = pickAllowedClickupColumns(
      { task_id: "x", tenant_id: 1, unicorn_url: "/clients/12" },
      CLICKUP_TASKSDB_ALLOWED_COLUMNS,
    );
    assert.deepEqual(sneaky, { task_id: "x", unicorn_url: "/clients/12" });
  });

  it("reports blocked payload columns without copying them", () => {
    assert.deepEqual(
      findBlockedPayloadColumns({ tenant_id: 7, id: 1, task_id: "a" }),
      ["tenant_id", "id"],
    );
  });
});

describe("import-clickup-csv wiring", () => {
  it("uses requireCaller Version A on admin.team_users.manage", () => {
    assert.match(indexSrc, /from ["']\.\.\/_shared\/requireCaller\.ts["']/);
    assert.match(
      indexSrc,
      /requireCaller\(req,\s*["']admin\.team_users\.manage["'],\s*["']full["']\)/,
    );
    assert.match(indexSrc, /if \(caller instanceof Response\) return caller/);
  });

  it("never spreads a caller-supplied row into the upsert", () => {
    assert.doesNotMatch(indexSrc, /\.\.\.(r|row|rows|body)\b/);
    assert.match(indexSrc, /pickAllowedClickupColumns/);
    assert.match(indexSrc, /Object\.assign\(\{\}, picked/);
  });

  it("does not write tenant_id from the row payload", () => {
    assert.match(allowlistSrc, /tenant_id is intentionally absent/);
    assert.doesNotMatch(
      indexSrc,
      /tenant_id:\s*(raw|r|row|body)/,
    );
    assert.match(indexSrc, /resolveTenantIds/);
  });

  it("uses APP_BASE_URL CORS and never echoes *", () => {
    assert.match(indexSrc, /corsHeadersFor\(req\)/);
    assert.doesNotMatch(indexSrc, /Access-Control-Allow-Origin["']:\s*["']\*/);
    assert.doesNotMatch(indexSrc, /["']\*["']/);
  });
});
