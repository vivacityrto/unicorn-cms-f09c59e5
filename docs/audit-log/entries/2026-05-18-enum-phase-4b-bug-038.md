# Audit: 2026-05-18 — Phase 4B (`user_type_enum`) and BUG-038 (`users.full_name` backfill)

**Trigger:** Lovable production DB change session — Phase 4B of the identity/role enum family, plus BUG-038 (`users.full_name` empty for 99.4% of users) which was logged during Phase 4A on 15 May 2026 and approved for fix in this session.
**Author:** Khian (Brian)
**Scope:** Phase 4B (`user_type_enum` → `dd_user_type`), BUG-038 fix (backfill + sync trigger). Out of scope: Phase 4C (`tenant_user_role`), Phase 4D (`unicorn_role`), Phase 4 cleanup migration (blocked by `archive.backup_users` — decision deferred to Carl).
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### BUG-038 — `users.full_name` empty for 99.4% of users (resolved)

**Root cause:** `users.full_name` is a generated/stored column that was never populated. 499 of 502 users had NULL `full_name`. The 3 non-NULL rows were manual overrides.

**DB changes delivered (migration `20260517224733_61c0009d-aac4-4abf-b00a-0e6ae2593226.sql`):**

- Backfill `UPDATE public.users SET full_name = trim(first_name || ' ' || last_name)` applied to all 499 NULL rows.
- BEFORE INSERT/UPDATE sync trigger `trg_sync_user_full_name` created on `public.users` to keep `full_name` current on any future write.
- 3 manual overrides preserved (full_name already set, excluded from backfill).

**Post-deploy verification (all passed):**
- `SELECT count(*) FROM public.users WHERE full_name IS NULL` → 0
- `SELECT count(*) FROM public.users WHERE full_name = trim(first_name || ' ' || last_name)` → 499 (3 manual overrides excluded by design)
- Trigger confirmed present via `pg_trigger` join (NOT `information_schema.triggers` — see Discovery Note below)

**Discovery note — `information_schema.triggers` silently returns empty in Supabase MCP context:**
During BUG-038 diagnosis, a trigger check via `information_schema.triggers` returned zero rows for `public.users` even though 6+ triggers existed. Root cause: `information_schema.triggers` is filtered by the querying role's privileges; in Supabase MCP context it silently omits rows the role cannot fully inspect. All future trigger checks in this project must use `pg_trigger` joined to `pg_class` and `pg_namespace`. Query:

```sql
SELECT t.tgname, t.tgenabled
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = '<table>' AND n.nspname = 'public'
AND NOT t.tgisinternal;
```

This finding has been saved to project memory (`feedback_pg_trigger_supabase.md`).

---

### Phase 4B — `user_type_enum` → `dd_user_type` (complete)

Full `enumtodd` skill run completed across all 8 phases. Carl + Dave sign-off confirmed before Phase 7. BUG-038 was resolved in the same session before Phase 4B began.

**Phase 4B organisation:** 4 SQL functions + 4 RLS policies referencing the enum (moderate coupling). All 502 `users.user_type` rows in use — 3 distinct values in production (`Client Parent` 417, `Client Child` 62, `Vivacity Team` 23); `Vivacity`, `Client`, `Member` defined but empty. First Phase 4 sub-phase to require RLS policy rewrites and function surgical edits.

**DB changes delivered (migration `20260517235803_eff45910-3f89-4564-ae61-11aabbd7257c.sql`):**

- `public.dd_user_type` created using the strict `dd_accounting_system` standard shape (no `updated_at`).
- Seeded with all 6 values byte-identical to enum labels: `Vivacity`/10, `Vivacity Team`/20, `Client`/30, `Client Parent`/40, `Client Child`/50, `Member`/60. All `is_active = true`.
- RLS enabled with `TO public USING (true)` SELECT policy; no write policy (service role only). Matches Phase 4A precedent.
- `public.users.user_type` changed from `public.user_type_enum` to `text NOT NULL` via `USING user_type::text`. Nullability preserved (NOT NULL). No default (column had none).
- FK `users_user_type_fkey` added referencing `dd_user_type(value)` with `ON UPDATE CASCADE ON DELETE RESTRICT`.
- Index `idx_users_user_type` created.
- **Ordering fix (second Lovable iteration):** The 4 RLS policies were dropped BEFORE the `ALTER COLUMN TYPE` and recreated after. PostgreSQL refuses to alter a column type while any dependent policy holds a cast against it — the first generated SQL failed at this step; the second correctly sequenced drop → alter → recreate.
- 4 RLS policies rewritten (cast removal only, logic byte-identical):
  - `tasks_tenants_tenant_select` — `ARRAY['Client Parent'::user_type_enum, 'Client Child'::user_type_enum]` → `ARRAY['Client Parent', 'Client Child']`
  - `tasks_tenants_tenant_update` — same
  - `eos_agenda_template_versions_admin_insert` — `ARRAY['Vivacity'::user_type_enum, 'Client'::user_type_enum, 'Vivacity Team'::user_type_enum]` → plain text array
  - `eos_agenda_template_versions_admin_update` — same
- 4 SQL functions updated surgically (no signature, SECURITY, or search_path changes):
  - `accept_invitation_v2` — `DECLARE v_u_user_type public.user_type_enum` → `text`
  - `set_relationship_role` — same declaration change
  - `handle_new_user` — `::user_type_enum` cast removed from `COALESCE` in INSERT
  - `admin_set_role_type` — `user_type = v_user_type::public.user_type_enum` → `user_type = v_user_type`
- `COMMENT ON TYPE public.user_type_enum` retention notice added — explicitly names `archive.backup_users.user_type` as the blocking dependency. Enum NOT moved to `archive` schema (same pattern as Phase 4A — unlike Phase 3E which used `ALTER TYPE ... SET SCHEMA archive`).
- Pre-flight `DO $$` block asserted all 6 type distributions including zeros (`Vivacity`=0, `Client`=0, `Member`=0). Post-flight `DO $$` block asserted column shape, FK definition, all 4 policies present with no `user_type_enum` in expressions, all 4 functions with no `user_type_enum` in source, legacy enum still present.

**Discovery snapshot notable findings:**

- `update-user-role/index.ts` edge function was **missed in Phase 1 and Phase 4 blast radius checks**. Found during Lovable's Prompt A audit. Uses plain string literal comparisons and direct string writes to `user_type` throughout (lines 11, 54, 76, 84, 91, 109, 119, 121, 123) — no enum casts anywhere. Migration safe; function added to do-not-touch list in Prompt B before SQL was generated. Pattern matches Phase 4A where `update-user-role` was also missed in the original blast radius for `staff_team`.
- `trg_set_user_type_from_role`: BEFORE INSERT/UPDATE trigger on `public.users` that auto-derives `user_type` from `unicorn_role` using bare string assignments (`v_user_type := 'Client Parent'`). No enum casts. Continues to work unchanged against the text column.
- `archive.backup_users` has `user_type` typed as `public.user_type_enum` — same pattern as `staff_team_type` in Phase 4A. This is the sole remaining dependency preventing `DROP TYPE public.user_type_enum`. Decision on `archive.backup_users` deferred to Carl (see Open Decision in `EnumToDdInventory.md`). Not blocking Phase 4C or 4D.
- `archive.backup_users` investigation: table was auto-created 27 Jan 2026 by the tenant ID sync migration as a one-time safety snapshot. A 1 Feb 2026 migration then altered its `staff_team` column, tying it to the live enum type. All 441 rows are confirmed present in `public.users` by email (5 UUID mismatches are known auth re-links). No consumers anywhere. Approved for eventual drop pending Carl confirmation — not actioned in this session.

**RLS policy rewrite strategy:**
Exact `DROP POLICY / CREATE POLICY` SQL was pre-written from live `pg_policies` output and passed verbatim in Prompt C to prevent Lovable from inferring policy bodies. All 4 policies confirmed correct post-deploy with `::text` casts in place of `::user_type_enum`.

**Codebase changes (migration commit only):**

- TypeScript types regenerated by Lovable. `users.user_type` row-type flips from `Enums['user_type_enum']` to `string`. Legacy `Enums.user_type_enum` union remains present in `types.ts` (retention pattern — will disappear at Phase 4 cleanup migration).
- Migration file: `supabase/migrations/20260517235803_eff45910-3f89-4564-ae61-11aabbd7257c.sql`

**Post-deploy verification (all 8 checks passed):**

| Check | Result |
|---|---|
| `dd_user_type` rows | 6 |
| NULL `user_type` rows in `public.users` | 0 |
| Distribution unchanged | Client Parent=417, Client Child=62, Vivacity Team=23 |
| `users.user_type` column type | `text NOT NULL` |
| FK definition | `REFERENCES dd_user_type(value) ON UPDATE CASCADE ON DELETE RESTRICT` |
| 4 RLS policies | All present, no `user_type_enum` references |
| 4 functions | All OK, no `user_type_enum` references |
| Legacy enum retained | `user_type_enum` still in `pg_type` |

**KB changes:** `EnumToDdInventory.md` updated — `user_type_enum` row marked `implemented — 18 May 2026`, Phase 4B row in Phase Target Summary updated with full implementation notes, Phase 4 Suggested Migration Phases row updated to reflect 4A and 4B both done.
