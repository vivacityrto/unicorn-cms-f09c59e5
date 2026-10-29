import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLinkedIds, type LinkedIds, type LinkLookupClient } from "./linked-ids.ts";

type Row = Record<string, unknown>;

// In-memory stand-in for the Supabase query builder: from().select().eq()....limit().
function fakeDb(tables: Record<string, Row[]>, failTable?: string): LinkLookupClient {
  return {
    from(table: string) {
      return {
        select() {
          const filters: Array<[string, unknown]> = [];
          let max = Infinity;
          const q = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return q;
            },
            limit(count: number) {
              max = count;
              return q;
            },
            // deno-lint-ignore no-explicit-any
            then(resolve: (v: any) => unknown, reject?: (e: unknown) => unknown) {
              if (table === failTable) {
                return Promise.resolve({ data: null, error: new Error("boom") }).then(resolve, reject);
              }
              const rows = (tables[table] ?? [])
                .filter((r) => filters.every(([c, v]) => r[c] === v))
                .slice(0, max);
              return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
            },
          };
          return q;
        },
      };
    },
  } as unknown as LinkLookupClient;
}

const NONE: LinkedIds = { stageId: null, packageId: null, taskId: null, evidenceItemId: null, categoryId: null };

// Tenant 10 owns package instance 100 (catalogue package 7), stage instance 1000 and evidence item "item-a".
// Tenant 20 owns package instance 200 (catalogue package 8), stage instance 2000 and evidence item "item-b".
const tables = {
  package_instances: [
    { id: 100, tenant_id: 10, package_id: 7 },
    { id: 200, tenant_id: 20, package_id: 8 },
  ],
  stage_instances: [
    { id: 1000, packageinstance_id: 100 },
    { id: 2000, packageinstance_id: 200 },
  ],
  evidence_requests: [
    { id: "req-a", tenant_id: 10 },
    { id: "req-b", tenant_id: 20 },
  ],
  evidence_request_items: [
    { id: "item-a", request_id: "req-a" },
    { id: "item-b", request_id: "req-b" },
  ],
  portal_document_categories: [
    { id: "cat-live", is_active: true },
    { id: "cat-off", is_active: false },
  ],
};

test("no linked ids passes", async () => {
  assert.deepEqual(await checkLinkedIds(fakeDb(tables), 10, NONE, true), { ok: true });
});

test("own-tenant ids of every kind pass", async () => {
  const ids = { ...NONE, stageId: 1000, packageId: 7, evidenceItemId: "item-a", categoryId: "cat-live" };
  assert.deepEqual(await checkLinkedIds(fakeDb(tables), 10, ids, true), { ok: true });
});

test("another tenant's stage, package and evidence item are rejected with 403", async () => {
  for (const ids of [
    { ...NONE, stageId: 2000 },
    { ...NONE, packageId: 8 },
    { ...NONE, evidenceItemId: "item-b" },
  ]) {
    const result = await checkLinkedIds(fakeDb(tables), 10, ids, true);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.status, 403);
  }
});

test("ids that do not exist are rejected", async () => {
  for (const ids of [
    { ...NONE, stageId: 9999 },
    { ...NONE, packageId: 9999 },
    { ...NONE, evidenceItemId: "missing" },
  ]) {
    assert.equal((await checkLinkedIds(fakeDb(tables), 10, ids, true)).ok, false);
  }
});

test("a lookup error fails closed", async () => {
  for (const failTable of ["stage_instances", "package_instances", "evidence_request_items", "evidence_requests"]) {
    const ids = { ...NONE, stageId: 1000, packageId: 7, evidenceItemId: "item-a" };
    assert.equal((await checkLinkedIds(fakeDb(tables, failTable), 10, ids, true)).ok, false, failTable);
  }
});

test("a member cannot set linked_task_id; staff can", async () => {
  const ids = { ...NONE, taskId: "5b1f6c0e-0000-4000-8000-000000000000" };
  const member = await checkLinkedIds(fakeDb(tables), 10, ids, true);
  assert.equal(member.ok, false);
  assert.deepEqual(await checkLinkedIds(fakeDb(tables), 10, ids, false), { ok: true });
});

test("category must exist and be active (400)", async () => {
  for (const categoryId of ["cat-off", "nope"]) {
    const result = await checkLinkedIds(fakeDb(tables), 10, { ...NONE, categoryId }, true);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.status, 400);
  }
});

test("a staff caller is still held to the tenant for stage, package and evidence item", async () => {
  const result = await checkLinkedIds(fakeDb(tables), 10, { ...NONE, stageId: 2000 }, false);
  assert.equal(result.ok, false);
});
