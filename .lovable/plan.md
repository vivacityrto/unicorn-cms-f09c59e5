
# RBAC Overhaul — Phase 1

Canonical Vivacity staff rule (locked):
`unicorn_role IN ('Super Admin','Team Leader','Team Member','Integrator','BGT','CSC','CET') AND is_vivacity_internal = true AND COALESCE(archived,false) = false`.

Three migrations, applied A → B → C in one window. No edge-function or frontend changes in this phase.

---

## Migration A — Seed new internal roles into `dd_unicorn_roles`

1. `ALTER TABLE public.dd_unicorn_roles ADD COLUMN is_internal boolean NOT NULL DEFAULT false;`
2. Backfill: `is_internal = true` for `Super Admin, Team Leader, Team Member`; explicit `false` for `Admin, User, Academy User`.
3. Renumber `sort_order` via two-step offset (+100 then final) to avoid unique collisions:
   - Super Admin = 1, Team Leader = 2 (unchanged)
   - Team Member → 7, Admin → 8, User → 9, Academy User → 10
4. INSERT 4 new rows (`is_active=true, is_internal=true`):

| value | label | sort_order |
|---|---|---|
| Integrator | Vivacity Integrator | 3 |
| BGT | Business Growth Team | 4 |
| CSC | **Client Success Champion** | 5 |
| CET | Client Experience Team | 6 |

Pre-flight (RAISE EXCEPTION on fail):
- `COUNT(*) FROM dd_unicorn_roles` = 6
- `COUNT(*) FROM users WHERE user_type='Vivacity Team' AND is_vivacity_internal=false` = 0
- No existing row with `value IN ('Integrator','BGT','CSC','CET')`

Post-flight:
- `COUNT(*) FROM dd_unicorn_roles` = 10
- `COUNT(*) WHERE is_internal=true` = 7
- `sort_order` values 1..10 each appear exactly once

Lock impact: brief `ACCESS EXCLUSIVE` on a 6-row table (sub-ms); FK `users.unicorn_role → dd_unicorn_roles(value)` unaffected.

---

## Migration B — Permission tables + 65-feature × 6-role seed

Depends on A. Seed body comes from your Message 2. Migration is not finalised until that arrives.

### Objects (in order, all `public`)
1. `CREATE TYPE public.permission_level AS ENUM ('full','limited','owner_only','none');`
2. `permission_features` — `feature_key text PK`, `category text NN`, `label text NN`, `description text`, `is_active bool NN default true`, `sort_order int NN default 0`, timestamps + updated_at trigger.
3. `role_permissions` — `id bigint identity PK`, `role text NN REFERENCES dd_unicorn_roles(value) ON DELETE RESTRICT ON UPDATE CASCADE`, `feature_key text NN REFERENCES permission_features(feature_key) ON DELETE CASCADE ON UPDATE CASCADE`, `level permission_level NN`, `UNIQUE(role, feature_key)`, timestamps + trigger.
4. `user_roles` — `id bigint identity PK`, `user_uuid uuid NN REFERENCES users(user_uuid) ON DELETE CASCADE ON UPDATE CASCADE`, `role text NN REFERENCES dd_unicorn_roles(value) ON DELETE RESTRICT ON UPDATE CASCADE`, `granted_by uuid REFERENCES users(user_uuid) ON UPDATE CASCADE`, `granted_at timestamptz NN default now()`, `expires_at timestamptz NULL`, `UNIQUE(user_uuid, role)`, timestamps + trigger.
5. `permission_change_log` — `id bigint identity PK`, `actor_uuid uuid NN REFERENCES users(user_uuid) ON UPDATE CASCADE`, `entity text NN CHECK (entity IN ('role_permissions','user_roles','permission_features'))`, `entity_id text NN`, `action text NN CHECK (action IN ('insert','update','delete'))`, `before jsonb`, `after jsonb`, `reason text`, `created_at timestamptz NN default now()`. AFTER triggers on the other 3 tables write via a `SECURITY DEFINER` logger.

### GRANTs (same migration, mandatory — public-schema rule)
```sql
GRANT SELECT ON public.permission_features   TO authenticated;
GRANT ALL    ON public.permission_features   TO service_role;
GRANT SELECT ON public.role_permissions      TO authenticated;
GRANT ALL    ON public.role_permissions      TO service_role;
GRANT SELECT ON public.user_roles            TO authenticated;
GRANT ALL    ON public.user_roles            TO service_role;
GRANT SELECT ON public.permission_change_log TO authenticated;
GRANT ALL    ON public.permission_change_log TO service_role;
```
No `anon` grants.

### RLS (enable on all four)
- `permission_features`: SELECT `authenticated` `using (true)`; mutations `is_super_admin_safe(auth.uid())`.
- `role_permissions`: SELECT `is_vivacity_team_safe(auth.uid())`; mutations `is_super_admin_safe(auth.uid())`.
- `user_roles`: SELECT `auth.uid() = user_uuid OR is_vivacity_team_safe(auth.uid())`; mutations `is_super_admin_safe(auth.uid())`.
- `permission_change_log`: SELECT `is_vivacity_team_safe(auth.uid())`; INSERT `is_super_admin_safe(auth.uid())` (trigger writer is SECURITY DEFINER so bypasses); no UPDATE/DELETE policy.

### Seeding (from Message 2)
- `permission_features`: **65 rows**.
- `role_permissions`: **390 rows** = 65 × 6 graded roles (Super Admin, Team Leader, Integrator, BGT, CSC, CET — Team Member excluded).

### Pre/Post-flight
- Pre: `COUNT(*) FROM dd_unicorn_roles` = 10; `to_regclass` NULL for each new table.
- Post: `COUNT(*) permission_features` = **65**; `COUNT(*) role_permissions` = **390**; `COUNT(DISTINCT role)` = 6; `COUNT(DISTINCT feature_key)` = 65; zero FK orphans on LEFT JOINs.

---

## Migration C — RLS helpers and `check_permission`

Depends on B only for `check_permission`. C1–C5 ship safely before B in a fresh environment.

### C1 — `public.is_vivacity_team_safe(uuid)`
`CREATE OR REPLACE`, keep `SET search_path = public`. Body: `unicorn_role IN ('Super Admin','Team Leader','Team Member','Integrator','BGT','CSC','CET') AND is_vivacity_internal = true AND COALESCE(archived,false) = false`.

Pre-flight: `COUNT(*) FROM users WHERE user_type='Vivacity Team' AND is_vivacity_internal=false` = 0.

### C2 — `public.is_super_admin_safe(uuid)`
`CREATE OR REPLACE`, keep `SET search_path = public`. Add `AND is_vivacity_internal = true`. Keep existing `global_role='SuperAdmin'` fallback branch.

Pre-flight: `COUNT(*) FROM users WHERE unicorn_role='Super Admin' AND is_vivacity_internal=false` = 0; on fail, EXCEPTION lists offending `user_uuid`s.

### C3 — `public.is_team_leader_or_above(uuid)`
`LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''`. Roles `('Super Admin','Team Leader')` + internal + not-archived.

### C4 — `public.is_integrator_or_above(uuid)`
Roles `('Super Admin','Team Leader','Integrator')` + internal + not-archived.

### C5 — `public.is_any_team_member(uuid)`
All 7 internal roles + internal + not-archived.

### C6 — `public.check_permission(p_user_id uuid, p_feature_key text, p_min_level text DEFAULT 'full')`
`LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''`. Logic:
1. If `public.is_super_admin_safe(p_user_id)` → return true.
2. Effective roles = `users.unicorn_role` ∪ active `user_roles` rows (`expires_at IS NULL OR expires_at > now()`).
3. Level ordinal: `none=0, owner_only=1, limited=2, full=3`; unknown → EXCEPTION.
4. Return true iff any matching `role_permissions` row has `level` ordinal ≥ requested.
5. Unknown `p_feature_key` → false (no exception; callers may probe).

### Grants for all 6 new + the 2 updated
```sql
REVOKE ALL ON FUNCTION public.<fn>(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.<fn>(...) TO authenticated, service_role;
```

Lock impact: `CREATE OR REPLACE FUNCTION` is metadata-only. Any RLS using the hardened helpers tightens at C1/C2 commit; audit shows 0 mismatched rows so no live user is locked out.

---

## Cross-migration safety
- Each migration is transactional; failed assertions roll back the whole migration.
- New row-count assertions use `<> 10` (roles), `<> 65` (features), `<> 390` (role_permissions). Old `<> 6` assertions in historical migrations are immutable and won't re-fire.
- Rollback SQL for each migration is captured in the migration file comments.

## Out of scope (Phase 2)
- Edge-function / `useRBAC` / `useUserAccess` rewrites onto the new helpers.
- SuperAdmin UI for `user_roles` and `role_permissions`.
