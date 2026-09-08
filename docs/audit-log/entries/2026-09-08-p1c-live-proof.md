# P1-C live tenant-isolation proof

- **Date:** 2026-09-08
- **Scope:** QA project `unicorn-qa` (`qfpxvumcrnzrjyvqkicq`), workflow run [34179875080](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34179875080)
- **Result:** all 15 live tenant-isolation RLS tests passed.

The run used the allowlisted QA URL and the serialized fixture harness. Its
`finally` cleanup completed, and a direct post-run query found zero run-scoped
tenant, profile, membership, conversation, message, audit or Auth-user rows.

The live run exposed baseline prerequisites that were absent from the
intentional zero-row replay. QA-only repairs restored standard service-role and
API-role privileges/defaults, seeded the non-sensitive access/lifecycle and
identity lookup values required by production triggers, and set the fixture's
tenant inserts to manual consultant assignment so unrelated capacity automation
does not run. No production schema, cron, HTTP registration or data changed.

The QA publishable and service-role keys are temporarily repository-level while
environment administration is pending. Move them to the protected `unicorn-qa`
environment and delete the repository copies before enabling unattended runs.
