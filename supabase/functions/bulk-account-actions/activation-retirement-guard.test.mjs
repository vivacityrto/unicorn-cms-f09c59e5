import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const bulkSource = await readFile(path.join(here, "index.ts"), "utf8");
const workerSource = await readFile(
  path.join(here, "../cohort-access-sender-worker/index.ts"),
  "utf8",
);

test("bulk account actions reject legacy ghost activation before sender invocation", () => {
  assert.match(bulkSource, /body\.action === "activate"/);
  assert.match(bulkSource, /json\(req, 410/);
  assert.match(bulkSource, /code: "GHOST_ACTIVATION_RETIRED"/);
  assert.match(bulkSource, /const senderName = "send-password-reset"/);
  assert.match(bulkSource, /body: \{ user_uuid \}/);
  assert.doesNotMatch(bulkSource, /senderName = body\.action === "activate"/);
  assert.doesNotMatch(bulkSource, /functions\.invoke\("activate-ghost-user"/);
});

test("cohort worker rejects legacy activation before leasing any job item", () => {
  assert.match(workerSource, /job\.action === "activate"/);
  assert.match(workerSource, /json\(req, 410/);
  assert.match(workerSource, /code: "GHOST_ACTIVATION_RETIRED"/);
  assert.match(workerSource, /const senderName = "send-password-reset"/);
  assert.match(workerSource, /p_job_id: jobId, p_worker_id: workerId/);
  assert.doesNotMatch(workerSource, /senderName = action === "activate"/);
  assert.doesNotMatch(workerSource, /functions\.invoke\("activate-ghost-user"/);
});
