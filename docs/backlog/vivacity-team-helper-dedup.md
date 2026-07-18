# Backlog: Deduplicate Vivacity team helper functions

**Status:** Backlog (not urgent)  
**GitHub:** https://github.com/vivacityrto/unicorn-cms-f09c59e5/issues/34  
**Priority:** Low — tech debt / maintainability  
**Risk if deferred:** Low. As of migration `20260609072651_9e6ff894-4276-4d2a-a520-31bf78732eee`, the stale variants already **delegate** to `is_vivacity_team_safe`. Behaviour is unified; the debt is naming sprawl, extra `SECURITY DEFINER` surfaces, and harder audits.  
**Do not** attempt as a single migration.

## Problem

Nine (plus a few adjacent) SQL helpers encode “is this user Vivacity staff?” under different names. Policies, RPCs, and grants still call the variants, which makes RLS reviews noisy and increases the chance a future migration reintroduces divergent logic.

### Inventory (the nine)

| Function | Role today (post-alias migration) | Notes |
|---|---|---|
| `is_vivacity_team_safe(uuid)` | **Canonical** | Checks `users.is_vivacity_internal`, not archived/disabled |
| `is_any_team_member(uuid)` | Alias → canonical | |
| `is_vivacity_staff(uuid)` | Alias → canonical | Still referenced widely in older policies/RPCs |
| `is_vivacity_member(uuid)` | Alias → canonical | |
| `is_vivacity_team_rls(uuid)` | Alias → canonical | |
| `is_vivacity_team_user(uuid)` | Alias → canonical | Heavy use in Feb 2026 migrations |
| `is_vivacity_team_v2(uuid)` | Alias → canonical | |
| `is_vivacity()` | Alias → `is_vivacity_team_safe(auth.uid())` | No-arg |
| `is_vivacity_team()` / `is_vivacity_team(uuid)` | Alias → canonical | Overloads |

**Adjacent (evaluate in the same effort, but confirm they are true duplicates first):**

- `is_staff()` — aliased to canonical in the same migration
- `can_access_vivacity_meetings(uuid)` — aliased to canonical
- `is_vivacity_user()` — older no-arg helper; confirm body vs canonical before folding
- `is_vivacity_internal_safe(uuid)` — **likely a different check** (internal flag semantics); do **not** collapse without a body diff

## Recommended approach (future PR series)

### 1. Diff live SQL bodies

On the hosted DB (or via latest migration definitions), dump `pg_get_functiondef` for every name above and diff against `is_vivacity_team_safe`.

Goal: confirm which are true duplicates / thin aliases vs. which encode a genuinely different check (especially `is_vivacity_internal_safe` and any function redefined after `20260609072651`).

### 2. Keep one canonical implementation

Prefer **`public.is_vivacity_team_safe(p_user_id uuid)`** — it is the most complete/current definition used by recent policy samples:

```sql
SELECT EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.user_uuid = p_user_id
    AND u.is_vivacity_internal = true
    AND COALESCE(u.archived, false) = false
    AND COALESCE(u.disabled, false) = false
);
```

Document this as the only allowed staff gate for new RLS/RPC work immediately (even before the cleanup PR).

### 3. Repoint call sites via staged migrations

For each table/policy/RPC that still calls a variant:

1. Capture current persona access with a `BEGIN … ROLLBACK` validation script (staff / client / anon / service_role as applicable).
2. Rewrite the policy or function body to call `is_vivacity_team_safe(...)`.
3. Re-run the same validation script; assert identical allow/deny outcomes.
4. Ship in **small batches** (e.g. by domain: EOS, onboarding storage, admin RPCs) — not one mega-migration.

Also regenerate or trim `src/integrations/supabase/types.ts` RPC entries once variants are gone.

### 4. Drop unused variants

Only after `pg_depend` / policy `qual` / `with_check` / function source searches show **zero** references:

```sql
DROP FUNCTION IF EXISTS public.is_vivacity_team_user(uuid);
-- …remaining aliases…
```

Keep a short deprecation window where aliases remain as one-line wrappers if any external/script callers are unknown; then drop in a final migration.

## Out of scope / non-goals

- Changing who counts as Vivacity staff (that is a product/RBAC decision).
- Replacing staff gates with fine-grained `check_permission(...)` in the same PR (related but separate; some call sites already moved that way).
- Frontend auth sidebar gates (`is_team` / `unicorn_role`) — different layer; see archived `.lovable` backlog items if still open.

## Acceptance criteria for the cleanup series

- [ ] Body diff document attached to the PR (or linked gist) for all nine (+ adjacent) functions
- [ ] New code / new migrations only call `is_vivacity_team_safe`
- [ ] Each batch migration includes `BEGIN…ROLLBACK` persona checks showing unchanged access
- [ ] Final migration drops unused variants; types regenerated
- [ ] No regression in staff vs client RLS smoke paths for touched tables

## References

- Alias consolidation: `supabase/migrations/20260609072651_9e6ff894-4276-4d2a-a520-31bf78732eee.sql`
- Harden canonical: `supabase/migrations/20260609052737_9cd9ed26-f55d-4fab-a3a4-272cbe1a58fc.sql`
- Generated RPC surface: `src/integrations/supabase/types.ts` (`is_vivacity_team_*` entries)
