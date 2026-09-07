# Notification queue retirement deployment verification (M3-B)

- **Date:** 2026-09-07
- **Author:** Codex
- **Status:** deployed; M3-C quiet-period monitoring started
- **Scope:** explicitly authorized production Edge deployments and read-only health checks; no database migration or data change

## Deployment

The merged M3-B sources were manually deployed to production project
`yxkgdalkbrriasiyyrwk` after native Git sync had not propagated the merge:

- `process-notification-queue` deployed as version **171** at
  `2026-09-07T06:38:23Z`, with `verify_jwt=false`.
- `send-automated-email` deployed as version **171** at
  `2026-09-07T06:38:53Z`, with `verify_jwt=false`.

## Verification

- The deployed queue source contains `FUNCTION_RETIRED`, no
  `notification_schedule` reference, and no service-role key access.
- An unauthenticated GET to the production queue endpoint returned HTTP **410**
  with `code: FUNCTION_RETIRED`.
- The deployed email source contains no `notification_schedule` reference.
- No database migration, table change, or hosted data mutation was performed.

The M3-C quiet-period clock starts after this verified deployment. During the
window, repeat the no-caller/no-access/error checks before requesting separate
authorization for the reversible `notification_schedule` drop migration.
