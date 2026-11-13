/**
 * Static shape checks for the support-ticket migrations (they live here so
 * `npm run test:edge` runs them). They guard the properties the design depends
 * on: hardened functions, no anon access, RLS on every table, RPC-only ticket
 * creation, an untouched legacy side in the backfill, and read-only legacy
 * tables after cut-over. Behaviour is proven on unicorn-qa by
 * supabase/qa-checks/support_tickets_rls_tests.sql.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migrations = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");
const read = (name) => readFileSync(join(migrations, name), "utf8");
const model = read("20261113100000_support_tickets_model.sql");
const backfill = read("20261113110000_support_tickets_backfill.sql");
const cutover = read("20261113120000_support_tickets_cutover.sql");
const strip = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

describe("support tickets model migration", () => {
  const sql = strip(model);

  it("hardens every function: empty search_path, schema-qualified, PUBLIC and anon revoked", () => {
    const defs = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)\$function\$;/g)];
    assert.ok(defs.length >= 9, `expected at least 9 functions, found ${defs.length}`);
    for (const [full, name] of defs) {
      assert.match(full, /SET search_path = ''/, `${name} must set an empty search_path`);
      assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC`), `${name} must revoke PUBLIC`);
    }
  });

  it("never grants anything to anon", () => {
    assert.ok(!/GRANT[^;]*\bTO\b[^;]*\banon\b/i.test(sql));
    assert.match(sql, /REVOKE ALL ON public\.support_tickets[\s\S]*?FROM PUBLIC, anon, authenticated;/);
  });

  it("enables RLS on all five tables", () => {
    for (const t of [
      "support_tickets", "support_ticket_messages", "support_ticket_attachments",
      "support_ticket_migration_map", "support_ticket_migration_checks",
    ]) {
      assert.match(sql, new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
    }
  });

  it("makes ticket creation RPC-only: no INSERT or DELETE policy and no INSERT grant on tickets", () => {
    assert.ok(!/CREATE POLICY \w+ ON public\.support_tickets\s+FOR (INSERT|DELETE)/.test(sql));
    assert.match(sql, /GRANT SELECT, UPDATE\s+ON public\.support_tickets\s+TO authenticated/);
  });

  it("limits clients to non-staff-only replies and bars event or AI rows", () => {
    assert.match(sql, /kind = 'reply'/);
    assert.match(sql, /staff_only = false AND public\.can_view_support_ticket\(ticket_id\)/);
    assert.match(sql, /CHECK \(kind <> 'ai_draft' OR staff_only\)/);
  });

  it("keeps ComplyHub and company tickets off customer tenants", () => {
    assert.match(sql, /CHECK \(product = 'unicorn' OR tenant_id = 6372\)/);
    assert.match(sql, /p_product <> 'unicorn' THEN\s+RAISE EXCEPTION 'Not permitted'/);
  });

  it("gives clients no UPDATE right on tickets", () => {
    const update = sql.match(/CREATE POLICY support_tickets_update[\s\S]*?;\n/)?.[0] ?? "";
    assert.match(update, /USING \(public\.is_vivacity_team_safe/);
    assert.match(update, /WITH CHECK \(public\.is_vivacity_team_safe/);
  });
});

describe("support tickets backfill migration", () => {
  const sql = strip(backfill);

  it("never modifies or deletes the legacy tables", () => {
    assert.ok(!/UPDATE\s+public\.(suggest_items|suggest_attachments|help_threads|help_messages)\b/i.test(sql));
    assert.ok(!/DELETE\s+FROM\s+public\.(suggest_items|suggest_attachments|help_threads|help_messages)\b/i.test(sql));
    assert.ok(!/TRUNCATE|DROP TABLE/i.test(sql));
  });

  it("is re-runnable and reconciles inside one block that raises on mismatch", () => {
    assert.ok((sql.match(/ON CONFLICT[^;]*DO NOTHING/g) ?? []).length >= 4);
    assert.match(sql, /RAISE EXCEPTION 'support ticket backfill reconciliation failed/);
    assert.match(sql, /content hash mismatches/);
  });

  it("migrates only the support channel of help_threads", () => {
    assert.match(sql, /WHERE t\.channel = 'support'/);
    assert.ok(!/channel = 'chatbot'/.test(sql));
  });

  it("keeps staff-only content staff-only and reporter wording verbatim", () => {
    assert.match(sql, /'event', true, v_note/);
    assert.match(sql, /COALESCE\(NULLIF\(s\.description, ''\), '\(no description\)'\)/);
  });
});

describe("support tickets cut-over migration", () => {
  const sql = strip(cutover);

  it("makes the legacy ticket tables read-only for the browser roles", () => {
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.suggest_items\s+FROM authenticated, anon/);
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.suggest_attachments\s+FROM authenticated, anon/);
  });

  it("closes the browser insert path into help_threads and help_messages and retires the old trigger", () => {
    assert.match(sql, /DROP POLICY IF EXISTS help_threads_insert\s+ON public\.help_threads/);
    assert.match(sql, /DROP POLICY IF EXISTS help_messages_insert\s+ON public\.help_messages/);
    assert.match(sql, /DROP TRIGGER IF EXISTS trg_notify_csc_on_support_ticket ON public\.help_threads/);
  });

  it("does not drop any table", () => {
    assert.ok(!/DROP TABLE/i.test(sql));
  });
});
