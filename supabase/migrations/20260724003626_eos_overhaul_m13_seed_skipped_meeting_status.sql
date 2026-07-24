-- ============================================================
-- EOS Meeting Overhaul — Migration 13 (seed 'skipped' meeting status)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md,
-- 2026-07-23). Apply in the 22:00-04:00 AEST off-peak window per
-- project convention.
--
-- Gap found by Cursor Bugbot review on PR #39 (round 5), missed by an
-- earlier investigation this session that only checked for a CHECK
-- constraint on eos_meetings.status and found none - there IS a live
-- FOREIGN KEY (fk_eos_meetings_status -> dd_meeting_status(value)) that
-- was missed. skip_meeting_occurrence (M6) sets status = 'skipped', and
-- auto_generate_next_meeting's trigger condition (M6/M9/M11) already
-- checks NEW.status IN (..., 'skipped') expecting it to be a real,
-- reachable value - but 'skipped' was never seeded into
-- dd_meeting_status, so the UPDATE inside skip_meeting_occurrence would
-- fail the FK and the entire Skip feature (a "Needed" item per the
-- plan's Stage 2 section) could never actually succeed.
-- ============================================================

BEGIN;

INSERT INTO public.dd_meeting_status (value, label, sort_order, is_active)
VALUES ('skipped', 'Skipped', 65, true);

COMMIT;
