# Unicorn QA environment and coverage strategy

## Purpose

`unicorn-qa` is the reusable hosted integration-testing environment for the
Unicorn application. It was established first to unblock the tenant-isolation
proof in stabilization Packet P1-C, but its purpose is broader: future schema,
Edge Function, route and workflow changes must be able to run against a
controlled, data-less QA database without touching production.

This document records the boundary between the narrow P1-C gate and the
broader QA programme. It does not authorize a production migration, secret
creation, Edge deployment or data deletion.

## Why P1-C came first

The tenant-isolation suite contains the only tests that directly prove
cross-tenant RLS behavior for conversations and messages. Before this work,
the live block was skipped because it required a non-`VITE_`
`SUPABASE_SERVICE_ROLE_KEY` that was not available locally or in CI. The
placeholder tests that still passed did not exercise RLS.

P1-C therefore requires a disposable, non-production project where a
service-role client can create uniquely tagged fixtures and ordinary user
clients can exercise the real policies. The service-role key is used only for
fixture setup/cleanup; it must never be bundled into the frontend or placed in
ordinary pull-request CI.

## Current environment state

The target is `unicorn-qa` (`qfpxvumcrnzrjyvqkicq`) at
`https://qfpxvumcrnzrjyvqkicq.supabase.co`. The application-scope baseline is
loaded and verified by the [QA baseline cutover record](../codebase-state/qa-baseline-cutover-2026-09-07.md).

The verified contract proves matching application-scope extension, table and
view fingerprints; matching function, trigger and policy counts; matching
critical P1-C columns, foreign keys and policies; no application rows; no
`cron.job` relation; no production URL or `net.http*` references; and no
migration failures.

The baseline intentionally excludes Supabase-managed `auth`, `storage` and
`realtime` schemas, `pg_cron`, `pg_net` and non-contract publications. Four
production HTTP-trigger bodies are no-op QA replacements, and one source type
declaration was corrected to match the live schema. These are explicit parity
exceptions, not hidden drift.

The QA migration ledger is a controlled baseline replay ledger, not a copy of
production's historical migration ledger. `main` remains the source of truth;
future migrations are applied to QA through an explicit, scanned forward-sync
step. Blind historical `supabase db push` is prohibited.

## Coverage model

P1-C is one protected suite in a layered QA programme:

| Suite | Primary contract | Typical trigger |
| --- | --- | --- |
| `qa:rls` | Tenant boundaries, grants, staff access and negative authorization | RLS policy, grant, tenant-scoped table or auth helper change |
| `qa:contract` | Generated types, columns, enums, FKs and RPC return shapes | Schema or RPC migration |
| `qa:edge` | Auth, CORS, request/response and external-contract behavior | Edge Function change |
| `qa:data-lifecycle` | Create/update/archive/delete workflows and invariants | Feature workflow or trigger change |
| `qa:residue` | Run-scoped rows, Auth users, storage objects and orphan records | Any fixture-producing suite |
| `qa:migrations` | Replay safety and absence of production URLs, cron, HTTP or hidden backfills | Migration change |
| `qa:e2e` | Authenticated read-only route and workflow smoke checks | Route, auth or query-behavior change |
| `qa:cron-safety` | QA remains schedule-free unless explicitly enabled | Cron or scheduling change |

P1-C remains a focused gate. It is not replaced by Playwright, and a green
frontend suite cannot substitute for a real RLS assertion.

## How future changes select coverage

The intended automation is impact detection, not guessed test generation:

```text
migration/feature PR
  -> changed-object and route scan
  -> impact manifest
  -> required QA suites
  -> explicit QA sync
  -> targeted tests
  -> protected full/nightly suite
```

The migration scanner should identify tables, columns, policies, grants,
functions, triggers, extensions, cron/HTTP operations and migration-time DML.
Route and Edge changes should contribute their affected route/function names.
The resulting impact manifest maps risks to suites. A security-sensitive
change with no mapped test must fail CI or carry a short-lived reviewed waiver.

Examples:

- a new tenant-scoped table or policy selects `qa:rls`, `qa:contract` and
  `qa:residue`;
- an RPC selects `qa:contract` plus authorization-negative coverage;
- an Edge Function selects `qa:edge` with auth, CORS and response tests;
- a new protected route selects a read-only Playwright smoke test;
- a trigger, backfill or destructive migration selects `qa:migrations` and
  `qa:data-lifecycle` and stops for explicit review;
- a cron or HTTP registration is blocked by default in QA.

Static checks can automatically prove structure and safety. They cannot infer
business intent, such as whether staff should bypass a new policy or whether a
workflow's archive semantics changed. Those cases require a named contract
test or an owner-approved waiver.

## Execution and isolation rules

1. Migrations are authored, reviewed and merged to `main`.
2. The changed-only migration scanner runs before QA sync and blocks
   production URLs, cron/HTTP calls, hidden backfills, destructive DML and
   unreviewed extension assumptions.
3. The approved migration is applied to QA explicitly; QA does not auto-follow
   production or a Git branch.
4. A catalog capture and migration-ledger check run after sync.
5. Impacted suites run with a project-level lock. Fixture-producing suites use
   unique run IDs and reverse-order cleanup from `finally`.
6. Cleanup failures fail the run, and residue assertions check database rows,
   Auth users and any other fixture resources.
7. A protected manual/nightly workflow runs the complete QA suite. Its
   service-role secret is QA-only, environment-protected and unavailable to
   forked pull requests.

The persistent project may be reused; “disposable” describes the data and
credentials, not a requirement to recreate the project for every test. Every
run must still be safe to repeat and must leave the project data-less.

## Current P1-C handoff

Completed in the code path: placeholder removal, generated-type coverage,
unique run IDs and fail-closed reverse-dependency cleanup. Completed in the
environment path: allowlisted QA project, sanitized application-scope schema
baseline and parity verification.

Implemented in the current P1-C follow-up:

- same-host atomic lock in the test harness;
- allowlist guard that fails closed when a service-role key targets any other
  project; and
- protected manual/nightly workflow skeleton with a GitHub Actions concurrency
  group and QA-only secret names.

Remaining before P1-C exits:

- QA-only service-role secret in a protected environment;
- live execution of the 15 RLS tests against `unicorn-qa`;
- proof of cleanup failure propagation and zero residual rows/Auth users; and
- activation of the protected workflow after the first clean live runs,
  never exposed to forked PRs.

Once those pass, the same QA environment can support the broader layered
coverage model. Expansion should be tracked as separate suites and impact
packets rather than inflating `isolation.test.tsx` into an unreviewable
all-purpose test.
