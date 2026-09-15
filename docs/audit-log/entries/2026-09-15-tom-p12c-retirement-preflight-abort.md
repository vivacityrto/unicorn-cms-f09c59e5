# 2026-09-15 — TOM P1.2-c final preflight aborted on QA target mismatch

## Finding

The approved `unicorn-qa` project (`qfpxvumcrnzrjyvqkicq`) was re-confirmed
through its project-specific read-only control plane. It currently exposes only
two Edge Functions, `tenant-lifecycle` and `invite-user`; an exact lookup for
`activate-ghost-user` returned `Function not found`. Aggregate read-only SQL
also returned 15 auth users, no cohort jobs, and no activation-job rows, which
does not match the historical packet evidence.

A separate Supabase connector pointed to another project where the historical
target metadata was present. That project was not approved for action and was
not used.

## Disposition

The supervised preflight aborted before any disable, delete, redeploy, account,
job, invitation, migration, credential, or production action. The historical
target metadata is not current authoritative `unicorn-qa` evidence. Any future
run requires a fresh read-only reconciliation that proves the exact target is
deployed in the approved QA project; no project switch is implied by this
entry.
