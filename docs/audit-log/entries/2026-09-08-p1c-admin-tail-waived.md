# P1-C administrative secret-move waiver

**Date:** 2026-09-08  
**Owner:** Carl  
**Scope:** QA tenant-isolation workflow governance

## Decision

The successful P1-C live proof in workflow run
[`34179875080`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34179875080)
is accepted as the exit evidence. The follow-up administrative work to move
`QA_SUPABASE_PUBLISHABLE_KEY` and `QA_SUPABASE_SERVICE_ROLE_KEY` from repository
scope into the protected `unicorn-qa` Actions environment, and to repeat the
proof after that move, is intentionally skipped.

## Guardrails retained

- the workflow is limited to `workflow_dispatch` and nightly execution;
- GitHub Actions concurrency serialization remains enabled;
- the harness fails closed outside the allowlisted `unicorn-qa` project;
- forked pull requests do not receive the secrets; and
- the QA service-role key must never be used against production or referenced
  by ordinary pull-request workflows.

This waiver changes administrative secret placement only. It does not change
the test harness, cleanup guarantees, QA project allowlist, or the recorded
zero-residue proof.
