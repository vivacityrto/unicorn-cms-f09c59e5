# 2026-09-18 — EduCareer package seat capacity correction

- **Date:** 2026-09-18
- **Author:** Codex
- **Status:** Resolved; hosted migration applied and verification passed
- **Scope:** `get_tenant_user_capacity` membership entitlement and occupied-seat calculation
- **Tenant investigated:** EduCareer College (`tenant_id = 7545`)

## Finding

EduCareer has an active M-SAR / Sapphire RTO Membership package with
`packages.user_limit = 15`, but the capacity RPC returned `5/5`. The active
M-SAR instance was attached to the active KS-RTO root package. The RPC only
considered `parent_instance_id IS NULL`, so it ignored the active membership
entitlement and used the KS-RTO default cap of 5.

The same RPC counted `tenant_users` rows without checking the canonical
`tenant_members.status`. EduCareer had one active non-contact member and two
inactive Academy membership rows, plus two live pending invitations. Those
inactive rows inflated the reported usage to 5.

## Correction

The new migration keeps root package capacity behavior for non-membership
packages but includes active child membership instances when selecting the
per-membership cap. It also counts only non-contact users with an active
`tenant_members` row. Pending, non-expired non-contact invitations continue to
reserve seats.

This changes the affected tenant's effective result from `5/5` to `3/15`
under the current hosted data, without changing tenant rows or invitations.

## Verification

- Focused source contract asserts child membership inclusion and active-member
  filtering.
- Hosted authenticated RPC verification now returns `used = 3`, `limit = 15`,
  and `is_unlimited = false` for EduCareer.
- The Demo RTO client browser check rendered the Users route and its capacity
  pill (`4 of 10 users`) with no failed network responses or page errors.
