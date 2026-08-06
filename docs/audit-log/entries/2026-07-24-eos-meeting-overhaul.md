# Audit: 2026-07-24 — EOS meeting overhaul

**Trigger:** ad-hoc (Lovable production DB change session — hand-authored hotfix under explicit root-`CLAUDE.md` override)
**Scope:** Full EOS (Entrepreneurial Operating System) meeting-feature overhaul for Vivacity's internal EOS practice (tenant 6372) in `unicorn-cms-f09c59e5` — schema/RPC/RLS migrations M1-M20, three frontend stages (Configuration UI, simplified scheduling, live-meeting control model), `eos_config_v2` flag flip, and a live bug-fixing pass using Playwright against production with a seeded isolated test meeting. Did not touch anything outside the EOS feature area.

## Findings

- M1-M9 (schema, backfill, cleanup, behaviour fixes, RLS/permissions, create-from-Configuration RPC, `segment_type` column) landed in an earlier session; this session picked up from there.
- A dedicated review pass cross-checked ~16+ rounds of Cursor Bugbot findings on PR #39 against the approved plan doc before applying anything — one real gap found (M16: refined M15's required-seats fallback to check actual `ROW_COUNT` rather than just array emptiness, catching seats assigned but currently unheld).
- M10-M18 covered scheduling RPC permission checks, cadence/timezone derivation, Leader-preservation on sync, legacy `segment_type` derivation, a missing `skipped` meeting-status seed row, facilitator/attendee seeding order, required-seats fallback (and its M16 refinement), a ratings-formula drift between two close-validation functions, and a facilitator-bootstrap bypass for the first-ever Leader assignment.
- M19: post-apply Supabase security advisor flagged 3 backup tables (from M4/M5) with RLS disabled — enabled with zero policies (deny-all), matching the existing `eos_configurations` pre-M7 pattern.
- **Bug 1 (found via live Playwright testing with Carl's real login, not caught by any prior review round):** the `eos_meeting_participants → users` PostgREST embed hint referenced a foreign key constraint (`eos_meeting_participants_user_id_users_fkey`) that does not exist — the real FK is `eos_meeting_participants_user_id_fkey → auth.users(id)`, and no FK bridges `public.users` to `auth.users`. This made the query return HTTP 400 on every load, always — silently masked by the *old* permission model (`isVivacityStaff || isFacilitator`), which never depended on participants resolving. Stage 3's correctness fix (removing that broad bypass, making control strictly `isFacilitator`-based) made this silently-broken query load-bearing for the first time, which is how it surfaced: Next Segment/End Meeting buttons were missing for the assigned facilitator. Fixed in `LiveMeetingView.tsx` and `useFacilitatorChange.tsx` (both shared the same broken pattern and the same React Query cache key) via PR #41.
- **Bug 2 (found via a deliberate two-tab Playwright reproduction after Bug 1 was fixed):** advancing a segment (or headlines/todos) never propagated to other attendees viewing the same live meeting. Root-caused on the live DB, not guessed at: `eos_meeting_segments`/`eos_headlines` were correctly in the `supabase_realtime` publication, RLS permitted the test user (verified by impersonating their JWT directly in SQL), and the logical replication slot was fully caught up with zero lag — but `realtime.subscription` (Supabase Realtime's own registry of active subscriptions) had **zero rows** for any of the three EOS tables despite both tabs having an actively-joined channel with working Presence ("N online"). This is a Supabase Realtime registration-layer issue, not an app or schema bug — confirmed by a raw SQL `UPDATE` with zero application code involved still not propagating to either tab. Worked around with a broadcast-based fallback (PR #42): the mutating client now also broadcasts segment/headline/todo changes directly over the same channel Presence already proves works; the `postgres_changes` listeners stay wired as a harmless no-op in case Supabase's side self-heals.
- Along the way: `eos_todos` was missing from the `supabase_realtime` publication entirely (unlike `eos_meeting_segments`/`eos_headlines`) — a separate, real, fixable config gap, closed by M20.
- `handoffs/eos-meeting-overhaul-plan.md` — the plan doc that governed this entire session — existed locally but was never actually committed to `unicorn-kb` until this session's wrap-up.

## KB changes shipped
- unicorn-kb @ `e873886`: committed `handoffs/eos-meeting-overhaul-plan.md` (PR #58, not yet merged)

## Codebase observations (read-only)
- unicorn-cms-f09c59e5 @ `ee425ad4` (main): PR #39 (M1-M18 + Stage 1-3 frontend), PR #40 (M19 backup-table RLS), PR #41 (participants→users embed fix), PR #42 (M20 + broadcast-sync fallback) — all merged.

## Decisions
- `eos_config_v2` feature flag flipped ON in production for tenant 6372.
- Facilitator seats and required seats configured live via the Stage 1 Configuration UI, then synced to the real upcoming L10 meeting.
- An isolated seeded test meeting (`TEST - L10 Live Meeting Simulation`) was used for all live-meeting UI testing, to avoid touching the real recurring L10 series.

## Open questions parked
- The `postgres_changes` registration failure (Bug 2) is Supabase-infrastructure-side, not fixable from this repo. The broadcast fallback is a workaround, not a resolution — if it recurs for other realtime features in this project, it's worth a Supabase support ticket with the `realtime.subscription`/`pg_stat_activity` evidence gathered here.
- `EosMeetings.tsx`'s list-level Change Facilitator permission check (`canChangeFacilitatorPerm`) is a known cosmetic narrowing vs. the plan's "current Leader" clause — left as-is since per-meeting participant data isn't loaded on the list view.
- A broader Stage 1/2/3 smoke-test verification pass had not yet been run as of this audit.

## Tag
audit-2026-07-24-eos-meeting-overhaul
