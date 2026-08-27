import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isDriveItemWithinRoot } from "./drive-root.ts";

describe("isDriveItemWithinRoot", () => {
  it("allows a descendant of the configured tenant root", async () => {
    const parents = new Map([["file", "folder"], ["folder", "tenant-root"]]);
    assert.equal(await isDriveItemWithinRoot("file", "tenant-root", async (id) => parents.get(id) ?? null), true);
  });

  it("denies an item in the same drive but outside the tenant root", async () => {
    const parents = new Map([["other-tenant-file", "other-tenant-root"], ["other-tenant-root", "drive-root"]]);
    assert.equal(await isDriveItemWithinRoot("other-tenant-file", "tenant-root", async (id) => parents.get(id) ?? null), false);
  });

  it("fails closed on a missing parent and stops walking", async () => {
    const lookedUp = [];
    const allowed = await isDriveItemWithinRoot("file", "tenant-root", async (id) => {
      lookedUp.push(id);
      return null;
    });
    assert.equal(allowed, false);
    assert.deepEqual(lookedUp, ["file"]);
  });

  it("allows a legitimate hierarchy deeper than the former 20-hop cutoff", async () => {
    const parents = new Map();
    let child = "file";
    for (let depth = 0; depth < 32; depth++) {
      const parent = `folder-${depth}`;
      parents.set(child, parent);
      child = parent;
    }
    parents.set(child, "tenant-root");
    assert.equal(await isDriveItemWithinRoot("file", "tenant-root", async (id) => parents.get(id) ?? null), true);
  });

  it("fails closed on a cyclic parent chain", async () => {
    const parents = new Map([
      ["file", "folder-a"],
      ["folder-a", "folder-b"],
      ["folder-b", "folder-a"],
    ]);
    assert.equal(await isDriveItemWithinRoot("file", "tenant-root", async (id) => parents.get(id) ?? null), false);
  });
});
