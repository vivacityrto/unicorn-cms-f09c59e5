import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../../migrations/20261118120000_cst_client_detail.sql", import.meta.url), "utf8");
const down = readFileSync(new URL("../../migrations/rollback/20261118120000_cst_client_detail.down.sql", import.meta.url), "utf8");

describe("get_cst_client_detail migration", () => {
  it("adds exactly one function and changes nothing else", () => {
    assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length, 1);
    assert.doesNotMatch(sql, /\b(DROP|ALTER|INSERT|UPDATE|DELETE|TRUNCATE)\b\s+(TABLE|POLICY|FUNCTION|INTO|public\.)/i);
    assert.doesNotMatch(sql, /CREATE (TABLE|TRIGGER|POLICY)/i);
  });

  it("is SECURITY DEFINER with an empty search_path and read-only (STABLE)", () => {
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /SET search_path TO ''/);
    assert.match(sql, /\bSTABLE\b/);
  });

  it("rejects anyone who is not Vivacity staff, before reading any data", () => {
    const gate = sql.indexOf("is_vivacity_team_safe(auth.uid())");
    assert.ok(gate > 0);
    assert.ok(gate < sql.indexOf("FROM public.tenant_users"));
    assert.match(sql, /RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'/);
  });

  it("is not callable by the public or anonymous roles", () => {
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_cst_client_detail\(bigint, date\) FROM PUBLIC, anon/);
    assert.doesNotMatch(sql, /GRANT EXECUTE[^;]*\banon\b/);
  });

  it("uses the same notion of active as the weekly figures", () => {
    for (const evt of ["client_login", "message_sent", "message_read", "academy_lesson_completed"]) assert.match(sql, new RegExp(evt));
    assert.match(sql, /self_enrol/);
    assert.match(sql, /is_vivacity_internal/);
    assert.match(sql, /archived/);
  });

  it("has a rollback that only drops that function", () => {
    assert.match(down, /DROP FUNCTION IF EXISTS public\.get_cst_client_detail\(bigint, date\)/);
    assert.equal((down.match(/DROP/g) ?? []).length, 1);
  });
});
