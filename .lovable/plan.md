# M1 — Schema only: add `is_client_visible`

First of three migrations. Schema only. No data changes, no policy changes.

**File:** `supabase/migrations/<timestamp>_suggest_items_add_is_client_visible.sql`

```sql
-- =====================================================================
-- Suggestion Register — M1 of 3: schema only
-- Adds is_client_visible column to suggest_items.
-- No data, no RLS, no triggers (those are M2 and M3).
--
-- Lock impact: brief AccessExclusive; constant default → metadata-only
-- rewrite (PG ≥ 11). 8 rows; sub-second. Off-peak NOT required.
--
-- Verification:
--   \d+ public.suggest_items   -- column present, NOT NULL, default false
--   SELECT count(*) FILTER (WHERE is_client_visible) FROM public.suggest_items;  -- expect 0
--
-- Rollback:
--   ALTER TABLE public.suggest_items DROP COLUMN is_client_visible;
-- =====================================================================

ALTER TABLE public.suggest_items
  ADD COLUMN is_client_visible boolean NOT NULL DEFAULT false;
```

## What happens after approval

1. Apply M1 via the migration tool.
2. Run the verification query (expect `0`).
3. Stop and report back. M2 (backfill) and M3 (policy + triggers) follow as separate plan/approval cycles.

## Note on intermediate state

Between M1 and M3, the existing `suggest_items_select` policy is unchanged, so non-staff users continue to see all tenant-scoped rows exactly as today. The new column defaults to `false` but is not yet referenced by any policy, so it has no behavioural effect. Safe to leave in place indefinitely if M2/M3 are delayed.
