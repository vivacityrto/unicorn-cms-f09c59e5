# Audit: 2026-08-11 — seat-health-recommendation-race

**Trigger:** drift-surfaced
**Scope:** Follow-up sweep after fixing the `client_audit_responses` duplicate-row race (see `2026-08-11-audit-response-duplicate-race.md`) — Carl asked to sweep the rest of the codebase for the same check-then-write anti-pattern. Scope was the ~35 files matching the anti-pattern's grep signature plus the whole audit module; this entry covers the one confirmed live instance found and fixed. The other three code-smell matches (`useScorecardMetrics.tsx`, `useAcademyCertificates.ts`, `useClientImpact.tsx`) were left alone — all three are already backed by a real unique constraint on their natural key, so the same manual-check pattern there can only produce an unhandled duplicate-key error, not silent duplication; not actioned this session.

## Findings
- `generateRecommendations()` in `src/hooks/useSeatHealth.tsx` (called from the `calculateAllHealth` mutation) checked for an existing *active* recommendation of a given type per seat via `.eq('seat_id', ...).eq('recommendation_type', ...).in('status', ['new','acknowledged']).maybeSingle()`, never checked the error from that call, and inserted if `!existing` — the same shape as the response-save bug, and `seat_rebalancing_recommendations` had no constraint backing the `(seat_id, recommendation_type)` key at all (only a primary key on `id`).
- Confirmed live: zero duplicates exist in production today (checked via a full `group by seat_id, recommendation_type, status having count(*) > 1` sweep) — this is a latent trap, not an active incident.
- Traced reachability: `calculateAllHealth` is only invoked from `SeatHealthWatchlist.tsx`'s "Recalculate"/"Calculate Health Scores" button. That component has **zero importers anywhere in `src/`** — not rendered by any page, no edge function or cron calls the path server-side either. `SeatDetailPanel.tsx`/`RecommendationsPanel.tsx` (which *are* wired into the live accountability chart via `ChartBuilder.tsx`) only call read-only helpers and `updateRecommendation` (edits an existing row by `id`), never the vulnerable insert path. So this was fixed as prevention, not an active incident — confirmed with Carl before treating it as lower urgency than the response-save bug.
- Unlike `client_audit_responses`, a plain `UNIQUE(seat_id, recommendation_type)` would have been the wrong fix: the intended semantics are "at most one *active* recommendation of a type per seat," and a resolved/dismissed recommendation of the same type legitimately recurring later is not a duplicate. Used a partial unique index (`WHERE status IN ('new','acknowledged')`) instead, and an atomic `INSERT ... ON CONFLICT (...) WHERE ... DO NOTHING RETURNING id` SQL function (`insert_seat_recommendation_if_absent`, `security invoker` so existing RLS still applies) rather than a plain `.upsert()`, since PostgREST's upsert helper can't express a partial-index conflict target.

## KB changes shipped
- No changes.

## Code changes (if this entry accompanies one)
- `src/hooks/useSeatHealth.tsx`: `generateRecommendations` now calls the `insert_seat_recommendation_if_absent` RPC instead of the manual check-then-insert; the `audit_seat_health` log entry is only written when the RPC actually inserted a row.
- `supabase/migrations/20260811053743_seat_recommendation_dedupe_race_fix.sql`: adds the partial unique index and the RPC.
- Applied directly to production Supabase (`yxkgdalkbrriasiyyrwk`) via `apply_migration` (version `20260811053743`), verified live: index and function both present.

## Decisions
- Fixed via direct git hotfix, same as the response-save fix.
- Worked from the same git worktree as the response-save fix (branch swapped to a fresh one off `origin/main`) since another tool still held uncommitted changes in the shared checkout.

## Open questions parked
- `useScorecardMetrics.tsx`, `useAcademyCertificates.ts`, `useClientImpact.tsx` all have the same check-then-write shape but are protected by real unique constraints already — worth a small follow-up to add proper `onError` handling / switch to real upserts for correctness, but not a data-integrity risk, so not actioned this session.

## Tag
audit-2026-08-11-seat-health-recommendation-race
