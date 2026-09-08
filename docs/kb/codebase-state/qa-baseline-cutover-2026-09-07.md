# QA baseline cutover — 2026-09-07

## Purpose

This procedure defines the safe cutover for the tenant-isolation QA target.
It is intentionally separate from the production migration stream. A baseline
must not be added as an ordinary file under `supabase/migrations/` because
production would attempt to apply it.

The broader reusable QA coverage model is recorded in
[`qa-environment-and-coverage-strategy-2026-09-08.md`](../reference/qa-environment-and-coverage-strategy-2026-09-08.md).
This cutover is the environment gate for P1-C, not the complete application QA
programme.

## Required baseline artifact

Create a versioned JSON manifest from a read-only schema capture. The manifest
must record:

- QA target name, project ref and URL;
- production source project ref, capture time, commit SHA and migration cutoff;
- schema fingerprint plus extensions, tables, views, functions, triggers,
  RLS policies, grants and publications;
- `cron.enabled: false` and `scheduleCount: 0`; and
- `sync.mode: controlled`, `sync.source: main`, `sync.automatic: false`.

Validate it with:

```text
node scripts/validate-qa-baseline.mjs --manifest <manifest>
node scripts/qa-baseline-parity.mjs --baseline <manifest> --actual <capture>
node --test scripts/validate-qa-baseline.test.mjs
node --test scripts/qa-baseline-parity.test.mjs
```

The initial read-only capture is recorded in
[`qa-baseline-manifest-2026-09-07.json`](qa-baseline-manifest-2026-09-07.json).
The manifest is now `status: verified` under the explicit application-scope
parity contract described below; it is not a claim of byte-for-byte parity
with Supabase-managed schemas or production scheduling infrastructure.

The capture recorded 8 extensions, 662 tables, 136 views, 670 functions, 486
triggers, 1,966 policies and 2 publications. The P1-C critical surface is
present and RLS-enabled for `conversation_participants`, `messages`,
`tenant_messages`, `tenants` and `users`; the critical policy set contains 23
policies. Production's migration ledger currently contains 332 entries through
`20260907052028`.

For P1-C, the five isolation tables contain 174 columns and 19 foreign keys;
their column and foreign-key fingerprints are recorded in the manifest so QA
parity can detect contract drift before any service-role credential is used.

## Existing-project review

The organization was checked for an existing reusable QA target. `vivacity-au`
(`ejwizcfxhccytxmxdzzt`) has only three migrations and is not a copy of the
Unicorn production schema. `ComplyHub Project`
(`gdwhlstfguxarnxasrrs`) has baseline-named migrations, but its schema is not
equivalent (1,218 tables, 2,239 functions and 6,672 policies), and it has 49
cron jobs. Neither project is safe to use for P1-C without an owner-approved
environment decision and a separate parity review.

The validator is a metadata guard only. It does not connect to Supabase,
apply migrations, reset a branch, or prove schema parity.

The parity checker consumes two read-only catalog captures and compares the
application-scope schema counts/fingerprints, the P1-C critical columns and
foreign keys, migration failures, cron relation absence and production URL
references. Extensions, tables and views are strict fingerprint gates;
functions, triggers and policies are strict count gates because the sanitized
QA baseline contains documented no-op/type-correction overrides. Managed
schemas, pg_cron/pg_net and publications are explicit exclusions. The checker
is the precondition for the manifest's `verified` status and never connects to
Supabase or performs writes.

The reusable capture query is
[`scripts/qa-baseline-capture.sql`](../../../scripts/qa-baseline-capture.sql).
Run it once against the source and once against QA through Supabase MCP, save
each JSON result as a capture file, and pass the QA result to the parity
checker. The query reads catalog metadata only; `productionUrlReferences` must
be supplied by the migration-path audit rather than inferred from catalog
objects.

The production run is recorded in
[`qa-baseline-production-capture-2026-09-07.json`](qa-baseline-production-capture-2026-09-07.json).
It confirms 24 production cron schedules; that is expected for the source and
must be zero in QA. The capture contains no application rows or secret values.

The hosted sequence is documented in the
[QA provisioning runbook](qa-provisioning-runbook-2026-09-07.md). It remains
an operator-approved step because creating the dedicated project is billable
and loading the schema baseline changes external state.

## Forward migration model

Future schema migrations are authored in Git, reviewed and merged to `main`.
They are then applied to QA by an explicit, protected sync job or operator
step. QA is a consumer of migration files, not a second source of truth.

The sync must stop before applying a migration when it contains a production
URL, cron registration, external HTTP call, hidden backfill, destructive DML,
or an unreviewed extension assumption. Scheduling and external service setup
belong to a separate deployment step; QA remains cron-free by default.

After each approved sync, verify migration status, schema parity and absence
of production targets before running P1-C. Never run P1-C against a partially
migrated or merely `ACTIVE_HEALTHY` branch.

## Current state

The failed `tenant-isolation-qa` preview branch (`iqichbimamlyjpaguddl`) has
been deleted. A dedicated project now exists as `unicorn-qa`
(`qfpxvumcrnzrjyvqkicq`) in `ap-southeast-1`. It is healthy, has no GitHub
integration, no branches, no application migrations and no application data.
The post-provision catalog capture is recorded in
[`qa-baseline-qa-initial-capture-2026-09-08.json`](qa-baseline-qa-initial-capture-2026-09-08.json).
The reviewed schema-only baseline is loaded and the application-scope parity
gate passes; P1-C remains blocked only on the separate QA service-role secret
and test-harness hardening gate.

## 2026-09-08 applied-baseline evidence

The sanitized schema-only baseline has now been applied to `unicorn-qa` through
Supabase MCP. The raw dump was read-only and was never applied. The sanitized
artifact SHA-256 is recorded in
[`qa-baseline-qa-applied-capture-2026-09-08.json`](qa-baseline-qa-applied-capture-2026-09-08.json).

The QA catalog now proves the P1-C critical surface: 652 public tables with
RLS enabled, 1,960 application-scope policies, 136 views, 669 functions, 485
application triggers, 174 critical columns, and 19 critical foreign keys.
All application tables are empty, `cronScheduleCount` is zero, and a direct
function-definition scan found zero production-project references or
`net.http*` calls.

Whole-database byte parity remains intentionally out of scope because this
application-scope baseline excludes Supabase-managed storage/auth/realtime
objects, pg_cron/pg_net, and publications that are not part of the P1-C test
contract. The four production HTTP trigger functions are present only as
no-op QA trigger bodies. The `current_user_tenant_ids()` return type was
corrected to match the live `tenant_members.tenant_id bigint` contract. These
are recorded exceptions, not silent drift; future syncs must preserve this
scope and re-run the parity checker.

The QA migration ledger is a controlled baseline replay ledger (68 applied
entries at capture time), not a copy of production's historical
`supabase_migrations.schema_migrations` rows. Do not run blind `supabase db
push` against the full historical tree; future migrations must be scanned,
reviewed and applied forward explicitly, with the ledger and parity capture
updated after each approved sync.

The P1-C harness now enforces the allowlisted QA project when a service-role
key is present and serializes same-host runs with an atomic lock. The protected
workflow adds the cross-run GitHub Actions concurrency group. Configure the
`unicorn-qa` environment with `QA_SUPABASE_PUBLISHABLE_KEY` and
`QA_SUPABASE_SERVICE_ROLE_KEY` once owner access is available. During the
initial proof, those two QA-only secrets were temporarily stored at repository
scope because the environment page was unavailable to the operator; the
workflow remained manual/nightly-only and QA-target-allowlisted. Delete the
repository copies after moving the secrets to the protected environment.

## 2026-09-08 live P1-C proof

Workflow run
[`34179875080`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34179875080)
executed all 15 tenant-isolation RLS tests against `unicorn-qa`; all passed.
The suite's `finally` cleanup and post-cleanup assertions were exercised, and a
direct QA query confirmed zero run-scoped tenants, profiles, memberships,
conversations, messages, audit rows or Auth users remained.

The zero-row baseline required four QA-only parity repairs discovered by this
run: standard `service_role`/API-role grants and defaults; the non-sensitive
`dd_access_status` and `dd_lifecycle_status` lookup values; the identity lookup
values used by the production user-normalization trigger (including `Client
Child` and `Vivacity Team`); and a fixture-only manual consultant-assignment
mode to avoid unrelated capacity automation. These are recorded in the QA
migration ledger and were not applied to production.
