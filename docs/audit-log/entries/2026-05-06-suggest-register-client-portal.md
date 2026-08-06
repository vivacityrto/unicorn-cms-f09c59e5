# Audit: 2026-05-06 — suggest-register-client-portal

**Trigger:** Lovable production DB change session — client portal Suggestion Register
**Scope:** suggest_items schema, RLS policies, triggers, attachment policies, storage bucket policies, edge function notify-suggestion-submitted, staff UI additions, client portal pages. Excluded: suggest_attachments INSERT/DELETE storage policies (pre-existing bug, separate follow-up).

## Findings

- `suggest_items` had no client visibility control — all tenant-scoped items were equally visible to staff and clients via RLS. Added `is_client_visible boolean NOT NULL DEFAULT false` with triggers enforcing the invariant.
- `suggest_attachments_select` policy was tenant-only with no join to parent visibility — a client with a hidden parent item could still query the attachment row directly. Fixed in M4.
- `storage.objects` policies on `suggest-attachments` bucket had a pre-existing bug: comparing `auth.uid()::text` to `foldername[2]` (the suggest_item_id UUID, not a user UUID). Production was not broken because all file access goes through 1-hour signed URLs which bypass storage RLS. Flagged; not fixed in this session — separate migration required.
- `user_notifications.type` is plain text (no enum) — confirmed before build. No migration needed for new `suggestion_submitted` type.
- `supabase.auth.getClaims(token)` does not exist in `@supabase/supabase-js@2.45.0` — caught in review and corrected to `auth.getUser()` before deploy.
- All 8 existing suggest_items rows were staff-authored; M2 backfill was a no-op. Backfill SQL retained as a correctness guarantee for future rows.

## KB changes shipped

- no changes (session used existing KB docs — lovable-production-db-change.md, handoffs/README.md)

## Codebase observations

- unicorn-cms-f09c59e5 @ bb9fcc51: 4 migrations applied (M1 schema, M2 backfill, M3 RLS + triggers, M4 attachments + storage), edge function deployed, staff visibility toggle + audit logging added to SuggestionDetail, 3 client portal pages + wrappers + routes + sidebar nav shipped.

## Decisions

- Six design decisions confirmed before build: (1) is_client_visible flag added, default false; (2) auto-flip to true on release status transition; (3) UPDATE guard prevents non-staff from clearing flag; (4) client invoke for notification edge function; (5) storage policies aligned in same batch; (6) notification copy locked — staff: "New suggestion from {tenant}", client: "Suggestion received".
- Client-submitted suggestions always land with is_client_visible = true (BEFORE INSERT trigger).
- Edge function wiring: ClientNewSuggestionPage.tsx only — staff NewSuggestionForm and FloatingSuggestionsDialog intentionally excluded from notification fanout.

## Open questions parked

- Pre-existing storage bucket bug: `suggest-attachments` INSERT/DELETE policies compare `auth.uid()::text` to `foldername[2]` (the item UUID). Production unaffected (signed URLs bypass storage RLS) but should be corrected in a follow-up migration.
- Upvoting, comments/activity feed, duplicate detection, and notifications on status change are deferred improvements noted during design but out of scope for this session.

## Tag

audit-2026-05-06-suggest-register-client-portal
