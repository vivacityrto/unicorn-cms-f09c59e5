# Remove Duplicate `dedupe_key` Index on `user_notifications`

## Problem Confirmed

Live database inspection (`pg_indexes`) confirms three unique indexes on `public.user_notifications.dedupe_key`:

| Index | Definition | Status |
|---|---|---|
| `user_notifications_dedupe_key_uq` | `UNIQUE (dedupe_key)` — no WHERE clause | KEEP |
| `user_notifications_dedupe_key_idx` | `UNIQUE (dedupe_key) WHERE dedupe_key IS NOT NULL` | KEEP |
| `idx_user_notifications_dedupe_key` | `UNIQUE (dedupe_key) WHERE dedupe_key IS NOT NULL` | DROP — byte-identical duplicate |

Row counts: 883 total, 330 NULL `dedupe_key`, 553 non-NULL. PostgreSQL treats NULLs as distinct in unique indexes, so the non-partial `_uq` index coexists safely with NULL rows.

## Arbiter Mapping (verified, must remain intact)

- `ON CONFLICT (dedupe_key) DO NOTHING` (no WHERE) → arbitrated by `user_notifications_dedupe_key_uq`. Used by `check_membership_utilisation_alerts`, `fn_tm_on_message_insert`, edge functions `generate-notifications`, `notify-suggestion-submitted`.
- `ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING` → arbitrated by `user_notifications_dedupe_key_idx`. Used by `fn_check_membership_usage_alerts`, `fn_check_consultant_overload_alert`.
- `idx_user_notifications_dedupe_key` is referenced by **no** trigger, function, or edge function as an arbiter — it is pure write overhead.

## Change

Single migration:

```sql
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DROP INDEX IF EXISTS public.idx_user_notifications_dedupe_key;
```

Note: `DROP INDEX` (non-CONCURRENTLY) takes an `ACCESS EXCLUSIVE` lock on `user_notifications` for milliseconds. With `lock_timeout=3s`, the migration aborts cleanly if a long-running write is in flight rather than queuing behind it. This is safer than `CONCURRENTLY` here because index drops are near-instant and we want transactional rollback safety in the migration.

## Verification (post-apply)

1. `SELECT indexname FROM pg_indexes WHERE tablename='user_notifications' AND indexdef ILIKE '%dedupe_key%'` returns exactly 2 rows: `user_notifications_dedupe_key_uq`, `user_notifications_dedupe_key_idx`.
2. Smoke test both ON CONFLICT paths still dedupe correctly:
   - Insert duplicate `suggestion_submitted:*` row → second insert ignored (uses `_uq`).
   - Re-fire `fn_check_membership_usage_alerts` for a tenant already alerted → no duplicate notification (uses `_idx`).
3. Row counts unchanged: 883 total / 330 NULL / 553 keyed.

## Out of Scope (explicit non-changes)

- No UI / hooks / components touched
- No RLS policy changes
- No trigger or function definitions modified
- No edge function code modified
- No new indexes created
- No data mutations

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Drop wrong index | Very Low | High | Definitions inspected live; only one index has zero arbiter references |
| Lock contention on busy table | Low | Low | `lock_timeout=3s` aborts fast; drop itself is sub-millisecond |
| ON CONFLICT clauses lose arbiter | None | — | Both surviving indexes match both ON CONFLICT shapes used in code |
| NULL-row dedupe regression | None | — | NULLs were never deduped (NULL ≠ NULL in unique indexes); behavior preserved |
| Audit trail impact | None | — | Notifications table data untouched |

## Benefits

- Removes redundant index maintenance on every INSERT/UPDATE to `user_notifications` (high-traffic table fed by alert triggers and message inserts).
- Reduces storage and WAL volume for index pages.
- Eliminates schema confusion for future migrations.

Backward-compatible, audit-complete, production-ready.
