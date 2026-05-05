# M2 — Backfill only

Second of three migrations. Data only. No schema, no policy, no triggers. Pre-flight confirmed **0 rows** will be affected today; migration ships as a correctness guarantee and historical record.

**File:** `supabase/migrations/<timestamp>_suggest_items_backfill_client_visible.sql`

```sql
-- =====================================================================
-- Suggestion Register — M2 of 3: data backfill only
-- Marks existing client-authored suggest_items as visible to clients.
-- No schema changes, no RLS changes, no triggers (those are M1 and M3).
--
-- Lock impact: per-row write locks only. Pre-flight: 0 rows affected
-- (all 8 existing rows authored by Vivacity staff). Off-peak NOT required.
--
-- Verification:
--   -- Before applying:
--   SELECT count(*) FILTER (WHERE is_client_visible) AS visible_before,
--          count(*) AS total
--     FROM public.suggest_items;
--   -- Expected pre-state: visible_before = 0, total = 8
--
--   -- After applying:
--   SELECT count(*) FILTER (WHERE is_client_visible) AS visible_after,
--          count(*) AS total
--     FROM public.suggest_items;
--   -- Expected post-state: visible_after = 0 (no client-authored rows exist yet),
--   --                      total = 8
--
--   -- Sanity: every row currently visible must be authored by a non-staff user.
--   SELECT si.id, u.unicorn_role
--     FROM public.suggest_items si
--     LEFT JOIN public.users u ON u.user_uuid = si.created_by
--    WHERE si.is_client_visible = true;
--   -- Expected: 0 rows (no staff member should appear in this list).
--
-- Rollback (reverse the same predicate):
--   UPDATE public.suggest_items si
--      SET is_client_visible = false
--    WHERE created_by IN (
--      SELECT user_uuid FROM public.users
--       WHERE unicorn_role IS NULL
--          OR unicorn_role NOT IN ('Super Admin','Team Leader','Team Member')
--    );
-- =====================================================================

UPDATE public.suggest_items si
   SET is_client_visible = true
  WHERE created_by IN (
    SELECT user_uuid FROM public.users
     WHERE unicorn_role IS NULL
        OR unicorn_role NOT IN ('Super Admin','Team Leader','Team Member')
  );
```

## What happens after approval

1. Apply M2 via the migration tool.
2. Run the post-state verification query (expect `visible_after = 0`, `total = 8`).
3. Stop and report back. M3 (SELECT policy swap + INSERT/UPDATE triggers) follows as a separate plan/approval cycle.

## Note on intermediate state

Behaviour remains unchanged after M2: the existing `suggest_items_select` policy still doesn't reference `is_client_visible`, so non-staff visibility is identical to today. The flag becomes load-bearing only when M3 ships.
