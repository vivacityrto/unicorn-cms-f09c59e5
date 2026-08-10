# Audit: 2026-08-10 — `eos_todos` null `tenant_id` on IDS-to-do creation

**Trigger:** Carl reported a live error screenshot — "Mark as Solved" on the
"IDS: Outstanding CHC" issue with two attached to-dos failed with `Error
creating to-dos: null value in column "tenant_id" of relation "eos_todos"
violates not-null constraint`.
**Author:** Claude (session run by Carl)
**Scope:** Two-part fix — one data backfill + one `SECURITY DEFINER` function
change on `create_todos_from_issue`, plus one frontend fallback in
`useEos.tsx`'s `createIssue`. No RLS changes, no new tables, no edge function
changes.
**Supabase project:** hosted `unicorn-cms-f09c59e5` production project.

---

## Findings

- **Root cause is two bugs chaining together.** `useEos.tsx`'s `createIssue`
  mutation inserted the caller's partial `eos_issues` payload as-is with no
  `tenant_id` fallback — unlike `createRock`/`createMeeting`/`createMetric`
  in the same file (which strip `tenant_id` from client input) or `createTodo`
  (which defaults it to `6372`). Several UI call sites (`LiveMeetingView.tsx`,
  `IDSMasterPanel.tsx`, `RockProgressControl.tsx`, `ScorecardEntryGrid.tsx`)
  create issues without supplying `tenant_id`, so it landed `NULL`.
  `create_todos_from_issue` then read that `NULL` straight off the issue row
  and inserted it into `eos_todos.tenant_id`, which is `NOT NULL` — the exact
  failure in the screenshot.
- **Verified live before fixing.** The reported issue
  (`356176cd-bced-4b94-9205-43cce3288e44`, "Outstanding CHC") had
  `tenant_id = NULL`. Broader check: 31 of 60 `eos_issues` rows had
  `tenant_id IS NULL` — this was a systemic gap, not a one-off.
- **Backfilling to `6372` is safe.** `SELECT tenant_id, client_id, count(*)
  FROM eos_issues GROUP BY 1,2` showed exactly two groups:
  `(NULL, NULL)` × 31 and `(6372, NULL)` × 29. No other tenant ever appears —
  confirms EOS/L10 is Vivacity-internal only (matches the existing "EOS is
  internal-only" comment in `IDSDialog.tsx`), so there is no cross-tenant
  data to lose by defaulting nulls to Vivacity's own tenant.

---

## DB changes shipped

Migration: `supabase/migrations/20260810120000_eos-todos-null-tenant-id-fix.sql`

```sql
UPDATE eos_issues SET tenant_id = 6372 WHERE tenant_id IS NULL;

CREATE OR REPLACE FUNCTION public.create_todos_from_issue(...)
-- ... SELECT COALESCE(tenant_id, 6372) INTO v_tenant_id FROM eos_issues ...
```

Applied directly to prod via Supabase MCP `apply_migration`, with Carl's
explicit approval (the harness's auto-mode classifier blocked the first
attempt and required a fresh confirmation, per this repo's risk-action
policy). Verified post-apply: `SELECT count(*) FILTER (WHERE tenant_id IS
NULL) FROM eos_issues` → `0` (was 31).

---

## Code changes (if this entry accompanies one)

- `src/hooks/useEos.tsx` — `createIssue` now defaults `tenant_id` to `6372`
  when the caller doesn't supply one, matching the existing pattern in
  `createTodo` in the same file. Stops new `eos_issues` rows from ever
  landing with a null `tenant_id` again.
- `supabase/migrations/20260810120000_eos-todos-null-tenant-id-fix.sql` — see
  above.

Branch: `hotfix/eos-todos-null-tenant-id`.

---

## Decisions

- **Fixed both the data and the function, not just one.** Fixing only the
  function (`COALESCE` fallback) would have masked the frontend bug for any
  future issue created via a path that still omits `tenant_id`. Fixing only
  the frontend would have left the 31 already-broken historical issues
  unable to ever get to-dos attached. Both were shipped together.
- **Defaulted to `6372` rather than deriving from `auth.uid()`/caller
  profile.** EOS is Vivacity-staff-only tooling; every non-null row already
  used `6372`, and `createTodo`/`useMeetingTodos.tsx` already established
  `6372` as this codebase's existing fallback convention for EOS tables.

---

## Open questions parked

- Other `createIssue` call sites (`LiveMeetingView.tsx`, `IDSMasterPanel.tsx`,
  `RockProgressControl.tsx`, `ScorecardEntryGrid.tsx`) were not individually
  audited for whether they *should* be passing a real tenant_id in some
  future multi-tenant EOS scenario — out of scope while EOS remains
  Vivacity-internal-only.
