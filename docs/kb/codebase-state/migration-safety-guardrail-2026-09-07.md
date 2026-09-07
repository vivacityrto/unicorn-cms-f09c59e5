# Migration safety guardrail — 2026-09-07

The repository migration audit is implemented by
[`scripts/audit-migrations.mjs`](../../../scripts/audit-migrations.mjs) and runs
in [Migration safety guardrails](../../../.github/workflows/migration-safety.yml).
It is a static review guard, not a SQL parser and not a substitute for replaying
the migrations in a disposable Supabase project.

## Commands

```text
npm run audit:migrations
node scripts/audit-migrations.mjs --format json
node scripts/audit-migrations.mjs --changed-only --base-ref origin/main
node --test scripts/audit-migrations.test.mjs
```

The full-tree command reports historical findings and exits successfully. The
changed-only command is the CI gate: it fails for an unallowlisted risky
finding or for an attempt to edit an existing migration. A corrective change
must be a new migration file; old applied history is not rewritten.

## What is classified

The scanner records hosted `supabase.co` URLs and known production project
references, `cron.schedule`/`cron.unschedule`, `net.http_*`, extension
assumptions, migration-time DML, destructive DML, hard-coded UUIDs, backup
tables, and filename/content tags for backfills, seeds, requeues, duplicate
removal, and cleanup. Each finding receives a conservative empty-QA replay
classification (`likely-safe`, `requires-review`, or
`unsafe-without-review`).

The scanner does not claim that unrecognised SQL is safe. The M0 inventory and
the M2–M6 packets remain required for hosted-job decisions, migration replay,
and production changes.

## Reviewed exceptions

Exceptions live in
[`supabase/migration-safety-allowlist.json`](../../../supabase/migration-safety-allowlist.json).
Each entry must include:

- `id`;
- `file` (repository-relative migration path or `*`);
- `categories` (for example `production-url`, `cron-registration`,
  `cron-unschedule`, `http-call`, `data-mutation`, or
  `destructive-mutation`);
- `targetProject` (a concrete project reference);
- `owner`;
- `reason`; and
- `expires` (no more than 31 days from the audit date).

An allowlist entry permits review to be explicit and temporary; it does not
make a production URL safe or authorize a hosted migration by itself. Never
put a production service-role key in ordinary CI.
