-- ============================================================
-- EOS Meeting Overhaul — Migration 20 (eos_todos realtime publication gap)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md,
-- 2026-07-23). Applied live 2026-07-24, found as a side-discovery while
-- diagnosing the reported "Next Segment doesn't move for other attendees"
-- bug: eos_meeting_segments and eos_headlines were already members of the
-- supabase_realtime publication, but eos_todos was not - confirmed live via
-- pg_publication_tables. Unlike the segments/headlines gap (a broken
-- postgres_changes registration issue on Supabase's side, worked around at
-- the app layer with a broadcast fallback in useMeetingRealtime.tsx), this
-- one is a real, fixable config gap: even once postgres_changes starts
-- working again, eos_todos changes still wouldn't propagate without this.
-- ============================================================

BEGIN;

ALTER PUBLICATION supabase_realtime ADD TABLE public.eos_todos;

COMMIT;
