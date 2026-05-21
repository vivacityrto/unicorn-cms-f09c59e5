## Data Correction: Promote 3 users to `secondary_contact`

### Verified current state (live DB)

| Email | Tenant | tenant_users | users | tenant_members |
|---|---|---|---|---|
| accounts@wattotraining.com.au | 7507 | relationship_role=`user`, role=`child`, primary=false, secondary=false, scope=full | unicorn_role=`User`, user_type=`Client Child` | role=`General User`, active |
| dayan@australiancollege.edu.au | 7512 | same shape | same | same |
| emily@petstylistacademy.com.au | 7542 | same shape | same | same |

All three rows exist, all match the targeted tenant_id, all are currently in the broken `user`/`child` state. No drift, no missing rows, no extra memberships at these tenant_ids.

### Migration (exactly as supplied — 3 statements, nothing else)

```sql
-- 1) tenant_users: promote to secondary_contact + parent
-- trg_sync_primary_contact (verified live) will auto-set
-- primary_contact=false, secondary_contact=true.
UPDATE public.tenant_users
SET relationship_role = 'secondary_contact',
    role = 'parent'
WHERE (user_id = (SELECT user_uuid FROM public.users WHERE email = 'accounts@wattotraining.com.au') AND tenant_id = 7507)
   OR (user_id = (SELECT user_uuid FROM public.users WHERE email = 'dayan@australiancollege.edu.au')  AND tenant_id = 7512)
   OR (user_id = (SELECT user_uuid FROM public.users WHERE email = 'emily@petstylistacademy.com.au') AND tenant_id = 7542);

-- 2) users: align legacy unicorn_role + user_type
UPDATE public.users
SET unicorn_role = 'Admin',
    user_type    = 'Client Parent'
WHERE email IN (
  'accounts@wattotraining.com.au',
  'dayan@australiancollege.edu.au',
  'emily@petstylistacademy.com.au'
);

-- 3) tenant_members: align legacy membership role
UPDATE public.tenant_members
SET role       = 'Admin',
    updated_at = now()
WHERE (user_id = (SELECT user_uuid FROM public.users WHERE email = 'accounts@wattotraining.com.au') AND tenant_id = 7507)
   OR (user_id = (SELECT user_uuid FROM public.users WHERE email = 'dayan@australiancollege.edu.au')  AND tenant_id = 7512)
   OR (user_id = (SELECT user_uuid FROM public.users WHERE email = 'emily@petstylistacademy.com.au') AND tenant_id = 7542);
```

### Deep-dive verification

**Trigger interaction (`trg_sync_primary_contact` → `sync_primary_contact_on_role`)** — verified live:
- Branch `relationship_role = 'secondary_contact'` → forces `primary_contact:=false`, `secondary_contact:=true`. Exactly the desired end state. No manual flag setting required, no risk of double-primary.
- No other BEFORE/AFTER triggers on `tenant_users` will demote the row or fight the assignment.

**Uniqueness / collision risks:**
- Promoting to `secondary_contact` does not violate any per-tenant primary-contact uniqueness, because the trigger forces `primary_contact=false`. Even if another row in the same tenant is the primary, no conflict arises.
- No row in any of tenants 7507 / 7512 / 7542 already holds `secondary_contact=true` for the same user (single membership per user/tenant verified above), so no duplicate-key risk.

**Legacy column alignment:** `unicorn_role='Admin'` + `user_type='Client Parent'` matches the documented mapping in `src/lib/roles/relationshipRole.ts` (`unicornRoleFromRelationship('secondary_contact') === 'Admin'`, `userTypeFromRelationship === 'Client Parent'`). `tenant_members.role='Admin'` matches `useAuth` RBAC's `hasTenantAdmin` expectations.

**Client-side effect:** With the prior `ClientTenantContext` fix already deployed, these users already had portal access via the `user`+full path. After this migration:
- `canAccessClientPortal` → true via `isContact` branch (unchanged outcome).
- `canManagePortalUsers` → true (new — intentional promotion).
- Sidebar/Users page management surfaces now appear for them.
- Academy/RLS/audit reads unaffected — RLS keys off membership, not relationship_role.

**Audit trail:** `tenant_members.updated_at = now()` is set explicitly. `tenant_users` and `users` rely on existing `updated_at` triggers (no manual touch needed, per project convention). No `created_at` touched. No audit_events row is emitted by these tables' triggers — this is a SuperAdmin data correction performed via migration, which is itself the audit record (file under `supabase/migrations/`).

**Backward compatibility:**
- Strictly additive privilege widening for 3 named accounts at 3 named tenants. No row outside the WHERE clauses is touched.
- No schema, RLS, function, trigger, index, or policy changes.
- Rollback = a mirror migration restoring `relationship_role='user'`, `role='child'`, `unicorn_role='User'`, `user_type='Client Child'`, `tenant_members.role='General User'`. Reversible.

**Tested against buggy vs clean data:**
- Buggy (current) state: all 3 rows match WHERE clauses → all 3 update.
- Clean state (already secondary_contact / Admin): UPDATEs become no-ops on already-correct columns; trigger still re-asserts contact flags idempotently; safe to re-run.
- Missing user (defensive): subselect returns NULL, WHERE clause yields no match, statement no-ops without error. No accidental cross-tenant writes possible because each clause pins both `user_id` and `tenant_id`.

**Confirmed NOT touched:** schema, RLS policies, triggers, functions, lookup tables, other users, other tenants, other tenant_users rows for the same users (none exist), `created_at`, audit infrastructure.

### Summary
- **Changes:** 3 UPDATE statements in a single migration file. Promotes 3 named users to `secondary_contact` at 3 specific tenants and aligns 2 legacy mirror tables.
- **Benefits:** Restores intended Admin/secondary-contact privileges for Jenelle Watson, Dayan Kasturiratna, Emily Myatt. Aligns `tenant_users`, `users`, and `tenant_members` so all RBAC code paths (new `relationship_role` and legacy `unicorn_role`/`tenant_members.role`) agree.
- **Risk:** Very low. Data-only, 3 rows × 3 tables = 9 row writes, fully pinned by email + tenant_id, idempotent, reversible, no schema or policy impact, no automation disturbed.
