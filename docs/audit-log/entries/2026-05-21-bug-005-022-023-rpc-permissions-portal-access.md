# Audit: 2026-05-21 — BUG-005, BUG-022, BUG-023 — RPC Permission Hardening & Portal Access Fix

**Trigger:** Lovable production DB change session — bug fix sprint covering RPC permission hardening (BUG-005), portal access for regular users (BUG-022), and academy invite scope confirmation (BUG-023). Includes follow-on data correction promoting 3 users to `secondary_contact`.  
**Author:** Khian (Brian)  
**Scope:** REVOKE PUBLIC/anon EXECUTE from two impersonator RPCs; one-line frontend fix unblocking 10 portal users; confirmation BUG-023 already resolved; data migration promoting 3 users to `secondary_contact` at their respective tenants. No schema changes.  
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### BUG-005 — Impersonator RPC permission hardening

**Problem:** `complete_enrollment_as_impersonator(bigint, uuid)` was granted to PUBLIC (`=X/postgres` in `proacl`) and had an explicit `anon` grant. `enrol_as_impersonator(bigint, uuid, bigint)` had its PUBLIC grant removed in an earlier migration but retained an explicit `anon` grant. Both functions are `SECURITY DEFINER` with internal `auth.uid() IS NULL` guards, so no unauthenticated call could succeed — but the database permission layer still allowed `anon` to attempt them, violating least-privilege.

**Callers verified:** Only two frontend hooks call these RPCs — `useCompleteEnrollment.ts` and `useEnrolCourse.ts`, both via the authenticated Supabase client. No edge functions, triggers, or cron jobs call them.

**Migration 1** — `20260520234217_1cccaf38-f117-47b5-b1c3-81f3768d1d2b.sql`

```sql
REVOKE EXECUTE ON FUNCTION public.complete_enrollment_as_impersonator(bigint, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_enrollment_as_impersonator(bigint, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enrol_as_impersonator(bigint, uuid, bigint) FROM anon;
```

**Post-deploy verification:**

| Function | proacl before | proacl after |
|---|---|---|
| `complete_enrollment_as_impersonator` | `{=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}` | `{postgres=X, authenticated=X, service_role=X}` ✅ |
| `enrol_as_impersonator` | `{postgres=X, anon=X, authenticated=X, service_role=X}` | `{postgres=X, authenticated=X, service_role=X}` ✅ |

---

### BUG-022 — Portal access for `relationship_role = 'user'` users

**Problem:** `ClientTenantContext.tsx` line 215 computed `canAccessClientPortal` as `fullScope && isContact`, where `isContact` only matched `primary_contact` and `secondary_contact`. Users with `relationship_role = 'user'` and `access_scope = 'full'` were always blocked from the portal regardless of their scope. 10 live users across 9 tenants were affected, some since February 2026.

**Affected users at time of fix:**

| User | Tenant | Locked out since |
|---|---|---|
| Ines Van Butsel | TRAYN PTY LTD | 3 Feb 2026 |
| Kim Luehman | Dijan Training Program | 17 Feb 2026 |
| Isla Hunter | Adelaide Aviation | 21 Feb 2026 |
| Sherman Anthoney | Adelaide Aviation | 21 Feb 2026 |
| Dayan Kasturiratna | Australian College | 23 Feb 2026 |
| Christopher Wilson | Think Real Estate | 9 Mar 2026 |
| Jenelle Watson | Watto Training | 9 Mar 2026 |
| Emily Myatt | National Skills Training | 24 Mar 2026 |
| Tashi Kipchu | Smart Nation Education | 22 Apr 2026 |
| Ezel Olores | Vivacity (internal) | 4 May 2026 |

**Fix (code only — no migration):** `src/contexts/ClientTenantContext.tsx` line 215:

```ts
// Before
canAccessClientPortal: fullScope && isContact,

// After
canAccessClientPortal: fullScope && (isContact || tenantUser.relationship_role === 'user'),
```

`canManagePortalUsers` (line 216) unchanged — regular users do not get manage/invite rights.  
`isAcademyOnly` (line 217) unchanged.  
Test file updated: `relationship_role = 'user'` + `access_scope = 'full'` case now asserts `canAccessClientPortal: true`.

**Codebase commit:** `7494bcd1` (main branch)

**RLS note:** RLS policies on all tenant tables key off `tenant_users` membership, not `relationship_role`. These 10 users were already entitled to read tenant data per RLS — the bug was a UI gate preventing them from reaching the portal at all.

---

### BUG-023 — Academy invite scope confirmation

**Status: Already resolved — no action taken.**

Diagnosis confirmed `accept_invitation_v2` already correctly maps `relationship_role = 'academy_user'` → `access_scope = 'academy_only'`. Live DB check: 0 `academy_user` rows with `access_scope <> 'academy_only'`; all 4 existing academy_user rows confirmed `academy_only`. The bug was resolved as part of BUG-017 work on `accept_invitation_v2` (12 May 2026). No code or migration required.

---

### Follow-on: Secondary contact promotion for 3 users

**Trigger:** Angela confirmed during the BUG-022 investigation that Jenelle Watson, Dayan Kasturiratna, and Emily Myatt should be `secondary_contact` at their respective tenants, not `user`. All three tenants already had a primary contact; secondary slots were empty for all three.

**Trigger interaction verified:** `trg_sync_primary_contact` (BEFORE UPDATE on `tenant_users`) automatically sets `secondary_contact = true` and `primary_contact = false` when `relationship_role = 'secondary_contact'` — booleans do not need to be set explicitly in the migration.

**`trg_sync_is_vivacity_internal` confirmed safe:** Only fires `is_vivacity_internal = true` for `'Super Admin'`, `'Team Leader'`, `'Team Member'`. Changing `unicorn_role` to `'Admin'` does not set `is_vivacity_internal`.

**Migration 2** — `20260521002410_af1b3706-4c7e-4f0a-bdf3-c70c0cfe20a5.sql`

Three UPDATE statements:
1. `tenant_users` — `relationship_role = 'secondary_contact'`, `role = 'parent'` (trigger auto-sets boolean flags)
2. `users` — `unicorn_role = 'Admin'`, `user_type = 'Client Parent'`
3. `tenant_members` — `role = 'Admin'`, `updated_at = now()`

All three statements pinned by both `user_id` (subselected from email) and `tenant_id` — no cross-tenant risk.

**Post-deploy verification:**

| User | relationship_role | tu_role | secondary_contact | unicorn_role | user_type | tm_role |
|---|---|---|---|---|---|---|
| Jenelle Watson (7507) | secondary_contact ✅ | parent ✅ | true ✅ | Admin ✅ | Client Parent ✅ | Admin ✅ |
| Dayan Kasturiratna (7512) | secondary_contact ✅ | parent ✅ | true ✅ | Admin ✅ | Client Parent ✅ | Admin ✅ |
| Emily Myatt (7542) | secondary_contact ✅ | parent ✅ | true ✅ | Admin ✅ | Client Parent ✅ | Admin ✅ |

**Christopher Wilson (Think Real Estate)** — confirmed by Angela to remain as `'user'`. Think Real Estate secondary slot already occupied by Antonella Papadimitriou. Portal access via the BUG-022 fix; no manage rights.

---

## KB changes shipped

- `BugOrganisation.md` (workspace root) updated:
  - BUG-005 cluster marked resolved with migration ID
  - BUG-022 cluster marked resolved with follow-on data correction noted
  - BUG-023 cluster marked resolved (pre-existing)
  - Summary table and Phase fix order updated for all three bugs

## Codebase observations

- Migration 1 applied: `20260520234217_1cccaf38-f117-47b5-b1c3-81f3768d1d2b.sql`
- Codebase commit (BUG-022 code fix): `7494bcd1`
- Migration 2 applied: `20260521002410_af1b3706-4c7e-4f0a-bdf3-c70c0cfe20a5.sql`

## Decisions

- BUG-022: `canManagePortalUsers` deliberately left as `isContact` only — regular users get portal access but not manage/invite rights. Correct per intended design.
- BUG-023: No action taken — pre-existing fix in `accept_invitation_v2` is correct and confirmed by live DB state.
- Christopher Wilson: confirmed `user` (not `secondary_contact`) — Think Real Estate secondary slot occupied; portal access via BUG-022 fix is sufficient.
- Secondary contact promotion applied directly as data migration without running the full unicorn-bug-fix skill flow — Angela's verbal confirmation during the session was the authority; DB state was verified pre- and post-migration.

## Open questions parked

- Jenelle, Dayan, Emily now have `canManagePortalUsers = true` — they can invite new portal users. BUG-020 (secondary contact invite permission) is still open pending Angela's confirmation of whether secondary contacts should be able to send new invites at all.
- `trg_sync_primary_contact` (BUG-031) — this trigger fired during the secondary contact migration and behaved correctly. The underlying root cause (boolean vs `relationship_role` inconsistency for non-standard `role` values) remains open and requires a paired conversation with Carl before fixing.

## Tag

audit-2026-05-21-bug-005-022-023-rpc-permissions-portal-access
