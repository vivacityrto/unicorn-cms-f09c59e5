# Audit: 2026-05-19 — Phase 4D completion (`unicorn_role` 4D-1, 4D-4, 4D-5, 4D-6)

**Trigger:** Lovable production DB change session — completing the `unicorn_role` enum-to-`dd_` migration. Sub-phases 4D-2 and 4D-3 are documented separately in `audit/2026-05-18-enum-phase-4d-2-3.md`.
**Author:** Khian (Brian)
**Scope:** 4D-1 (correct `dd_unicorn_roles` seed values); 4D-4 (remove `::unicorn_role` casts from 3 SQL functions); 4D-5 (widen `useAuth.tsx` `UserProfile.unicorn_role` type + TypeScript regeneration); 4D-6 (archive legacy `public.unicorn_role` enum to `archive` schema). Out of scope: Phase 4 cleanup migration (blocked by `archive.backup_users` — requires Carl decision).
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### 4D-1 — `dd_unicorn_roles` seed correction
Migration `20260518053356_be680cf2-f568-4a23-a0e7-c887b190e7ac.sql`.

`dd_unicorn_roles` was created by Lovable on 3 Mar 2026 but had never been wired up. Its values used snake_case (`super_admin`, `admin`, `user`) instead of the byte-identical enum labels (`Super Admin`, `Admin`, `User`, `Team Leader`, `Team Member`, `Academy User`). Option A locked: fix values in-place via UPDATE rather than DROP/RECREATE — preserving existing `id` values and avoiding FK side effects.

All 6 rows corrected to match enum labels exactly. All 4 post-deploy checks passed:
- `dd_unicorn_roles` has 6 rows.
- All 6 values match `pg_enum` labels.
- No orphan `users.unicorn_role` values vs `dd_unicorn_roles`.
- RLS enabled on `dd_unicorn_roles`.

### 4D-4 — SQL function cast removal
Migration `20260518224543_a6d95909-6d12-4581-b9ed-ea72af2a6fec.sql`.

3 functions contained `::unicorn_role` or `::public.unicorn_role` casts after 4D-2+4D-3. Each function recreated with text parameter and body casts removed:

| Function | Change |
|---|---|
| `handle_new_user` | 2 `::unicorn_role` casts removed from DECLARE + IF blocks |
| `admin_set_role_type` | 1 `::unicorn_role` cast removed from assignment |
| `accept_invitation_v2` | DECLARE var type changed `unicorn_role` → `text`; 4 casts removed |

Post-flight: 0 `::unicorn_role` / `::public.unicorn_role` casts remaining in any function in `information_schema.routines`. All 5 post-deploy checks passed.

### 4D-5 — TypeScript widening + regeneration

`src/hooks/useAuth.tsx` `UserProfile.unicorn_role` type widened to include `'Academy User'` (was previously a union that excluded it, causing a type gap surfaced by the migration). `InviteUserDialog.tsx` left unchanged — local UI selection type, not a DB reflection.

TypeScript types regenerated. `unicorn_role` removed from `Database["public"]["Enums"]` in `types.ts` — this was the planned result since the enum is now backed by `dd_unicorn_roles`.

### 4D-6 — Archive legacy `public.unicorn_role`
Migration `20260518231726_fbea2577-2554-4776-a6aa-86dba644dda6.sql`.

`ALTER TYPE public.unicorn_role SET SCHEMA archive` — moved the legacy enum to the `archive` schema. `archive.backup_users.unicorn_role` column continues working because PostgreSQL OID references survive schema moves; the type is still accessible under `archive.unicorn_role`. Retention `COMMENT ON TYPE` added naming permanent DROP conditions: Carl + Dave sign-off required after documented stable period.

Rollback: `ALTER TYPE archive.unicorn_role SET SCHEMA public`.

All 5 post-deploy checks passed:
- `unicorn_role` absent from `public` schema.
- `unicorn_role` present in `archive` schema.
- `archive.backup_users.unicorn_role` still queryable.
- `users.unicorn_role` still `text NOT NULL` with FK.
- `dd_unicorn_roles` row count = 6.

---

## KB changes shipped

- `EnumToDdInventory.md` updated at workspace root (local only — not in a repo):
  - `unicorn_role` Enum Inventory row updated to `implemented — archived 19 May 2026`.
  - Phase 4D row in Phase Target Summary expanded with 4D-1, 4D-4, 4D-5, 4D-6 detail.
  - Phase 4 Suggested Migration Phases row updated.

## Codebase observations

- Codebase at time of 4D-4: local HEAD `eed14de1` (unicorn-cms-f09c59e5).
- Migration `20260518224543_a6d95909-6d12-4581-b9ed-ea72af2a6fec.sql` applied and verified.
- Migration `20260518231726_fbea2577-2554-4776-a6aa-86dba644dda6.sql` applied and verified.
- 4D-5 TypeScript changes landed in same Lovable session as 4D-4/4D-6.

## Decisions

- `archive.backup_users.unicorn_role` continues to work via OID after schema move — confirmed. No data loss.
- Phase 4 cleanup migration (retiring remaining legacy enums `staff_team_type`, `user_type_enum`, `tenant_user_role` from `public` schema) remains blocked until Carl decides what to do with `archive.backup_users`. Not blocking Phase 5.
- `unicorn_role` is now the heaviest-coupling migration completed in the entire enum-to-`dd_` stream: 56 SQL functions + 87 RLS policies + 1 view + 3 triggers all updated across 4 sub-phases.

## Open questions parked

- Phase 4 cleanup migration: Carl to decide on `archive.backup_users` (options: convert to text, drop, or leave `staff_team_type` / `user_type_enum` / `tenant_user_role` in `public` indefinitely).
- Permanent DROP of `archive.unicorn_role`, `archive.backup_users.unicorn_role`: requires Carl + Dave sign-off after documented stable period in production.

## Tag

audit-2026-05-19-enum-phase-4d-completion
