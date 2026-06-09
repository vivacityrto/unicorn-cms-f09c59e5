## Goal

One migration that consolidates all Vivacity staff-check DB functions onto `users.is_vivacity_internal`, so the 4 new roles (Integrator, BGT, CSC, CET) inherit access through ~120 existing RLS policies without policy changes.

## Migration outline

Single migration, wrapped in transaction. Order:

### 1. Pre-flight assertion
Fail fast if any active Integrator/BGT/CSC/CET user has `is_vivacity_internal = false` — backfill must run first.

```sql
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE unicorn_role IN ('Integrator','BGT','CSC','CET')
      AND COALESCE(is_vivacity_internal,false) = false
      AND COALESCE(disabled,false) = false
  ) THEN
    RAISE EXCEPTION 'is_vivacity_internal not backfilled — run backfill before this migration';
  END IF;
END $$;
```

### 2. Canonical function — `is_vivacity_team_safe(uuid)`
Replace body to check `is_vivacity_internal = true` + `archived = false` + `disabled = false`. `SECURITY DEFINER`, `SET search_path = ''`, fully qualified.

### 3. `is_any_team_member(uuid)` → one-line delegate to `is_vivacity_team_safe`.

### 4. Stale variant aliases (CREATE OR REPLACE, all one-line delegates):
- `is_vivacity_staff(uuid)`
- `is_vivacity_member(uuid)`
- `is_vivacity_team_rls(uuid)`
- `is_vivacity_team_user(uuid)`
- `is_vivacity_team_v2(uuid)`
- `is_vivacity()` → `is_vivacity_team_safe(auth.uid())`
- `is_vivacity_team()` → `is_vivacity_team_safe(auth.uid())`
- `is_vivacity_team(uuid)` → delegate (keep DEFAULT auth.uid() on param for backward compat with call sites that pass no arg via this overload? — note: existing signature is `p_user_id uuid DEFAULT auth.uid()`; user-supplied replacement drops the DEFAULT. Will keep `DEFAULT auth.uid()` to preserve callers.)
- `is_staff()` → `is_vivacity_team_safe(auth.uid())` (drops the legacy `global_role` check — acceptable per task scope since all internal staff now have `is_vivacity_internal`)
- `can_access_vivacity_meetings(uuid)` → delegate (param name stays `user_id` to preserve signature)

All with `SECURITY DEFINER`, `LANGUAGE sql STABLE`, `SET search_path = ''`, fully qualified.

### 5. Grants
`REVOKE ALL ... FROM PUBLIC` then `GRANT EXECUTE ... TO authenticated, service_role` for every function above (via the DO/FOREACH block from the brief).

### 6. EOS + notify function rewrites
Replace each hardcoded role array with `u.is_vivacity_internal = true`:

- `create_meeting_from_template(bigint, uuid, text, timestamptz, integer, uuid, uuid, uuid[])` — line ~91
- `create_meeting_from_template(uuid, timestamptz, timestamptz, uuid, uuid, text, uuid[], text, uuid, bigint)` — line ~187
- `enforce_level10_participants()` — line ~224
- `sync_l10_meeting_participants(uuid)` — line ~491
- `fn_notify_csc_on_support_ticket()` — line ~257
- `get_vivacity_team_directory()` — line ~273
- `get_vivacity_team_directory_staff()` — line ~288 (keep `is_vivacity_team_safe(auth.uid())` gate)

All preserved verbatim except the role filter; all retain existing `SECURITY DEFINER` and bodies. Per project rule, `SET search_path = ''` and fully qualify (these already use `SET search_path = 'public'` — will tighten to `''` with full qualification while rewriting).

### 7. Post-migration verification (in same migration, as RAISE NOTICE / final SELECT for the user to run separately)
Provided as a NOTICE-friendly DO block:

```sql
DO $$
DECLARE r record; bad int := 0;
BEGIN
  FOR r IN
    SELECT user_uuid, email, unicorn_role
    FROM public.users
    WHERE unicorn_role IN ('Integrator','BGT','CSC','CET')
      AND COALESCE(disabled,false) = false
  LOOP
    IF NOT public.is_vivacity_team_safe(r.user_uuid) THEN
      bad := bad + 1;
      RAISE WARNING 'NOT STAFF: % %', r.email, r.unicorn_role;
    END IF;
  END LOOP;
  IF bad > 0 THEN RAISE EXCEPTION '% new-role users still failing is_vivacity_team_safe', bad; END IF;
END $$;
```

## Notes / behavior changes

- `is_staff()` loses its legacy `global_role` branch. Acceptable per the task brief (all internal staff use `is_vivacity_internal`).
- `is_vivacity_team(uuid)` retains `DEFAULT auth.uid()` so existing zero-arg callers still resolve to this overload as they do today.
- No RLS policies are altered.
- All function signatures (name + argument types) are unchanged — drop-in replacement, no dependency breakage.

## Out of scope

- Frontend code (already refactored).
- Edge functions (already updated via `_shared/auth-helpers.ts`).
- Backfill of `is_vivacity_internal` (pre-flight check assumes it's done).
