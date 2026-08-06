# Audit: 03 June 2026 — L10 Meeting Fixes + Features

**Date:** 03 June 2026
**Author:** Khian (Brian)
**Type:** Bug fix + Feature — Lovable production DB change session (2 migrations, 4 frontend file changes, 1 direct DB data change)
**Repos touched:** `unicorn-cms-f09c59e5` (Lovable), Supabase production DB (direct SQL)

---

## What shipped

### Context

Reported by Angela and Nova during L10 meeting use. Four bugs identified and fixed, two features built. All bugs were inter-related — B1 made null-tenant risks visible in IDS, which exposed B4 (status update crash on those same items). All fixes diagnosed via codebase + Supabase MCP before Lovable prompts were written.

---

### B1 — Risks/opportunities invisible in L10 IDS queue

Items created on `/risks-opportunities` by Vivacity staff were not appearing in the IDS queue during L10 meetings. Items had `tenant_id = null` (Vivacity staff have no tenant on their profile). `useMeetingIssues` filtered `.eq('tenant_id', tenantId)` at the top level, silently excluding null-tenant items. Two open backlog items confirmed in DB: "WrkPod Week" and "Rocks must align to Company Goals".

**Fix:** Replaced the top-level tenant filter with a nested `.or()` that includes `tenant_id IS NULL` on the backlog branch only. Client isolation preserved by RLS — client users cannot see null-tenant items regardless of query.

**File:** `src/hooks/useMeetingIssues.tsx`
**Codebase SHA:** `d7b3e926`

---

### B2 — Next Segment button needs two clicks / skips a segment

The "Next Segment" button required two clicks to fire and each double-click skipped a segment (1 → 3 instead of 1 → 2). Two root causes: (1) `segmentsFetching = true` during initial load silently blocked first click with no visual feedback — users learned to double-click; (2) `isNavigating` was React state (async) so rapid clicks both passed the guard before the update committed, firing the `advance_segment` RPC twice.

**Fix:** Replaced `isNavigating` useState with `isNavigatingRef` (useRef) for synchronous locking. Added separate `isNavigatingUI` useState for button re-render only. Added `Loader2` spinner to both Next and Previous buttons during navigation. Same pattern applied to `handlePreviousSegment`. `finally` block resets both ref and state on success and error.

**File:** `src/components/eos/LiveMeetingView.tsx`
**Codebase SHA:** `177be1f2`

---

### B3 — "Meeting must be in progress to close"

At the end of an L10 meeting, clicking "Close Meeting" (after rating) returned the error "Meeting must be in progress to close." Force close ("Close Anyway") also failed. Two root causes: (1) `startFirstSegment` used `.update()` without `.select()` — RLS can silently block the status update (updates 0 rows, no error returned), leaving meeting stuck at `scheduled`; (2) the `close_meeting_with_validation` RPC's status check was a hard gate that `p_force = true` could not bypass.

**Fix 1 (frontend):** After the `eos_meetings` status UPDATE, added `.select('id, status').maybeSingle()` and explicitly verified the returned row has `status = 'in_progress'`. If 0 rows updated, throws a meaningful error surfaced via the existing `onError` toast.

**Fix 2 (RPC migration):** Updated `close_meeting_with_validation` (two-arg overload only) so the status gate is bypassable when `p_force = true` AND at least one `eos_meeting_segments` row has `started_at IS NOT NULL`. Never-started meetings remain blocked even with force.

**File:** `src/components/eos/LiveMeetingView.tsx`
**Migration:** `supabase/migrations/20260603014454_e26560f8-6eae-4716-a5ef-19cefa977bf0.sql`
**Codebase SHA:** `d5ff3f96`

---

### B4 — Status update crash on null-tenant risks in IDS dialog

After B1 made null-tenant risks visible in IDS, clicking one and changing its status (Discussing/Solved) failed with "null value in column 'tenant_id' of relation 'audit_eos_events' violates non-null constraint". Two root causes in `set_issue_status` RPC: (1) meeting auto-link query used `WHERE m.tenant_id = v_issue.tenant_id` — SQL evaluates `NULL = NULL` as false, so active meeting was never found for null-tenant issues; (2) audit INSERT used `v_issue.tenant_id` directly, crashing when null.

**Fix:** Updated `set_issue_status` RPC with two changes: (1) relaxed WHERE clause to `(v_issue.tenant_id IS NULL OR m.tenant_id = v_issue.tenant_id)` so active meeting is found regardless of issue tenant; (2) added `v_resolved_tenant_id` variable that COALESCEs the issue tenant with the linked meeting's tenant, and guarded the audit INSERT with `IF v_resolved_tenant_id IS NOT NULL`. Status update always succeeds; audit row written when tenant can be resolved, skipped otherwise.

**Migration:** `supabase/migrations/20260603023702_8eba3d23-12b0-482b-a9ac-84a991c6a454.sql`
**Codebase SHA:** `5a61baf2`

---

### F1 — L10 meetings auto-scheduled every Monday

L10 meetings were being created manually each week. The `auto_generate_next_meeting` trigger was fully built and correct but never fired because all Vivacity L10 meetings had `series_id = null`. No series existed for Vivacity (tenant 6372) in `eos_meeting_series`.

**Fix (direct DB data change — no migration):** Created an `eos_meeting_series` record for Vivacity (`recurrence_type = weekly`, `timezone = Australia/Sydney`, `start_time = 10:30`). Pre-seeded 7 upcoming Monday meetings (08 Jun through 20 Jul 2026) with `status = scheduled` and `series_id` linked. Test meeting (`b01b3888`) cleaned up — its 1 linked issue unlinked (returned to backlog), segments and attendees deleted, meeting deleted. From now on, closing each L10 triggers the existing trigger to auto-create the next Monday's meeting indefinitely.

**DB series ID:** `755fead7-2f57-486b-a1a2-5c09264eb17f`
**Direct SQL — not in a migration file**

---

### F2 — Rock owner and quarter editing during L10 Rock Review

During the Rock Review segment of a live L10 meeting, rocks were read-only — no way to reassign an owner or change the quarter without leaving the meeting. The existing `RockFormDialog` (full edit dialog including owner and quarter fields) and `updateRock` mutation were already built and available.

**Fix:** Added a pencil edit button to each rock card in the Rock Review segment of the live meeting view. Clicking it opens `RockFormDialog` pre-loaded with that rock. Any meeting participant can use it — no facilitator gate. Two new state variables (`editingRock`, `rockFormOpen`) added. `RockFormDialog` added to the dialogs section.

**File:** `src/components/eos/LiveMeetingView.tsx`
**Codebase SHA:** `54981f64`

---

## Migrations shipped

| Migration file | What it does |
|----------------|--------------|
| `20260603014454_e26560f8-6eae-4716-a5ef-19cefa977bf0.sql` | `close_meeting_with_validation` — force-close bypass when meeting has started segments |
| `20260603023702_8eba3d23-12b0-482b-a9ac-84a991c6a454.sql` | `set_issue_status` — null-tenant meeting lookup + guarded audit insert |

## Direct DB changes (no migration)

| Action | Detail |
|--------|--------|
| INSERT `eos_meeting_series` | Series `755fead7` — Vivacity weekly L10 |
| INSERT 7 × `eos_meetings` | 08 Jun – 20 Jul 2026, `status = scheduled` |
| DELETE `eos_meetings` `b01b3888` | Test meeting removed (segments + attendees deleted, issue unlinked) |

## KB drift to flag to Carl

- `codebase-state/module-status.md` § EOS Level 10 — meeting scheduling now fully wired (series exists, auto-generate trigger active). Calendar section can be updated from 🟡 partial.
- `codebase-state/codebase-map.md` — `LiveMeetingView` now references `RockFormDialog` (new import).
- No ADR changes needed — fixes are implementation-level, not convention-level.
