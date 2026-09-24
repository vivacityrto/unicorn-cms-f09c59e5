# Audit: 2026-09-24 — `academy_lesson_progress` duplicate RLS policies caused the 2026-09-22 host restart

**Trigger:** ad-hoc — Carl forwarded a Supabase infra dashboard screenshot (Memory Basic / Disk Space Used panels) and a pasted incident summary reporting a host restart at ~01:54 UTC on 2026-09-22, preceded by near-zero free RAM, 798 MiB swap, and repeated statement timeouts on concurrent upserts to `academy_lesson_progress` (9-23s). The pasted summary could not confirm a definitive OOM/kernel-panic record and recommended investigating the upsert workload.
**Scope:** RLS policies and indexes on `public.academy_lesson_progress`; `postgres_logs` and the Supabase performance advisor for the incident window and current state. Did not investigate the host-restart trigger itself (manual vs. infra-initiated) — out of scope for a repo-side session.

## Findings

- **Two overlapping permissive RLS policies existed on `academy_lesson_progress` for the same roles/actions.** The 2026-09-14 migration (`20260914120000_academy_solo_access_boundary.sql`) added a new `FOR ALL` policy ("Lesson progress: active Academy users manage own" — nested `EXISTS` against `academy_enrollments` → `academy_lessons` plus `has_academy_access_safe()`) and dropped the policy named `"Lesson progress: users manage own"`, but a differently-named older policy, `academy_lesson_progress_all` (`EXISTS` against `public.users` for staff OR `user_id = auth.uid()`, no enrolment/lesson checks), was never dropped and stayed active alongside it. Postgres evaluates every permissive policy for a role/action and ORs the results, so every INSERT/UPDATE/DELETE on this table paid both policies' cost. Confirmed live via `pg_policies` before the fix, and independently flagged by the Supabase performance advisor as "multiple permissive policies for role `authenticated`" for INSERT/UPDATE/DELETE/SELECT on this table.
- **Two of this table's own foreign keys (`course_id`, `lesson_id`) lacked covering indexes** — exactly the columns the new policy's nested `EXISTS` filters on — also flagged by the performance advisor.
- **Confirmed as the dominant contributor in the actual incident window**, not just a theoretical cost: querying `postgres_logs` for 2026-09-22 01:00-02:00 UTC, of all `canceling statement due to statement timeout` events, 68 were the PostgREST-generated `INSERT INTO academy_lesson_progress ... ON CONFLICT` upsert, versus 13 total across every other query combined.
- **Write source:** `AcademyLessonViewerPage.tsx`'s `upsertProgress` fires on `VimeoPlayer`'s throttled `onProgress` callback (`progressThrottleMs` default 10s — [VimeoPlayer.tsx:84](../../../src/components/academy/VimeoPlayer.tsx)), i.e. once per 10s per actively-watching student. Any moderate number of concurrent viewers is enough to saturate a doubly-RLS-checked write path.
- This plausibly explains the full incident chain reported in the pasted summary: doubled RLS cost per write → concurrent video-progress upserts queue and time out → backends/connections accumulate → memory pressure → swap → host restart. Not independently re-confirmed against kernel/OOM logs (per the pasted summary, none were retained) — this is the database-side half of the story, not proof of the exact restart mechanism.

## Code changes (this entry accompanies them)

- `supabase/migrations/20260924120000_fix_academy_lesson_progress_rls_perf.sql`:
  - `DROP POLICY "academy_lesson_progress_all"` — superseded by the 2026-09-14 policy for "own row" access; its extra staff-wide grant had no depended-on UI (this table has no staff-facing view path built on it) and is not reintroduced.
  - `CREATE INDEX idx_academy_lesson_progress_course_id (course_id)` and `idx_academy_lesson_progress_lesson_id (lesson_id)`.
- Applied directly to the hosted Supabase project via `apply_migration` (per this repo's MCP-controlled migration path).

## Decisions

- Fixed by removing the redundant policy and adding the flagged indexes, rather than rewriting the surviving policy's shape — the surviving policy's enrolment/lesson checks are the intended, correct authorization behaviour post-2026-09-14; the bug was that policy's *duplicate*, not its logic.
- Did not touch `has_academy_access_safe()` or the enrolment/lesson `EXISTS` structure itself — no evidence it's individually expensive once it's evaluated only once per row instead of twice.

## Verification

- `pg_policies` re-queried post-migration: `academy_lesson_progress` now has exactly one `FOR ALL` policy and one `FOR SELECT` policy for `authenticated` — no duplicate action coverage remains.
- `pg_indexes` re-queried post-migration: `idx_academy_lesson_progress_course_id` and `idx_academy_lesson_progress_lesson_id` both present.
- Did not re-run the performance advisor after the fix in this session; the advisor pull that surfaced these findings was taken before the migration — re-running it is a natural follow-up to confirm both findings clear.
- Did not load-test the upsert path under simulated concurrency; the fix removes a proven-duplicated cost and closes a proven-missing index, but its effect under real concurrent load is inferred, not benchmarked, in this session.

## Open questions parked

- Whether the 2026-09-14 migration's author intended to drop `academy_lesson_progress_all` and missed the name mismatch, or intentionally left it — not investigated; the fix stands on its own regardless.
- Whether other tables touched by the same 2026-09-14 migration (`academy_enrollments`, `academy_modules`, `academy_lessons`, `academy_assessments`, `academy_assessment_questions`, `academy_assessment_attempts`) have similar leftover duplicate policies from that same migration — not swept in this session; scoped strictly to `academy_lesson_progress`, the table implicated by the actual incident logs.
- Root cause of the host restart itself (manual vs. Supabase-infra-initiated) — per the pasted incident summary, still being checked against Supabase's own project event history; not something this repo-side session can confirm.
