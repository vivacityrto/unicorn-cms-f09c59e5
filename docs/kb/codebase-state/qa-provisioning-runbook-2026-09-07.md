# Tenant-isolation QA provisioning runbook — 2026-09-07

This runbook is the hosted follow-up to the repository baseline work. It is
ordered so no production credential is needed before the target is proven safe.

## 1. Provision the target

The dedicated project now exists as `unicorn-qa` in the existing organization,
region `ap-southeast-1` (Southeast Asia/Singapore). Its project ref is
`qfpxvumcrnzrjyvqkicq`. The dashboard reports `ACTIVE_HEALTHY`, zero migrations,
zero public tables, no branches and no GitHub repository connected. Do not use
the production project ref
`yxkgdalkbrriasiyyrwk`, the failed `tenant-isolation-qa` branch, or either of
the unrelated existing projects recorded in the cutover review.

The generated database password is an operator-held secret and must not be
committed or pasted into chat, source files, manifests or CI logs.

The read-only post-provision catalog capture is recorded in
`qa-baseline-qa-initial-capture-2026-09-08.json`. It confirms zero application
migrations, zero cron schedules, no production URL references and no imported
application data. The eight catalog tables and five extensions observed are
Supabase-managed baseline objects; this is not yet schema parity.

Record the new project ref and URL in a new manifest revision. Keep the
project data-less; do not import production rows, storage objects, Auth users,
Vault secrets or Edge Function secrets.

## 2. Load the schema baseline

Use a schema-only export from the verified production source. The export must
include tables, constraints, indexes, enums, extensions, functions, views,
triggers, RLS policies, grants, roles and publications. Remove or replace any
production URL, cron registration, external HTTP call or environment secret
before applying it to QA.

Do not add the export as a normal migration to the production migration
directory. Establish a QA migration cutoff/ledger as part of the provisioning
operation and record the exact source SHA and cutoff in the manifest.

## 3. Prove parity and isolation prerequisites

Run [`scripts/qa-baseline-capture.sql`](../../../scripts/qa-baseline-capture.sql)
against QA and save the JSON result. Run:

```text
node scripts/qa-baseline-parity.mjs \
  --baseline docs/kb/codebase-state/qa-baseline-manifest-<date>.json \
  --actual docs/kb/codebase-state/qa-baseline-qa-capture-<date>.json
```

The check must pass with no `cron.job` relation, zero production URL
references, zero migration failures, matching application-scope extension,
table and view fingerprints, matching function/trigger/policy counts, and
matching P1-C column, foreign-key and critical-policy fingerprints. The
capture's documented managed-schema and sanitized-function exceptions must be
present. Verify the project ref is not production before proceeding.

## 4. Configure forward migration sync

Future migrations are authored and reviewed in Git, merged to `main`, then
applied to QA by a protected, explicit sync step. The sync runs the changed-only
migration scanner first and stops for production URLs, cron/HTTP operations,
destructive DML, hidden backfills or extension assumptions. QA schedules remain
disabled by default. A failed sync leaves QA blocked; never mark migrations
applied to make the ledger look healthy.

## 5. Enable P1-C only after the gates

After two clean parity/sync runs, place only the QA project's service-role key
in a protected GitHub Actions Environment for a manual/nightly workflow. Never
place it in ordinary PR CI or expose it to forked pull requests. The P1-C suite
must then prove unique run IDs, serialized execution, reverse-order cleanup,
cleanup failure propagation and zero residual rows/Auth users.

## Cost and approval boundary

The current organization estimate is approximately $10/month for a dedicated
project. No project creation, migration application, reset, secret injection or
production data operation is authorized by this document alone; those actions
require explicit operator approval and postflight evidence.
