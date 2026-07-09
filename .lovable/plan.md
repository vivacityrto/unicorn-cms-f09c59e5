## Daily Notes — Range overview + AI summary in Expand modal

Additive changes to the Expand modal only. Panel mode, `TasksManagement.tsx`, the `user_daily_notes` schema, search/carry-over/editor flows are untouched.

### 1. Data hook — `src/components/task-notes/useDailyNotes.ts`

Add:
- `noteQueryKeys.range(userId, from, to)` → `['user_daily_notes', userId, 'range', from, to]`.
- `useNotesForRange(userId, from, to, enabled)`: `select('*').eq('user_id').gte('note_date', from).lte('note_date', to)` ordered by `note_date` then `created_at`, mapped through `hydrateLegacyNote`. Returns `DailyNote[]`.

### 2. Expand modal — `src/components/task-notes/ExpandedNotesModal.tsx`

Local state: `rangeMode: 'day' | 'week' | 'month'` (default `'day'`).

Right-pane header additions (next to the date title):
- `ToggleGroup type="single"` (Day / Week / Month) from `@/components/ui/toggle-group`.
- `Summarize` button (disabled if the visible range has zero notes; spinner while pending).

Range bounds derived from `selectedDate`:
- `day`: single date (existing path — unchanged).
- `week`: `startOfWeek` / `endOfWeek` (same weekStartsOn convention `FocusMode.tsx` uses).
- `month`: `startOfMonth` / `endOfMonth` (matches `useNotesForMonth`).

Feed:
- `day`: unchanged 2-column grid using `useNotesForDate`.
- `week` / `month`: use `useNotesForRange`, group by `note_date`, render a day subheader (weekday, `dd MMM yyyy`, per-day done/total) then that day's `NoteCard`s. Days with zero notes are skipped.

Stat strip (above the feed, styled like the left-pane progress bar):
- Total notes in period.
- Items `done/total` + %.
- Days-with-notes vs. days-in-period.
All computed client-side from the range/day query.

Search behaviour: unchanged. When `query` is non-empty, `SearchResultsList` still renders and the range toggle/summary card hide.

### 3. AI summary — client

New hook `src/components/task-notes/useNotesSummary.ts`:
- `useQuery` keyed `['user_daily_notes', userId, 'summary', rangeMode, periodStartISO, periodEndISO]`.
- `enabled: false` — triggered by `refetch()` from the Summarize button (so it only runs on click, but result is cached).
- `staleTime: 10 * 60 * 1000`, `gcTime: 30 * 60 * 1000`.
- Builds a compact digest client-side from the already-loaded notes: per note → title, done items, open items, plaintext body (strip HTML), grouped by date. POSTs `{ period_label, period_start, period_end, digest }` to the edge function via `supabase.functions.invoke('summarize-daily-notes')`.
- Errors surface via `sonner` toast.

Invalidation: extend `invalidate()` in `useNoteMutations.ts` to also invalidate `['user_daily_notes', userId, 'summary']` so any create/update/delete/toggle/carry-over within the summarised window busts the cached summary. (Broad key match — cheap, correct.)

Summary card (rendered above the feed, only when a summary exists for the current period key):
- Headline in the bold acai heading style.
- Summary body text.
- `open_count` as a stat chip.
- `Regenerate` link-button that calls `refetch()` (bypasses cache via `queryClient.invalidateQueries` on that key first).

### 4. Edge function — `supabase/functions/summarize-daily-notes/index.ts`

Follows `draft-finding` shape:
- CORS + `OPTIONS`.
- Verify caller JWT via `supabase.auth.getClaims(token)`; 401 if missing/invalid.
- Body: `{ user_id, period_label, period_start, period_end, digest }`. Validate with Zod. **Reject if `claims.sub !== body.user_id`** (no tenant scoping — notes are per-user).
- Guard: cap digest size (e.g. 60 KB) to keep prompts sane; return 413 if larger.
- Rate limit: **~20/day per user**. See "Rate-limit storage" below.
- Call Lovable AI Gateway: `POST https://ai.gateway.lovable.dev/v1/chat/completions`, `Authorization: Bearer ${LOVABLE_API_KEY}`, `model: 'google/gemini-2.5-pro'`, `response_format: { type: 'json_object' }`.
- System prompt (Australian English): summarise across the period — what got done, what's still open, and a brief note on any reflective/no-checklist entries. Output **JSON only**: `{ "headline": string, "summary": string, "open_count": number }`.
- Reuse `safeParse` (defensive fence/preamble stripping).
- Map upstream 429 → 429 with friendly message. Missing `LOVABLE_API_KEY` → 500 with clear error (surfaced as toast, not silent).
- Deployed with `verify_jwt = false` (JWT validated in code, per project convention).

### Rate-limit storage — decision needed

`draft-finding` counts `client_audit_log` rows for its cap. Daily notes has no equivalent audit table and the spec says "no new persistence table for v1". Two viable options — flagging for your call before build:

- **A (preferred, matches spec literally):** best-effort in-process counter (`Map<userId, { count, resetsAt }>` in the edge function module scope). Simple, zero-schema. Caveat: resets on cold start, so real cap ≈ 20 per warm instance — soft ceiling, not hard.
- **B:** log each call to an existing generic audit table (e.g. `audit_events` if a suitable `entity_type`/`action` fits) and count rows in a 24 h window like `draft-finding` does. Durable cap, no new table, but couples Daily Notes to an audit surface it doesn't otherwise touch.

Default to **A** unless you say otherwise.

### 5. Acceptance

- Expand still opens on today in Day mode, unchanged.
- Week/Month shows every day with notes, grouped and dated; zero-note days omitted.
- Stat strip totals match the visible feed exactly.
- Summarize disabled when period has zero notes; produces Australian-English JSON digest; toggling period or editing a note within the period invalidates the cached summary; reopening within 10 min doesn't re-call the model; Regenerate forces a fresh call.
- No new secrets. Missing `LOVABLE_API_KEY` → toast, not silent failure.

### Out of scope

- Panel/Focus toggle is not restored.
- No changes to `TasksManagement.tsx`, `user_daily_notes` schema, or search/carry-over/editor flows.
- No persistent summary-cache table.

### Files touched

- `src/components/task-notes/useDailyNotes.ts` — add `useNotesForRange` + key.
- `src/components/task-notes/ExpandedNotesModal.tsx` — range toggle, grouped feed, stat strip, summary card wiring.
- `src/components/task-notes/useNotesSummary.ts` — **new**.
- `src/components/task-notes/useNoteMutations.ts` — extend `invalidate()` to also clear summary keys.
- `supabase/functions/summarize-daily-notes/index.ts` — **new**.
- `supabase/config.toml` — register the new function with `verify_jwt = false`.
