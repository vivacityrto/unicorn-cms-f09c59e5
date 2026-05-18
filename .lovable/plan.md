## Phase 4C Migration: `tenant_user_role` enum → `dd_relationship_role` lookup

Create a single Supabase migration file containing the exact SQL you provided, in the order specified. No deviations, no simplifications, no additional changes.

### File contents (in order)

1. **Section 0 — Pre-flight assertions** (3 `DO $$` blocks)
   - Abort if `dd_relationship_role` table already exists
   - Abort if `tenant_users.relationship_role` has unexpected values
   - Abort if `user_invitations.relationship_role` has unexpected values

2. **Section 1 — Create & seed `dd_relationship_role`**
   - Table with `id serial PK`, `value text UNIQUE`, `label`, `sort_order`, `is_active`, `created_at`
   - Seed 4 rows: `primary_contact`, `secondary_contact`, `user`, `academy_user`
   - Enable RLS + authenticated SELECT policy

3. **Section 2 — Migrate `tenant_users.relationship_role`**
   - `ALTER COLUMN ... TYPE text USING ::text`
   - Add FK `fk_tenant_users_relationship_role → dd_relationship_role(value)` (ON UPDATE CASCADE, ON DELETE RESTRICT)

4. **Section 3 — Migrate `user_invitations.relationship_role`**
   - Same conversion + FK pattern

5. **Section 4 — Recreate unique partial indexes**
   - Drop & recreate `uniq_tenant_one_primary_contact` and `uniq_tenant_one_secondary_contact` without enum casts (within same transaction → no enforcement gap)

6. **Section 5 — Recreate `set_relationship_role`** with `p_relationship_role text` and `v_old_role text`, validating against `dd_relationship_role` (full body as supplied)

7. **Section 6 — Recreate `accept_invitation_v2`** with only `v_relationship_role` declared as `text` instead of `public.tenant_user_role` (full body reproduced exactly as supplied; signature unchanged)

8. **Section 7 — Rewrite two RLS policies** (`audit_user_events_select_tenant_admin`, `pdp_cycles: tenant admins view their tenant`) — drop `::tenant_user_role` casts from ARRAY literals; logic otherwise identical

9. **Section 8 — Retain legacy enum** with `COMMENT ON TYPE public.tenant_user_role` noting supersession, rollback retention, and Carl/Dave sign-off requirement before any future DROP

10. **Rollback block** appended as `/* ... */` SQL comment at the end of the file (Steps 1–7 as you supplied)

### Not included in the migration file

- **Section 9 post-flight verification SELECTs** — these are read-only assertions to run *after* the migration, not part of the transaction. I will execute them via `supabase--read_query` once the migration is applied and report the results (row counts, column types, index defs, function signature, enum retention).

### Order of operations on approval

1. Call `supabase--migration` with the single file containing Sections 0–8 + rollback comment.
2. After you approve and the migration runs, execute the 10 post-flight checks and confirm each matches expected output.
3. Audit the codebase for any remaining `Enums["tenant_user_role"]` TS references that will need to be cleared once `src/integrations/supabase/types.ts` regenerates (frontend already treats `relationship_role` as plain strings everywhere except generated types — no app code changes required by this migration).

### Risk notes

- **Transactional safety**: Sections 2–4 all run inside the migration's implicit transaction, so the unique-index drop/recreate window is closed to concurrent writers.
- **FK on `user_invitations`**: existing NULL `relationship_role` rows (26 of 31) remain valid — FK allows NULL.
- **Enum retention**: `public.tenant_user_role` stays in the schema; no dependent objects remain after Sections 2–7, so the COMMENT is the only marker. Safe rollback path preserved.
- **`accept_invitation_v2` body**: reproduced verbatim from your spec — I will not re-derive it from the live DB. If the live function has drifted from what you supplied, the migration will overwrite that drift. Confirm before approval if this is a concern.
- **No frontend / edge-function changes** required by this migration. `src/lib/roles/relationshipRole.ts` and all `relationship_role` string usages remain correct.
