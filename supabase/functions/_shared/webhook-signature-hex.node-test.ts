import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyHmacSha256Hex } from "./webhook-signature.ts";

const secret = "test-secret";
const body = JSON.stringify({ hello: "world" });
const sign = (s: string, b: string) => `sha256=${createHmac("sha256", s).update(b).digest("hex")}`;

test("accepts a correct sha256= signature", async () => {
  assert.equal(await verifyHmacSha256Hex(secret, body, sign(secret, body)), true);
});

test("rejects a wrong secret, a tampered body and a bare digest without the prefix", async () => {
  assert.equal(await verifyHmacSha256Hex(secret, body, sign("other", body)), false);
  assert.equal(await verifyHmacSha256Hex(secret, body + " ", sign(secret, body)), false);
  assert.equal(await verifyHmacSha256Hex(secret, body, sign(secret, body).slice("sha256=".length)), false);
});

test("rejects empty, non-hex, odd-length and truncated signatures", async () => {
  for (const bad of ["", "sha256=", "sha256=zz", "sha256=abc", sign(secret, body).slice(0, -2)]) {
    assert.equal(await verifyHmacSha256Hex(secret, body, bad), false, bad);
  }
});
