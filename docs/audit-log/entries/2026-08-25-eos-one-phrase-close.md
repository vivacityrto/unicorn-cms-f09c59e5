# Audit: 2026-08-25 — EOS one phrase close

**Trigger:** ad-hoc — Carl asked to redesign the L10 meeting's Conclude segment: replace the shared free-text "cascading messages" textarea with a live, per-attendee "one phrase close" (circular avatar + speech bubble per person, updating in real time), persisted into the meeting summary.
**Scope:** new `eos_meeting_one_phrase_closes` table + RLS + RPC, `eos_meeting_summaries.one_phrase_closes` column, `generate_meeting_summary()` updated, `useMeetingRealtime` wired for the new table, `LiveMeetingView.tsx` and `MeetingSummaryCard.tsx` UI. No changes to `eos_meetings.notes` schema (left in place, unused going forward).

## Findings

- The old "Cascading Messages" feature was a single shared `Textarea` bound to `eos_meetings.notes`, saved on blur by any attendee — last write wins, no per-person attribution, no live feel.
- `generate_meeting_summary()` wrapped `eos_meetings.notes` into `eos_meeting_summaries.cascades` as a one-item array on meeting close.
- `useMeetingRealtime` already had an established pattern for this app's live-meeting feel: a Supabase Realtime channel per meeting with presence tracking, a `postgres_changes` subscription per table, and a `broadcast` fallback (documented as necessary because `postgres_changes` doesn't reliably register server-side for this project — confirmed live 2026-07-24, referenced in that hook's existing comments). Reused this exact pattern rather than inventing a new one.
- `clientAvatarColor`/`clientInitials` (`src/lib/clientAvatarColor.ts`) already provide a deterministic brand-palette avatar-color rotation used elsewhere in the app (messaging UI) — reused for per-attendee avatar coloring instead of inventing a new palette.

## Design

- A `/design` canvas mockup was produced first (circular avatars + speech bubbles, live pop-in, docked input, read-only summary recap) using the app's real resolved design tokens (Aqua primary, Acai text, Light Purple muted, 12px radius, Calibri/Binate fonts) before implementation. Published as a Claude Artifact canvas for review.
- New table `eos_meeting_one_phrase_closes` (`meeting_id`, `user_id`, `tenant_id`, `phrase`, unique per meeting+user), RLS policies copied exactly from `eos_meeting_ratings`' shape (staff/tenant-scoped read, self-only insert/update/delete).
- New RPC `save_one_phrase_close(p_meeting_id, p_phrase)` — upsert, mirrors `save_meeting_rating`'s shape, validates non-empty and ≤140 chars.
- `generate_meeting_summary()` updated: adds `v_one_phrase_closes` (jsonb_agg of `{user_id, phrase}` from the new table), and the `cascades` column is now always written as `'[]'::jsonb` (feature retired, column left in place for historical summaries rather than dropped).
- `useMeetingRealtime` gained `onOnePhraseCloseChange` (postgres_changes + broadcast on `eos_meeting_one_phrase_closes`) and a `one_phrase_close_change` broadcast event, following the same dual-path pattern as every other live field in that hook.
- Frontend: attendee list rendered as a CSS grid (`items-end`) of avatar+speech-bubble columns rather than a flexbox row, specifically so bubbles of very different heights (a one-word phrase vs. a full sentence) don't stagger the avatar row out of alignment — verified visually with mixed-length test data before finalizing.
- Avatars use each attendee's real `avatar_url` (added to `useMeetingAttendance`'s embed and `MeetingSummaryCard`'s name-resolution query) with initials as fallback, matching the rest of the app's avatar convention.
- Added a live "X of Y rated" counter next to the existing meeting-rating control (both the inline Conclude-segment copy and the post-advance "All Segments Complete" copy), matching the new "X of Y shared" counter's style, per a follow-up ask in the same session.

## Code changes

- `supabase/migrations/20260825090000_eos_one_phrase_close.sql`
- `src/hooks/useOnePhraseCloses.tsx` (new)
- `src/hooks/useMeetingRealtime.tsx`, `src/hooks/useMeetingAttendance.tsx`
- `src/components/eos/LiveMeetingView.tsx`, `src/components/eos/MeetingSummaryCard.tsx`
- `src/types/eos.ts`, `src/integrations/supabase/types.ts` (regenerated)

## Decisions

- Kept `eos_meetings.notes` and `eos_meeting_summaries.cascades` in the schema rather than dropping them — no destructive migration for a UI feature removal; both are simply unused by new code going forward. `cascades` is commented as deprecated in the migration.
- Tested live (two browser tabs, same Supabase backend, different origins/ports) rather than trusting the realtime wiring by inspection alone — confirmed a phrase typed and shared in one tab appeared in the other without a reload, and confirmed `generate_meeting_summary()` picks up the new table correctly by generating a real summary against a disposable standalone test meeting (not the real recurring L10 series) and reverting the test rows afterward.

## Open questions parked

- No test/demo-data seed script exists for this feature; verification here was manual (Playwright + a standalone test meeting created via "Schedule Meeting", separate from the real recurring L10 series).
