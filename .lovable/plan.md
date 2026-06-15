Problem
In src/hooks/useStageCounts.ts, the client task instances count query uses:

```typescript
.eq('is_archived', false)
```

When combined with `head: true`, the Supabase/PostgREST query builder silently drops a boolean `false` value passed to `.eq()`, causing the filter to be omitted. The count then includes archived tasks (or returns 0 depending on data), producing an incorrect count.

Fix
Replace the `.eq('is_archived', false)` call on line 41 with `.is('is_archived', false)`. The `.is()` operator uses the PostgREST IS operator and correctly handles boolean `false` without being dropped.

No other code changes are needed.

Migration / deployment impact
None. This is a frontend-only one-line change.

Rollback
Revert the single line back to `.eq('is_archived', false)`.