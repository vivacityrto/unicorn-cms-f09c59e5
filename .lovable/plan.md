## Recover two untracked migrations into git

Two migrations were applied to live on 11 May 2026 but never committed. Recreate them as idempotent `.sql` files so the repo matches live. Verified against live DB — all objects already exist exactly as proposed.

### Verification summary

- **`users_update_own` policy** on `public.users` — live `WITH CHECK` matches the prompt exactly:
  `(user_uuid = auth.uid()) AND user_protected_fields_unchanged_safe(auth.uid(), unicorn_role, is_vivacity_internal, global_role, superadmin_level, tenant_id)`; `USING` is `(user_uuid = auth.uid())`; command is UPDATE.
- **`is_vivacity_team_safe`** function on live matches the prompt body byte-for-byte (SECURITY DEFINER, STABLE, `SET search_path = public`, `SET row_security = off`, same SELECT EXISTS body).
- **`audit_user_events`** table exists, is empty (0 rows), RLS enabled, both policies present. Live policies use bare `auth.uid()` — recreating with `(SELECT auth.uid())` form is a perf cleanup with identical semantics.
- **No application code** references `audit_user_events` (rg confirms zero hits outside `supabase/migrations`). Write path is intentionally absent.
- **`is_vivacity_team_safe` consumers**: `CREATE OR REPLACE` with identical signature/return type/body is safe for all dependent RLS policies.

### Migration 1 — `20260511004501_fix_users_update_own_policy_recursion.sql`

```sql
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (user_uuid = auth.uid())
  WITH CHECK (
    (user_uuid = auth.uid())
    AND user_protected_fields_unchanged_safe(
      auth.uid(),
      unicorn_role,
      is_vivacity_internal,
      global_role,
      superadmin_level,
      tenant_id
    )
  );
```

### Migration 2 — `20260511004744_add_audit_user_events_and_harden_is_vivacity_team_safe.sql`

```sql
-- Table
CREATE TABLE IF NOT EXISTS public.audit_user_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_uuid  uuid,
  target_user_uuid uuid NOT NULL,
  action           text NOT NULL,
  reason           text,
  details          jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_user_events ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS audit_user_events_actor_idx
  ON public.audit_user_events (actor_user_uuid, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_user_events_target_idx
  ON public.audit_user_events (target_user_uuid, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_user_events_created_idx
  ON public.audit_user_events (created_at DESC);

-- RLS policies (subquery form for per-statement auth.uid())
DROP POLICY IF EXISTS "audit_user_events_select_own" ON public.audit_user_events;
CREATE POLICY "audit_user_events_select_own"
  ON public.audit_user_events FOR SELECT TO authenticated
  USING (
    actor_user_uuid    = (SELECT auth.uid())
    OR target_user_uuid = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "audit_user_events_select_superadmin" ON public.audit_user_events;
CREATE POLICY "audit_user_events_select_superadmin"
  ON public.audit_user_events FOR SELECT TO authenticated
  USING (is_super_admin_safe((SELECT auth.uid())));

-- Hardened is_vivacity_team_safe (row_security = off prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.is_vivacity_team_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = p_user_id
      AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  );
$$;
```

### Idempotency

- `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` + `CREATE POLICY`, `CREATE OR REPLACE FUNCTION` — all safe to re-run.
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is a no-op when already enabled.

### Behaviour change

None. Migration 1 recreates the live policy as-is. Migration 2 recreates live objects; the only delta is `(SELECT auth.uid())` subquery form in policies — semantically identical, marginally faster at scale.

### Risk assessment

- **Migration 1 — Low.** Single `DROP/CREATE POLICY` on `public.users`. Brief lock during DDL. Identical to current live state, so no auth/RLS regression.
- **Migration 2 — Low.** Table/indexes already exist (no-ops). Function `CREATE OR REPLACE` keeps signature, so dependent RLS policies across the project continue to resolve. Policy recreation is local to a zero-row table with no writers.
- **Rollback**: not required — re-applying produces the live state. If ever needed, restore the earlier policy definitions from git history.

### Benefits

- Repo state matches live; future `supabase db diff`/branch resets won't drift or "re-apply" these as new changes.
- Audit trail of how the recursion fix was achieved is preserved in git.
- Subquery `auth.uid()` form is a minor perf improvement for any future inserts/queries on `audit_user_events`.
