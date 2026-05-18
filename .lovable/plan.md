# Phase 4D-2 + 4D-3: users.unicorn_role enum → text (atomic)

## Goal
Convert `public.users.unicorn_role` from the `public.unicorn_role` enum to `text NOT NULL` with FK to `public.dd_unicorn_roles(value)`, in a single transactional migration that drops, performs the type change, and recreates every dependent object so PostgreSQL allows the `ALTER COLUMN TYPE`.

## Verified pre-conditions (live schema)
- 82 policies in `public` + 5 in `storage` contain `unicorn_role` references (matches spec).
- `user_protected_fields_unchanged_safe` signature confirmed; parameter `p_new_unicorn_role unicorn_role` will become `text`. Body uses `u.unicorn_role` by name (no casts).
- `v_dashboard_labour_efficiency` definition confirmed; only the WHERE clause carries `::unicorn_role` casts inside an ARRAY.
- `dd_unicorn_roles` will be asserted to contain all 6 active values; `users.unicorn_role` will be asserted to have zero orphans.
- `users_update_own` references the protected-fields function by column name only — not touched.
- Legacy `public.unicorn_role` enum is retained with a retention comment; no DROP.

## Strict operation order (single transaction)

1. **Pre-flight assertions** (RAISE EXCEPTION on failure):
   - 0 orphan `users.unicorn_role` vs `dd_unicorn_roles.value`.
   - 6 active rows in `dd_unicorn_roles` matching the canonical set.
2. `CREATE OR REPLACE FUNCTION public.user_protected_fields_unchanged_safe(...)` — same signature except `p_new_unicorn_role text`. Body identical (column compared by name; no enum cast needed).
3. `DROP VIEW IF EXISTS public.v_dashboard_labour_efficiency;`
4. `DROP TRIGGER IF EXISTS trg_set_user_type_from_role ON public.users;`
5. `DROP POLICY` for the 82 public + 5 storage policies (exact names from spec). `users_update_own` left intact.
6. `ALTER TABLE public.users ALTER COLUMN unicorn_role DROP DEFAULT;`
7. `ALTER TABLE public.users ALTER COLUMN unicorn_role TYPE text USING unicorn_role::text;`
8. `ALTER TABLE public.users ALTER COLUMN unicorn_role SET DEFAULT 'User';`
9. `ALTER TABLE public.users ADD CONSTRAINT users_unicorn_role_fk FOREIGN KEY (unicorn_role) REFERENCES public.dd_unicorn_roles(value) ON UPDATE CASCADE ON DELETE RESTRICT;`
10. **Recreate all 87 policies** verbatim with `::unicorn_role` casts stripped. Source: live `pg_policies.qual` / `with_check` already captured from the database. Each `CREATE POLICY` reproduces the exact `EXISTS`/JOIN/`(SELECT auth.uid() AS uid)`/tenant/bucket/archived expressions; only the literal/array casts are removed:
    - `'X'::unicorn_role` → `'X'`
    - `ARRAY['X'::unicorn_role, ...]` → `ARRAY['X', ...]`
    - Special cases handled exactly per spec:
      - `client_timeline_events_vivacity_select` — both array checks stripped.
      - `seat_measurable_entries_owner_insert_own` — nested JOIN subquery preserved; only casts removed.
      - `usersetup_links_write_superadmin` — `global_role = 'SuperAdmin'::text` preserved; only `unicorn_role` cast stripped.
      - 5 storage policies — bare `auth.uid()` form preserved (not the `(SELECT auth.uid() AS uid)` form).
11. `CREATE TRIGGER trg_set_user_type_from_role BEFORE INSERT OR UPDATE OF unicorn_role ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_user_type_from_role();`
12. `CREATE VIEW public.v_dashboard_labour_efficiency WITH (security_invoker = true) AS ...` — exact prior body, WHERE clause now `ARRAY['Super Admin','Team Leader','Team Member']` (text, no casts).
13. `COMMENT ON TYPE public.unicorn_role IS '...';` — retention notice per spec.
14. **Post-flight assertions** (each `RAISE EXCEPTION` on failure):
    1. `information_schema.columns`: `users.unicorn_role` is `text`, `is_nullable='NO'`.
    2. `pg_constraint`: `users_unicorn_role_fk` exists.
    3. 0 orphan values in `users.unicorn_role` vs `dd_unicorn_roles`.
    4. 0 NULLs in `users.unicorn_role`.
    5. `user_protected_fields_unchanged_safe` parameter type for `p_new_unicorn_role` is `text`.
    6. `v_dashboard_labour_efficiency` exists in `pg_views`.
    7. `trg_set_user_type_from_role` exists on `public.users`.
    8. `public.unicorn_role` enum still exists in `pg_type`.
    9. `pg_policies` counts: 82 public + 5 storage with `unicorn_role` references.
    10. 0 policies whose `qual` or `with_check` matches `%::unicorn_role%`.
    11. `users_update_own` policy still exists on `public.users`.
    12. Spot-check policies exist and contain no `::unicorn_role`: `client_timeline_events_vivacity_select`, `seat_measurable_entries_owner_insert_own`, `usersetup_links_write_superadmin`.
    13. All 5 storage policies exist with no `::unicorn_role`.

## Do-not-touch list
- `users_update_own` policy
- Every SQL function except `user_protected_fields_unchanged_safe`
- `archive.backup_users`
- The `public.unicorn_role` enum (retained, commented)
- All other tables/columns/indexes/constraints/triggers

## Rollback
The migration runs as a single transaction. Any failure (pre-flight, type change, FK, policy recreate, post-flight) aborts the entire batch and leaves the schema unchanged. There is no separate rollback script.

## Risk assessment
- **Lock impact**: `AccessExclusiveLock` on `public.users` for the ALTER + FK + policy churn. No table rewrite (text↔enum, both varlena, USING `::text`). Expected sub-second on this row count, but the policy churn dominates. Recommend a brief maintenance window or low-traffic deploy slot.
- **Behaviour change**: Zero. All policy expressions are byte-equivalent post-cast-strip; the column compares text-to-text identically to enum-to-enum on these values.
- **Forward compatibility**: New roles can be added via `dd_unicorn_roles` insert only (no enum ALTER required). FK + `ON UPDATE CASCADE` makes label edits safe.
- **Deferred (Phase 4D-4)**: ~54 other SQL functions still reference `unicorn_role` casts. Out of scope; the retention comment documents this dependency before any future `DROP TYPE`.

## Benefits
- Roles fully migrated to the `dd_*` lookup pattern (project standard).
- RLS policies become readable, editable text comparisons.
- Removes the enum bottleneck for adding/renaming roles.
- Audit-trail clean: single atomic migration with explicit pre/post assertions.