import assert from "node:assert/strict";
import test from "node:test";

import { isAllowlisted, scanMigration, validateAllowlist } from "./audit-migrations.mjs";

test("scans hosted URLs, cron, HTTP, DML, IDs, tags, and replay risk", () => {
  const report = scanMigration(
    "supabase/migrations/20990101000000_backfill_seed.sql",
    `-- migration-target-project: qa-project-ref
     select cron.schedule('nightly', '0 0 * * *', $$ select net.http_post('https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/job'); $$);
     insert into public.example (id) values ('11111111-1111-4111-8111-111111111111');
     delete from public.example where tenant_id = 42;`,
  );

  assert.deepEqual(report.tags, ["backfill", "seed"]);
  assert.equal(report.findings.some((finding) => finding.category === "production-url"), true);
  assert.equal(report.findings.some((finding) => finding.category === "cron-registration"), true);
  assert.equal(report.findings.some((finding) => finding.category === "http-call"), true);
  assert.equal(report.findings.some((finding) => finding.category === "data-mutation"), true);
  assert.equal(report.findings.some((finding) => finding.category === "destructive-mutation"), true);
  assert.equal(report.findings.some((finding) => finding.category === "hard-coded-id"), true);
  assert.equal(report.findings.some((finding) => finding.operation === "numeric-id-literal"), true);
  assert.equal(report.replaySafety, "unsafe-without-review");
});

test("requires concrete, short-lived allowlist entries", () => {
  const now = new Date("2026-09-07T00:00:00Z");
  const errors = validateAllowlist([
    {
      id: "expired",
      file: "supabase/migrations/example.sql",
      categories: ["cron-registration"],
      targetProject: "qa-project-ref",
      owner: "platform",
      reason: "test",
      expires: "2026-09-06",
    },
    {
      id: "too-long",
      file: "supabase/migrations/example.sql",
      categories: ["cron-registration"],
      targetProject: "qa-project-ref",
      owner: "platform",
      reason: "test",
      expires: "2026-10-20",
    },
  ], now);
  assert.equal(errors.some((error) => error.includes("expired")), true);
  assert.equal(errors.some((error) => error.includes("more than 31 days")), true);
});

test("matches an allowlist entry by file, category, and target project", () => {
  const finding = { file: "supabase/migrations/new.sql", category: "cron-registration", targetProject: "qa-project-ref" };
  assert.equal(isAllowlisted(finding, [{
    id: "qa-cron",
    file: "supabase/migrations/new.sql",
    categories: ["cron-registration"],
    targetProject: "qa-project-ref",
    owner: "platform",
    reason: "QA-only schedule",
    expires: "2026-09-20",
  }]), true);
});

test("does not treat SQL comments as executable data mutation", () => {
  const report = scanMigration(
    "supabase/migrations/20990101000001_comment_only.sql",
    "-- Update public.users during the future backfill\n/* DELETE FROM public.users; */\nCREATE TABLE public.example (id integer);",
  );
  assert.equal(report.findings.some((finding) => finding.category === "data-mutation" || finding.category === "destructive-mutation"), false);
});
