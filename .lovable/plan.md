## Plan: Fix Time Inbox Quick-Post Bypassing Minute Review

### Problem
In `src/pages/TimeInbox.tsx`, the quick-post ✓ button on each draft row calls `postDraft(draft.id)` directly, bypassing the review drawer. The drawer's editable "Minutes" field allows consultants to adjust actual time spent, but those using the quick-post button never see it. The `minutes` field on each draft is initialized to the full scheduled meeting duration by the `outlook-time-draft-worker` edge function. This causes the full scheduled duration to be logged instead of actual time spent.

### Changes (in `src/pages/TimeInbox.tsx` only)

1. **Quick-post button behaviour** (lines 595–608)
   - Change `onClick` from `postDraft(draft.id)` to `openDrawer(draft)`
   - Change tooltip from `"Post"` to `"Review & Post"`
   - Remove `disabled={!draft.client_id}` because the drawer now allows client selection
   - Keep all other button props (size, variant, className)

2. **Drawer label clarity — Scheduled duration** (lines 661–671)
   - In the grey info box that shows the meeting's start/end time and duration, change the duration span from:
     ```
     ({formatDuration(getDuration(editingDraft))})
     ```
     to:
     ```
     (Scheduled duration: {formatDuration(getDuration(editingDraft))})
     ```

3. **Drawer label clarity — Minutes field** (line 778)
   - Change `<Label>Minutes</Label>` to `<Label>Actual minutes spent</Label>`

### What stays unchanged

- `src/hooks/useTimeInbox.tsx` — no changes
- `src/hooks/useMeetings.tsx` — no changes
- Bulk "Post Selected" button — still posts directly without drawer (intentional)
- "Save Draft" and "Discard" drawer buttons — unchanged behaviour
- `handlePost` logic (save then post) — unchanged
- Database tables, RLS policies, triggers, RPCs — no changes
- All other drawer fields (client, package, stage, work type, billable, date, notes) — untouched
- Row-level selection, snooze, discard actions — untouched

### Testing checklist

1. **Quick-post path**: Click ✓ on a draft → drawer opens with correct data → edit "Actual minutes spent" → click Post → entry posted with updated minutes.
2. **Drawer-edit path**: Click pencil icon on a draft → drawer opens → edit minutes → Post. Same as before.
3. **Bulk path**: Select multiple drafts → "Post Selected" → bulk posts directly without drawer. Same as before.
4. **Draft without client**: Click ✓ on draft with no client → drawer opens → assign client and minutes → Post. (Previously button was disabled.)
5. **Snooze/Discard**: Individual row snooze and discard buttons continue working.

### Risk assessment

**Very low.** Purely frontend presentation/behaviour change in a single file. No data model, API, security, or automation changes. The `postDraft` function and `rpc_bulk_post_time_drafts` RPC remain untouched — they are still called by `handlePost` in the drawer and by `bulkPost`. Existing drafts simply get routed through the review drawer when consultants click the quick-post button, which is the intended correction.