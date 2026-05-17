# Fix: `public.users.full_name` backfill + auto-sync trigger

Database-only change. Single migration. No frontend, RLS, or edge-function edits.

## Verified facts (live DB)

- 502 users total, 499 with `full_name IS NULL`, 3 manual overrides present (Ezel Mae Olores, Khian Brian Orcullo Sismundo, Carl Matheous Simpao).
- 2 rows have trailing whitespace in `first_name`/`last_name` — `TRIM()` is required.
- `first_name` and `last_name` are `NOT NULL text`; `full_name` is nullable `text`. Safe to concatenate without NULL guards.
- No existing trigger maintains `full_name`. Existing triggers on `public.users`:
  - `trg_audit_users_update` (AFTER UPDATE) — gated on a specific column list that **does not include `full_name`**, so the backfill will not generate audit spam. ✅
  - `update_users_updated_at` (BEFORE UPDATE) — will bump `updated_at` on the 499 backfilled rows. Acceptable and expected.
  - `trg_set_user_organisation`, `trg_set_user_type_from_role`, `trg_sync_is_vivacity_internal`, `trigger_update_tenant_status`, `update_tenant_status_trigger` — none read or write `full_name`. No interaction.
- `ProfileForm.tsx` sends `full_name: ''` when the user clears the field (line 41 uses `user.full_name || ''`). The trigger's `TRIM(NEW.full_name) = ''` branch correctly auto-regenerates in that case, matching the spec.
- `useWorkCalendar`, `useCalendarShares`, `AcademyCertificatesPage` — confirmed they do not read `users.full_name`. Unaffected.

## Migration contents

Single migration file, two statements + one function + one trigger.

### Part 1 — Backfill

```sql
UPDATE public.users
SET full_name = TRIM(first_name) || ' ' || TRIM(last_name)
WHERE full_name IS NULL;
```

- Touches exactly 499 rows.
- Preserves the 3 manual overrides (their `full_name` is `NOT NULL`).
- `TRIM()` handles the 2 rows with whitespace in `first_name`.
- Does **not** modify `first_name`/`last_name` source columns.
- Does **not** fire `trg_audit_users_update` (column not in WHEN clause).
- Will bump `updated_at` on 499 rows (acceptable; reflects real change).

### Part 2 — Sync trigger

```sql
CREATE OR REPLACE FUNCTION public.sync_user_full_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.full_name IS NULL OR TRIM(NEW.full_name) = '' THEN
    NEW.full_name := TRIM(NEW.first_name) || ' ' || TRIM(NEW.last_name);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_user_full_name
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_full_name();
```

- `BEFORE` so the mutation lands in the same row write (no second UPDATE, no extra audit row).
- `SECURITY INVOKER` + `search_path = public, extensions` per project standards.
- Idempotent: if `full_name` is already set (manual override), it is left untouched, including the 3 existing richer names.
- Fires on every UPDATE but is a cheap no-op when `full_name` is non-empty.

## Why this is safe

| Concern | Outcome |
|---|---|
| RLS policies on `public.users` | Untouched. |
| Audit log noise | `trg_audit_users_update` not triggered (column not whitelisted). |
| Manual overrides (Ezel, Khian, Carl) | Preserved by `IS NULL OR TRIM = ''` guard. |
| ProfileForm clearing the field | Trigger auto-regenerates from first+last. No UI change. |
| `useWorkCalendar`, `useCalendarShares` | Build name client-side; unaffected. |
| `AcademyCertificatesPage` | Uses certificate metadata, not `users.full_name`. |
| Source-of-truth columns `first_name`/`last_name` | Not modified (no TRIM cleanup, per spec). |
| Edge functions that write `full_name` (`update-user-profile`) | Continue to work; trigger only intervenes when the value is empty. |
| `update-user-profile` does **not** currently set `full_name` when only first/last change | Trigger now fills the gap automatically — net improvement. |
| `updated_at` bump on 499 rows | One-time, expected. |
| Performance | BEFORE trigger, single TRIM + concat; negligible. |

## Edge-case validation (mental test matrix)

1. Buggy row (full_name NULL, first/last clean) → backfill writes `"First Last"`. ✅
2. Buggy row with trailing space in first_name → `TRIM` produces clean `"First Last"`. ✅
3. Manual override row → skipped by backfill, skipped by trigger on future updates. ✅
4. Future INSERT with no `full_name` supplied → trigger fills from first+last. ✅
5. Future UPDATE clearing `full_name` to `''` via ProfileForm → trigger regenerates. ✅
6. Future UPDATE setting `full_name` to a custom value → trigger leaves it. ✅
7. UPDATE that only changes unrelated columns → trigger no-ops (full_name still non-empty). ✅

## Risk assessment

- **Low risk overall.** Pure additive change: one backfill UPDATE, one new function, one new BEFORE trigger.
- **No RLS, no enum, no schema-shape change, no FK change.**
- **Reversibility:** `DROP TRIGGER trg_sync_user_full_name ON public.users; DROP FUNCTION public.sync_user_full_name();` fully reverts forward behavior. Backfilled values would need a separate restore if rollback required (low concern — values are deterministic from first+last).
- **No downstream consumer breaks** — every consumer reads `full_name` for display; populated values are strictly an improvement over NULL.

## Out of scope (explicitly not done)

- No RLS changes.
- No `display_name_override` column.
- No frontend edits.
- No TRIM cleanup on `first_name`/`last_name` source columns.
- No edits to the 3 manual-override rows.

## Deliverable

One migration file via `supabase--migration` containing the four statements above (UPDATE, CREATE FUNCTION, CREATE TRIGGER). No follow-up code edits required.
