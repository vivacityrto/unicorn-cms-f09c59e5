# TOM P1.2-b guarded ghost-contact dry-run — QA evidence

- **Date:** 2026-09-15
- **Initiative:** Tenant Operating Model, P1.2-b
- **Operator:** Codex
- **Target:** allowlisted `unicorn-qa` only (`qfpxvumcrnzrjyvqkicq`); production was explicitly out of scope
- **Result:** accepted read-only evidence; no apply or retirement authority

## Why the first attempt was not accepted

The first protected workflow attempt (`34918054173`) passed target, preflight,
and credential-presence checks but failed before artifact creation because the
`security_invoker` view `v_auth_user_state` could not read its underlying
`public.users`/`auth.users` relations with the QA service role. No report was
created and no data was changed.

Carl had already approved a narrow QA-only correction. PR #1330 added a
manual, protected workflow that used the existing QA management credential to
grant `service_role` schema usage on `public` and `auth`, plus `SELECT` on
`public.users` and `auth.users`, then verified the view's
`security_invoker=true` contract. The correction workflow (`34918924306`)
passed. No RLS policy, view definition, application code, production project,
or production credential was changed.

## Approved run and preflight

The corrected snapshot ran as protected workflow `34919427510` from source
commit `77ab183dd37c23f11a01bccb24402b1aca94efc2`. The report's own run ID was
`453b20f5-510f-4f43-8322-8551dfedf689`. The workflow completed its target
allowlist check, non-credentialed help/characterization preflight, protected
QA service-credential check, one redacted snapshot, artifact assertions, and
upload successfully.

The output was downloaded to a private local path. It was not committed,
posted to a shared checkout, issue, PR, or chat. The workflow did not pass
`--include-identifiers` and verified `read_only: true`, `writes_performed: 0`,
and an empty write-operation list.

## Reconciled result

| Measure | Result |
| --- | ---: |
| Total ghost profiles | 15 |
| Membership-bearing profiles | 15 |
| Membershipless quarantine | 0 |
| Tenant candidate rows | 15 |
| Eligible candidates | 15 |
| Existing contact matches | 0 |
| Pending invitation matches | 0 |
| Collision/manual rows | 0 |
| Projected future inserts (not executed) | 15 |
| Writes performed | 0 |

The redacted artifact contained no raw email addresses, no unapproved source
UUIDs, and no secrets. The only UUID-shaped value retained unredacted was the
report run ID required to identify the snapshot; source UUIDs and tenant IDs
were hashed. There were no membershipless or collision holdouts for Carl's
manual review and no RBAC- or Client-Health-specific classification for
cross-initiative review.

## Boundary and follow-up

This evidence supports opening a separately authorized apply-design packet.
It does not authorize contact inserts, invitation sends, ghost-profile
retirement, Edge Function changes, migration work, or production observation.
The existing protected QA credential remains scoped to the QA workflows; no
credential was copied into the artifact or local report.

**Related packet:** [`p1-2-b-ghost-contact-dry-run-execution-packet.md`](../../kb/reference/tenant-operating-model/p1/p1-2-b-ghost-contact-dry-run-execution-packet.md)
