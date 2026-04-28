
# Implementation plan — Fix staff infinite-spinner (FK CASCADE + relink hardening)

Decisions locked in:
- **Option A**: cascade all 108 FKs referencing `users(user_uuid)` on UPDATE; add `user_uuid_history` as safety net.
- **Full sweep**: backfill every `public.users` row whose `user_uuid` has no matching `auth.users.id`.
- **Leave `handle_new_user`** in place (unbound dead function); cleanup deferred.
- **VALIDATE off-peak AET** (deploy window: 22:00–04:00 AEST).

No application/UI code changes. All work is database migrations + one edge function for the sweep.

---

## Step 1 — Migration A: `user_uuid_history` table

New table to record every relink event for forensic / audit-trail recovery.

```sql
CREATE TABLE public.user_uuid_history (
  id              bigserial PRIMARY KEY,
  old_uuid        uuid        NOT NULL,
  new_uuid        uuid        NOT NULL,
  email           text,
  reason          text        NOT NULL,                   -- 'auth_relink' | 'manual_backfill' | 'merge'
  changed_by      uuid,                                   -- auth.uid() of operator, null for trigger-driven
  changed_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_uuid_history_old ON public.user_uuid_history (old_uuid);
CREATE INDEX idx_user_uuid_history_new ON public.user_uuid_history (new_uuid);
CREATE INDEX idx_user_uuid_history_email ON public.user_uuid_history (LOWER(email));

ALTER TABLE public.user_uuid_history ENABLE ROW LEVEL SECURITY;

-- SuperAdmin only
CREATE POLICY uuh_select_superadmin ON public.user_uuid_history
  FOR SELECT TO authenticated
  USING (is_super_admin_safe(auth.uid()));
CREATE POLICY uuh_insert_service ON public.user_uuid_history
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin_safe(auth.uid()));
```

No FK from `user_uuid_history` to `users` — this is intentionally decoupled so it survives any future user deletion.

---

## Step 2 — Migration B: convert all 108 FKs to `ON UPDATE CASCADE`

Generated programmatically from `pg_constraint`. The migration body is a `DO $$ … $$` block that loops every FK whose `confrelid = 'public.users'::regclass` and `confkey` matches the `user_uuid` column, and for each:

1. Captures the original `confdeltype` (delete rule).
2. `ALTER TABLE … DROP CONSTRAINT <name>;`
3. `ALTER TABLE … ADD CONSTRAINT <name> FOREIGN KEY (<col>) REFERENCES public.users(user_uuid) ON UPDATE CASCADE ON DELETE <preserved> NOT VALID;`

Delete rule mapping preserved verbatim:
- `a` → NO ACTION (56 FKs)
- `c` → CASCADE (25 FKs)
- `n` → SET NULL (19 FKs)
- `r` → RESTRICT (8 FKs)

The DROP+ADD is wrapped per-constraint in its own statement so a single failure surfaces the constraint name in the error log.

**`VALIDATE CONSTRAINT` is NOT run in this migration.** It runs in Step 4 during the off-peak window.

A safety check at the end of the DO block asserts:
```sql
SELECT count(*) FROM pg_constraint
WHERE contype='f' AND confrelid='public.users'::regclass
  AND confupdtype <> 'c';   -- must be 0
```
If non-zero, RAISE EXCEPTION and the migration rolls back.

A second safety check asserts that the per-constraint `confdeltype` distribution post-migration matches the pre-migration distribution captured at the start of the DO block (56/25/19/8). Mismatch → RAISE EXCEPTION.

---

## Step 3 — Migration C: rewrite `link_auth_user_to_profile()`

Three bugs to fix in the live trigger:
1. The `(user_uuid IS NULL OR user_uuid = NEW.id)` clause prevents relink in the very case we need (existing OLD uuid).
2. No collision handling when both an old-email row and a new-uuid row exist.
3. Silent rollback on any error → `Database error saving new user`.

New body:

```sql
CREATE OR REPLACE FUNCTION public.link_auth_user_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_uuid uuid;
  v_collision_uuid uuid;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find any existing public.users row by email
  SELECT user_uuid INTO v_existing_uuid
  FROM public.users
  WHERE LOWER(email) = LOWER(NEW.email)
  LIMIT 1;

  -- No-op if already aligned or no row to relink
  IF v_existing_uuid IS NULL OR v_existing_uuid = NEW.id THEN
    RETURN NEW;
  END IF;

  -- Detect collision: another row already at NEW.id
  SELECT user_uuid INTO v_collision_uuid
  FROM public.users
  WHERE user_uuid = NEW.id
  LIMIT 1;

  IF v_collision_uuid IS NOT NULL THEN
    -- Log and bail; do NOT raise — let auth insert succeed
    INSERT INTO public.staff_provisioning_runs (
      email, status, error_message, created_at
    ) VALUES (
      NEW.email, 'collision',
      format('relink blocked: row %s already exists at new auth uuid %s while old row %s exists for same email',
             v_collision_uuid, NEW.id, v_existing_uuid),
      now()
    );
    RETURN NEW;
  END IF;

  -- Perform the relink (CASCADE handles all child tables)
  BEGIN
    UPDATE public.users
       SET user_uuid = NEW.id,
           updated_at = now()
     WHERE LOWER(email) = LOWER(NEW.email);

    INSERT INTO public.user_uuid_history (old_uuid, new_uuid, email, reason)
    VALUES (v_existing_uuid, NEW.id, NEW.email, 'auth_relink');
  EXCEPTION WHEN OTHERS THEN
    -- Never block the auth insert. Log and continue.
    INSERT INTO public.staff_provisioning_runs (
      email, status, error_message, created_at
    ) VALUES (
      NEW.email, 'relink_failed',
      format('SQLSTATE=%s MESSAGE=%s', SQLSTATE, SQLERRM),
      now()
    );
  END;

  RETURN NEW;
END;
$$;
```

Key behaviours:
- Auth insert never rolls back. Worst case the user signs in with mismatched UUID and is logged for SuperAdmin to repair via the sweep tool.
- Every successful relink writes a history row.
- Collisions and exceptions are captured, not silently swallowed.

Pre-flight check: confirm `staff_provisioning_runs` already has columns `email`, `status`, `error_message`, `created_at`. If not, the migration adds them (additive, nullable).

---

## Step 4 — Migration D: VALIDATE all CASCADE constraints (off-peak deploy)

Single migration scheduled for 22:00–04:00 AEST. Loops every `<name>` from Step 2 and runs:

```sql
ALTER TABLE <child_table> VALIDATE CONSTRAINT <name>;
```

Each statement takes `SHARE UPDATE EXCLUSIVE` (online — readers and writers proceed). For largest tables (`audit_log`, `notification_outbox`, `eos_todos`, `meetings`, `email_messages`, `ai_interaction_logs`, `consult_entries`, `ops_time_logs`) the scan can take seconds to a minute. Acceptable in the off-peak window.

If a VALIDATE fails (would only happen if pre-existing data has an orphan FK reference, which the NOT VALID phase already tolerated), the migration logs the offending table+constraint and continues with the rest. A follow-up cleanup migration will re-attempt after orphan rows are reconciled.

---

## Step 5 — Edge function: `repair-staff-uuids` (full sweep)

New SuperAdmin-only edge function at `supabase/functions/repair-staff-uuids/index.ts`. Does **not** modify the schema; uses the now-cascading FKs to safely relink users.

Authorization: extract token, `verifyAuth`, `checkSuperAdmin`. 403 otherwise.

Algorithm:
1. List all `auth.users` via `supabase.auth.admin.listUsers()` (paginated). Build a `Map<lowercase_email, auth.id>`.
2. Select all `public.users` rows: `id, user_uuid, email, unicorn_role, disabled, archived`.
3. For each `public.users` row:
   - `targetAuthId = authByEmail.get(row.email.toLowerCase())`
   - If `targetAuthId` exists and `targetAuthId !== row.user_uuid` → **relink candidate**.
   - If `targetAuthId` is undefined → **orphan in public.users** (no auth account). Record but don't touch (this is the skip_email-only state — expected and harmless until they auth).
   - If `targetAuthId === row.user_uuid` → already aligned, skip.
4. For each relink candidate:
   - Pre-check collision: any other `public.users` row already at `targetAuthId`? If yes, log to response payload as `collision`, skip.
   - Pre-check history: write `user_uuid_history` row with `reason='manual_backfill'`, `changed_by=callerUser.id`.
   - `UPDATE public.users SET user_uuid = $targetAuthId, updated_at = now() WHERE id = $row.id` — CASCADE propagates to all 108 child FKs in a single transaction per user.
   - Capture rowsAffected; on exception, capture SQLSTATE and continue.
5. Return JSON summary:
   ```json
   {
     "ok": true,
     "scanned": 247,
     "relinked": 6,
     "already_aligned": 235,
     "orphan_no_auth": 5,
     "collisions": 1,
     "errors": [],
     "details": [ { "email": "...", "old_uuid": "...", "new_uuid": "...", "outcome": "relinked" }, ... ]
   }
   ```
6. Audit: insert one row to `audit_log` per relink (`action='manual_uuid_relink'`, `editor_uuid=callerUser.id`, `reason='full sweep via repair-staff-uuids'`).

`?dry_run=true` query param: runs steps 1–4 read-only and returns the same payload without performing UPDATE / history / audit writes. Use this first.

---

## Step 6 — Verification & smoke tests

Before Step 4 (VALIDATE) is deployed:

1. Run `repair-staff-uuids?dry_run=true` from a SuperAdmin session. Inspect the returned details.
2. In a non-prod project: trigger an auth re-provision for a test staff account, then sign in. Confirm:
   - `users.user_uuid` updates to the new `auth.uid()`.
   - All 108 child FK columns cascade.
   - `user_uuid_history` row is written.
   - `useAuth` resolves the profile and Dashboard renders (no spinner).
3. Trigger a deliberate collision (insert a stub `users` row at a fresh UUID, then provision auth with the same email). Confirm:
   - Auth insert succeeds.
   - `staff_provisioning_runs` records a `collision` row.
   - User signs in but `useAuth` gets the stub row (acceptable — operator must reconcile manually).
4. Confirm RLS still permits a Super Admin to read `audit_log`, `eos_todos`, etc. for the relinked user.
5. Run `supabase--linter` to confirm no new warnings.
6. Confirm `pg_constraint` shows zero `user_uuid` FKs with `confupdtype <> 'c'`.

After Step 4:

7. Confirm zero rows in `pg_constraint` where `convalidated = false` for `user_uuid`-referencing FKs.
8. Run `repair-staff-uuids` (live, not dry) once. Confirm summary matches the dry-run from step 1.

---

## Step 7 — Memory update

After successful production deploy, write `mem://auth/user-uuid-relink-architecture`:

> All 108 FKs to `users(user_uuid)` are `ON UPDATE CASCADE` (`ON DELETE` rules preserved). Auth re-provision is handled by `link_auth_user_to_profile()` on `auth.users` AFTER INSERT — never raises; logs collisions to `staff_provisioning_runs`; writes `user_uuid_history` on every successful relink. SuperAdmin sweep tool: `repair-staff-uuids` edge function (supports `?dry_run=true`). The dead `handle_new_user()` function exists but is unbound — do not modify until a planned hygiene pass.

Add to Core: `Auth re-provision: user_uuid changes cascade to 108 child FKs. Relink trigger: link_auth_user_to_profile (never handle_new_user).`

---

## Migration ordering & deploy schedule

| # | Migration / artefact | When | Lock impact |
|---|---|---|---|
| A | `user_uuid_history` table + RLS | Anytime | None |
| B | DROP+ADD all 108 FKs as CASCADE NOT VALID | Anytime (≤ a few seconds total) | Brief ACCESS EXCLUSIVE per constraint, metadata-only |
| C | `link_auth_user_to_profile()` rewrite | After A. Before any sweep. | None |
| — | `repair-staff-uuids?dry_run=true` | After A, B, C | Read-only |
| D | VALIDATE CONSTRAINT loop | **22:00–04:00 AEST window** | SHARE UPDATE EXCLUSIVE, online |
| — | `repair-staff-uuids` (live) | After D, in same window | Per-user transaction; cascaded UPDATEs |

A, B, C can deploy together in business hours (low risk, no data movement). D and the live sweep deploy together in the off-peak window.

---

## Rollback plan

- **A**: drop the table.
- **B**: regenerate FKs back to `ON UPDATE NO ACTION` from the same `pg_constraint`-driven loop with the inverse rule. Symmetric, fast.
- **C**: `CREATE OR REPLACE FUNCTION` back to the prior body (kept in the migration's comment header for retrieval).
- **D**: VALIDATE has no rollback by design — failed validation is logged but the constraint remains valid for new writes; pre-existing orphans (if any) are surfaced as a list.
- **Sweep**: every relink writes a `user_uuid_history` row. Reverse mapping is `UPDATE public.users SET user_uuid = old_uuid WHERE user_uuid = new_uuid`. CASCADE will propagate the reversal.

---

## Open items (none blocking)

- Hygiene migration to drop unbound `handle_new_user()` and the duplicate `update_tenant_status_trigger` — deferred per decision.
- Possible future Option B (immutable audit_log) — `user_uuid_history` makes this recoverable later if compliance review demands it.

Awaiting approval to proceed with Migrations A, B, C and the `repair-staff-uuids` edge function (steps 1–3 + 5). Migration D and the live sweep (step 4 + step 6 #8) will be staged and held for the next 22:00–04:00 AEST window.
