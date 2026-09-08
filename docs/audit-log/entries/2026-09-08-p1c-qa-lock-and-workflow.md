# P1-C QA lock and protected workflow

**Date:** 2026-09-08  
**Initiative:** Phase 2.6 stabilization, Packet P1-C  
**Author:** Codex

## Change

The tenant-isolation test harness now fails closed whenever a service-role key
is present but the target is not the allowlisted `unicorn-qa` project
(`qfpxvumcrnzrjyvqkicq`). It also acquires an atomic same-host lock and always
releases that lock from teardown, including fixture-setup failures.

A protected `workflow_dispatch`/nightly workflow was added with a
GitHub Actions concurrency group for cross-run serialization. The workflow
requires QA-only publishable and service-role secrets before starting Vitest;
missing secrets fail the job rather than producing a green skipped suite. It
has no pull-request trigger and is bound to the `unicorn-qa` environment.

## Safety boundary

No service-role key was added, no production key was used, and no hosted
database state changed in this implementation. The GitHub environment must be
configured and protected by an owner before the workflow is enabled for live
execution. P1-C still requires live RLS, cleanup-failure and zero-residue
evidence before it can exit.

## Verification

- `node --test scripts/validate-qa-baseline.test.mjs scripts/qa-baseline-parity.test.mjs` — 5 passed;
- baseline validator — pass;
- application-scope parity checker — pass; and
- `git diff --check` — pass.

