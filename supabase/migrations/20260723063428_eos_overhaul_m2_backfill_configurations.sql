-- ============================================================
-- EOS Meeting Overhaul — Migration 2 (Backfill tenant 6372 Configurations)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md,
-- 2026-07-23). Purely additive — no existing table/row touched, only
-- new Configuration/segment rows inserted for tenant 6372.
--
-- Source data verified live (read-only) before writing this file:
--   - eos_agenda_templates: canonical row per type is is_default=true
--     where set (L10 -> 97346737, Same_Page -> fc7dc67e); Annual/Quarterly
--     have no is_default row, so canonical = the non-archived row
--     (f047977a, 7bea13e7) — confirmed this is what the real scheduled
--     meetings already point at.
--   - Segment values below are transcribed VERBATIM from the live jsonb
--     (durations sum-checked against each template's known total:
--     L10=90, Quarterly=405, Annual=630, Same_Page=120 — all match).
--     Explicit literal values used instead of dynamic jsonb parsing
--     because the source `segments` column is inconsistently shaped
--     across rows (duration vs duration_minutes, name vs segment_name)
--     — safer to hand-transcribe 28 known rows once than to write
--     generic parsing logic that has to handle every historical
--     inconsistency correctly.
--   - segment_type assigned using the EXACT keyword-matching logic
--     currently live in LiveMeetingView.tsx's getSegmentType() (segue/
--     check-in, scorecard, rock, headline, to-do/todo, ids/issue/tackle,
--     conclude/next step/decisions, else general) — this is the last
--     time that keyword-matching logic runs anywhere; going forward
--     segment_type is a real stored column, not re-derived from names.
--   - facilitator_seat_id / visionary_seat_id / integrator_seat_id are
--     NOT backfilled: confirmed live that these columns are NULL on
--     EVERY eos_meeting_series row across every tenant — there is no
--     data anywhere to derive them from. Left NULL; must be configured
--     manually via the Stage 1 Configuration editor once it ships,
--     before auto-generation can populate a Leader on new occurrences.
--   - required_seat_ids left at its default empty array for the same
--     reason (Same_Page's Visionary+Integrator seats aren't derivable
--     from any live source either).
--   - Participant backfill onto currently-open meetings with zero
--     participant rows was considered and explicitly declined (Carl,
--     2026-07-23): freezing a snapshot now for a meeting scheduled
--     months out repeats the copy-instead-of-derive pattern this
--     overhaul is fixing. The live-derivation fix (M6 + Stage 2
--     frontend) supersedes the need before either meeting happens.
-- ============================================================

BEGIN;

CREATE TEMP TABLE tmp_eos_config_ids (meeting_type text PRIMARY KEY, config_id bigint) ON COMMIT DROP;

WITH ins AS (
  INSERT INTO public.eos_configurations (tenant_id, meeting_type, frequency, participant_model, description)
  VALUES
    (6372, 'L10',       'weekly',    'whole_roster',   'Weekly Level 10 Meeting'),
    (6372, 'Quarterly', 'quarterly', 'whole_roster',   'Quarterly Meeting'),
    (6372, 'Annual',    'annual',    'whole_roster',   'Annual Strategic Planning (2-day)'),
    (6372, 'Same_Page', 'on_demand', 'required_seats', 'Same Page Meeting (Visionary + Integrator)')
  RETURNING meeting_type, id
)
INSERT INTO tmp_eos_config_ids (meeting_type, config_id)
SELECT meeting_type, id FROM ins;

INSERT INTO public.eos_configuration_segments (configuration_id, sequence_order, segment_type, label, duration_minutes)
SELECT c.config_id, v.seq, v.stype::public.eos_segment_type, v.label, v.dur
FROM (VALUES
  -- L10 (source template 97346737, is_default=true) — total 90 min
  ('L10', 1, 'segue',     'Segue',                              5),
  ('L10', 2, 'scorecard', 'Scorecard',                          5),
  ('L10', 3, 'rocks',     'Rock Review',                        5),
  ('L10', 4, 'headlines', 'Customer/Employee Headlines',        5),
  ('L10', 5, 'ids',       'IDS (Identify, Discuss, Solve)',     60),
  ('L10', 6, 'todos',     'To-Do List',                         5),
  ('L10', 7, 'conclude',  'Conclude / One Phrase Close',        5),

  -- Quarterly (source template 7bea13e7, canonical non-archived row) — total 405 min
  ('Quarterly', 1, 'segue',    'Segue',                              15),
  ('Quarterly', 2, 'general',  'Review Previous Flight Plan',        60),
  ('Quarterly', 3, 'general',  'Review Mission Control',             45),
  ('Quarterly', 4, 'rocks',    'Establish Next Quarter Rocks',       90),
  ('Quarterly', 5, 'ids',      'Tackle Key Issues',                 120),
  ('Quarterly', 6, 'conclude', 'Next Steps',                         45),
  ('Quarterly', 7, 'conclude', 'Conclude',                           30),

  -- Annual (source template f047977a, canonical non-archived row) — total 630 min (2-day)
  ('Annual', 1, 'segue',    'Day 1: Segue',                              30),
  ('Annual', 2, 'general',  'Day 1: Review Previous Mission Control',    60),
  ('Annual', 3, 'general',  'Day 1: Team Health',                        90),
  ('Annual', 4, 'ids',      'Day 1: SWOT/Issues List',                  120),
  ('Annual', 5, 'general',  'Day 1: Review Mission Control',             60),
  ('Annual', 6, 'rocks',    'Day 2: Establish Next Quarter Rocks',      120),
  ('Annual', 7, 'ids',      'Day 2: Tackle Key Issues',                 120),
  ('Annual', 8, 'conclude', 'Day 2: Conclude',                           30),

  -- Same_Page (source template fc7dc67e, is_default=true) — total 120 min
  ('Same_Page', 1, 'segue',    'Check-In',                       10),
  ('Same_Page', 2, 'general',  'Review V/TO',                    20),
  ('Same_Page', 3, 'general',  'Clarify Roles and Ownership',    20),
  ('Same_Page', 4, 'ids',      'Discuss Key Issues',              40),
  ('Same_Page', 5, 'general',  'Align on Priorities',             20),
  ('Same_Page', 6, 'conclude', 'Decisions and Next Steps',        10)
) AS v(meeting_type, seq, stype, label, dur)
JOIN tmp_eos_config_ids c ON c.meeting_type = v.meeting_type;

NOTIFY pgrst, 'reload schema';

COMMIT;
