# Audit: 2026-08-10 — `client_timeline_events` event-type constraint drift

**Trigger:** Carl reported a live error screenshot — "Finalise Package" in
the client-detail Packages tab failed with `new row for relation
"client_timeline_events" violates check constraint
"timeline_valid_event_type"`.
**Author:** Claude (session run by Carl)
**Scope:** One `CHECK` constraint rewrite on `client_timeline_events`. No
table changes, no trigger/function changes, no RLS changes, no frontend
changes.
**Supabase project:** hosted `unicorn-cms-f09c59e5` production project.

---

## Findings

- **`timeline_valid_event_type` is hand-maintained and repeatedly
  self-clobbering.** Every migration that adds a new event type does
  `DROP CONSTRAINT` + `ADD CONSTRAINT` with the *entire* allowed list pasted
  in by hand, rather than `ADD VALUE`-style incremental extension. If a
  migration's author started from a base list that predates a sibling
  migration's addition, the sibling's value silently disappears — no error,
  no warning, just a constraint that's one value short until the next
  session notices.
- **`package_status_changed` was dropped this way.** `20260804080000_package_instance_status_timeline_event.sql`
  added it (for `fn_package_instance_timeline_trigger`, firing on
  `package_instances.membership_state` UPDATEs). `20260805010000_tenant_status_change_timeline_event.sql`,
  the very next day, rebuilt the constraint for an unrelated tenant-status
  feature from an older base list that predated that addition. Every later
  migration (`20260807020000`, `20260807060000`, `20260807070000`, …) copied
  that same stale base forward. Confirmed live before fixing: `package_instance_state_log`
  has zero rows after 2026-08-04 — every `transition_membership_state` call
  since has been silently rolling back (the trigger's failed `INSERT` aborts
  the whole transaction), not just "Finalise Package" but pause/resume/
  cancel/warning too.
- **Cross-checked every trigger function that inserts into
  `client_timeline_events` against the live constraint** (24 functions,
  found via `pg_proc`/`pg_get_functiondef`) to check for other instances of
  the same pattern rather than fixing only the reported symptom. Found one
  more: `action_item_comment` (`log_action_item_comment_timeline`, on
  `client_action_item_comments`) has **never** been in the constraint —
  that trigger (`20260108061028`) predates the constraint's introduction
  (`20260210082835`) by a month and was never added when the constraint was
  created. Confirmed live: 0 rows ever in `client_action_item_comments`.
  Unrelated feature, same one-line fix, folded into this migration with
  Carl's explicit go-ahead after surfacing it separately from the reported
  bug.
- **A third, out-of-sync copy of the allowed-types list exists but is
  currently dormant.** `supabase/functions/_shared/emit-timeline-event.ts`
  has its own hand-maintained `VALID_EVENT_TYPES` set, stale since roughly
  the Microsoft-integration era (missing everything added since, including
  both types fixed here). Not fixed this session — no current edge function
  caller was found passing an event type this set would reject, so it's
  inert rather than actively breaking anything. Parked as an open question.
- **Fix verified live via rolled-back dry-run transactions**, not just by
  inspecting the constraint definition: `transition_membership_state(15174,
  'paused', ...)` and an `INSERT INTO client_action_item_comments` both
  succeeded end-to-end (correct `client_timeline_events` row written) inside
  a transaction that was then rolled back, leaving no data changed.

---

## DB changes shipped

Migration: `supabase/migrations/20260810130000_restore_dropped_timeline_event_types.sql`

```sql
ALTER TABLE public.client_timeline_events DROP CONSTRAINT IF EXISTS timeline_valid_event_type;
ALTER TABLE public.client_timeline_events ADD CONSTRAINT timeline_valid_event_type
  CHECK (event_type IN (... existing 49 values ..., 'action_item_comment', 'package_status_changed'));
```

Applied directly to prod via Supabase MCP `apply_migration`, with Carl's
explicit approval. No data backfill needed — no `client_timeline_events`
rows to repair, since the missing values simply blocked every insert
attempt (nothing landed with a bad value to begin with, unlike the previous
`eos_todos` null-`tenant_id` case).

---

## Code changes (if this entry accompanies one)

- `supabase/migrations/20260810130000_restore_dropped_timeline_event_types.sql` — see above.

Branch: `hotfix/timeline-event-type-constraint-drift`. Worked from a git
worktree (`.claude/worktrees/finalise-package-timeline`) since Codex was
active in the shared working directory on an unrelated task this session —
see `AGENTS.md → Concurrent agents in a shared working directory`.

---

## Decisions

- **Restored both missing values in one migration rather than filing the
  `action_item_comment` one separately.** Same root cause, same fix shape,
  found in the course of the same audit; Carl explicitly opted to bundle
  rather than defer.
- **Did not touch `emit-timeline-event.ts`'s stale `VALID_EVENT_TYPES`.**
  No live caller currently exercises the gap, so fixing it now would be
  speculative hardening rather than a bug fix. Left as a parked question
  instead.
- **Did not attempt to prevent recurrence (e.g. a generated/single-
  source-of-truth list, or a CI check diffing trigger literals against the
  constraint).** That's a real fix for the *pattern*, not just the instance,
  but it's a larger change than this session's reported bug warranted.
  Surfaced as an open question for a deliberate follow-up.

---

## Open questions parked

- **Systemic fix for the drift pattern itself.** Options include: an enum
  type instead of a `CHECK` constraint (loses the "single ALTER to see the
  full list" readability but makes drops impossible without an explicit
  `DROP VALUE`), or a CI/audit script that extracts every literal
  `event_type` from trigger function bodies and diffs it against the live
  constraint. Worth a deliberate conversation rather than folding into a
  hotfix.
- **`emit-timeline-event.ts`'s stale `VALID_EVENT_TYPES`.** Currently
  inert (no live caller hits the gap) but will silently swallow-and-log
  (not throw to the caller) if a future Microsoft-integration edge function
  ever tries to emit one of the newer event types. Worth reconciling against
  the DB constraint the next time that file is touched.
