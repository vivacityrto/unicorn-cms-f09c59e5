# Audit: 2026-11-19 — academy-learner-analytics-watch-time-fix

**Trigger:** two review findings on PR 1566 (the learner analytics function). Learning time included the recording offset before each lesson cut from a longer recording, and a learner who completed lessons without video time could be labelled "Not started".
**Scope:** `create or replace` of `public.get_tenant_academy_learner_analytics(bigint)` (migration `20261119170000_fix_learner_analytics_watch_time_and_started.sql`). Same signature, so the function is replaced in place and no overload is created. Read-only; no table, policy, trigger or data change.
**Status:** NOT yet applied to production. Dry-run done (below). Applying needs Carl's explicit go-ahead.

## What was found (production, read-only)

- 224 progress rows belong to lessons cut from a longer recording (`segment_start_seconds > 0`; average offset 2,365 seconds, average lesson length 1,056 seconds). For 201 of them `watch_seconds` is longer than the lesson itself, so it holds a position in the recording, not time spent.
- All 1,335 progress rows are video lessons today, and none is completed with no watch time, so the "Not started" label is not wrong for current data; it would be for a lesson with no video.

## What changes

1. Watch time for a segmented lesson is `watch_seconds - segment_start_seconds`, never below zero and capped at the lesson length. Unsegmented lessons are unchanged.
2. "Started" now also counts a completed lesson (`is_completed` or `completed_at`), not only an opened or watched one.

## Dry run (production, read-only, rolled back, no names printed)

Reduced copy of the function (only the changed lesson logic and the totals) in the session's temp schema for tenant 7512: learning time 11,851 minutes before, 10,314 after; chosen 103, learners 14, lessons completed 478, active in 30 days 4 unchanged; 4 learners with no lesson activity at all remain "not started"; the largest single learner total is 4,995 minutes.

## Known limits

- The largest learner total is still high. If `watch_seconds` also accumulates replays, hours are an upper bound on time spent; the screen already says "about" and "watch time".
- The dry run used a reduced copy of the function, not the full text; the production statement is the migration file.

**Rollback:** re-run the previous definition from `supabase/migrations/20261119150000_get_tenant_academy_learner_analytics.sql`.
