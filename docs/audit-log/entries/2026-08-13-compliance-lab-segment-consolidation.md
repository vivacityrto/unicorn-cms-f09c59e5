# Audit: 2026-08-13 — compliance-lab-segment-consolidation

**Trigger:** ad-hoc
**Author:** Cursor (session run for Angela Connell-Richards / Vivacity)
**Scope:** The Compliance Lab's 40 AI-generated segment-courses, lesson-level
segment columns, Quick Add workshop commit path, and the lesson-viewer
player. Did not apply the enrollment remap. Did not encode a keep-list for
the Outcome Standards recording (`efe1f1a2`). Left TAS Superhero (course id 1)
untouched.
**Supabase project:** `yxkgdalkbrriasiyyrwk`

## Findings

- "The Compliance Lab" showed 41 library cards. 40 are `ai_generated`
  topic-segments cut from 6 workshop recordings; the 41st is TAS Superhero
  (105 lessons), which is a real course and was left alone.
- Root cause is the Quick Add workshop commit in
  `AcademyQuickAddPage.handleSave`: `academy-ai-generate` /
  `generate_workshop_segments` only returns suggestions, then the frontend
  inserted **one `academy_courses` row per segment**, each with 1 module and
  1 lesson pointing at the same `training_videos` row. Segment bounds lived
  only on `academy_courses`. Every other webinar series is 1 recording = 1
  course.
- Live groups (`source_video_id` → course ids), all
  `webinar_series = 'The Compliance Lab'` and `ai_generated = true`:
  - `0ebb50c0` Credential Policy (18 Jun 2026) — 55–60, 6 published, 1068 enrollments, 4 progress
  - `7b33bee1` Inclusive Practice (16 Jul 2026) — 61–66, 5 published / 1 draft, 890 enrollments, 1 progress
  - `1b0f7b63` Self-Assurance (21 May 2026) — 69–73, 5 published, 890 enrollments
  - `96ef1444` Assessment Tool Testing (18 Mar 2026) — 78–82, 1 published (79), 179 enrollments
  - `efe1f1a2` Outcome Standards (15 Jan 2026) — 83–94, all draft, 0 enrollments, **segmented twice**
  - `ac7d7f8a` Managing RTO Resources (18 Sep 2025) — 113–118, all draft, 0 enrollments
- 3,027 `academy_enrollments` rows against those 40 ids (unique constraint
  is `(course_id, user_id)` only). 0 certificates, 0 quiz attempts, 5
  `academy_lesson_progress` rows, 2 `pdp_evidence_items` (tied to the two
  `status='completed'` enrollments on courses 56 and 61). Package rules = 0;
  enrollments came from `available_to_all_clients` +
  `fn_academy_autoenrol_on_all_clients_publish`.
- Transcripts on all 40 rows are empty, so there was nothing to copy onto
  lessons. `content_markdown` is rendered as HTML under the video for any
  lesson that has it — dumping a transcript there would have been a UX
  regression.
- Lesson viewer used **course-level** `segment_start_seconds` /
  `segment_end_seconds`. `VimeoPlayer` already seeks/pauses correctly when
  those props are set.
- `academy_lesson_set_minutes_from_video` copied the **full** video duration
  onto every lesson. Six lessons on a 2h recording would have shown ~12h in
  the catalog / PDP until the trigger learned about segment spans.
- Lesson viewer loads assessments with `.maybeSingle()` on `course_id`, so a
  parent course can only have one published quiz. Concatenating 6×8
  questions into a live required quiz would have been a learner-facing
  regression. Combined quizzes are copied unpublished.

## DB changes shipped

- Migration: `supabase/migrations/20260813090000_add_segment_bounds_to_academy_lessons.sql`
  - nullable `academy_lessons.segment_start_seconds` /
    `segment_end_seconds`
  - `academy_lesson_set_minutes_from_video` uses `(end - start) / 60` when
    both bounds are set; trigger now also fires on those columns
  - `training_video_refresh_lesson_minutes` skips segmented lessons
  - Applied via Supabase MCP `apply_migration` to `yxkgdalkbrriasiyyrwk`
- Migration: `supabase/migrations/20260813090100_fn_consolidate_compliance_lab_segments.sql`
  - `fn_consolidate_compliance_lab_segments(p_dry_run boolean DEFAULT true)`
  - `SECURITY DEFINER`, `SET search_path = ''`, `REVOKE ALL FROM PUBLIC` /
    `anon` / `authenticated`, `GRANT EXECUTE TO service_role` only
  - Applied via MCP `apply_migration`
- RPC / trigger sweep before the nullable add: frontend inserts in Quick
  Add / `useCreateLesson` do not need to supply the new columns. No
  `pg_proc` body inserts into `academy_lessons` that would fail on a
  missing NOT NULL (we did not add NOT NULL).
- **Data apply is gated.** `select fn_consolidate_compliance_lab_segments(true)`
  was run against prod at 2026-08-13 08:21 UTC. `applied: false`. No parent
  courses created, no enrollments remapped, no source courses archived.

## Dry-run report (prod, `p_dry_run = true`)

Would create 5 parent courses and archive 28 segment-courses. Would not
touch the 12 Outcome Standards rows.

| Parent title (proposed — Angela to confirm) | Publish? | Lessons | Enrol rows → unique users kept | Progress | PDP |
|---|---|---|---|---|---|
| The Compliance Lab — Credential Policy Implementation (18 Jun 2026) | yes | 6 | 1068 → 178 | 4 | 1 |
| The Compliance Lab — Inclusive Practice and Reasonable Adjustment Plans (16 Jul 2026) | yes | 6 | 890 → 178 | 1 | 1 |
| The Compliance Lab — Self-Assurance and Continuous Improvement Systems (21 May 2026) | yes | 5 | 890 → 178 | 0 | 0 |
| The Compliance Lab — Assessment Validation and Pre-Use Testing (18 Mar 2026) | yes | 5 | 179 → 179 | 0 | 0 |
| The Compliance Lab — Managing RTO Resources (18 Sep 2025) | no (all draft) | 6 | 0 → 0 | 0 | 0 |

Totals: 3,027 source enrollment rows → 713 keeper rows (178+178+178+179);
2,314 duplicates dropped; 5 progress rows remapped; 2 PDP rows remapped;
0 certificates.

Apply sequence (when Angela confirms): insert parent as **draft** (so
autoenrol-on-publish does not fire), migrate enrollments with
`status='active'` (a single-segment completion must not complete the
workshop or re-issue a certificate), copy progress, repoint PDP, delete
source enrollments, archive source courses, then publish parents that had
any published source (autoenrol `ON CONFLICT DO NOTHING` backfills anyone
new).

## Outcome Standards (`efe1f1a2`) — Angela's decision, not encoded

Proposed title: `The Compliance Lab — Implementing the Outcome Standards (15 Jan 2026)`.
All 12 are draft, 0 enrollments.

Suggested keep (not applied): 89, 90, 91, 92, 93, 88.
Suggested drop: 83, 84, 85, 86, 87, 94.

Near-duplicates (overlap seconds):

| A | range | B | range | overlap |
|---|---|---|---|---|
| 83 Introduction to Outcome Standards & Mindset Shift | 17–1393 | 89 Introduction to Outcome Standards and Mindset Shift | 0–1439 | 1376 |
| 84 Defining Outcomes in Practice & Evidence Maturity | 1393–2409 | 90 Defining Outcomes and Practical Examples | 1439–2408 | 969 |
| 85 Translating Standards to Observable Outcomes (Activity) | 2409–3727 | 91 Group Activity: Translating Standards to Outcomes | 2408–3390 | 981 |
| 86 Key Themes and Critical Success Factors | 3727–4737 | 92 Common Themes, Pitfalls, and Reality Check | 3390–4927 | 1010 |
| 87 Mindset Shift, Unchanged Expectations & Common Questions | 4737–5928 | 93 Critical Success Factors and Unchanged Expectations | 4927–5910 | 983 |
| 88 Introduction to Gap Analysis | 6742–11329 | 94 Identifying Gaps: Perceived vs. Defensible Practice | 6902–7780 | 878 (94 is a slice of 88) |

There is a gap in both runs around 5928–6742.

## Code changes

- Quick Add workshop save creates **one** course (Step 1 episode title) with
  one lesson per confirmed segment, writing the new lesson segment columns.
  Review-and-edit-boundaries UX (`WorkshopSegmentSplit`) is unchanged;
  only the commit path and copy changed.
- `AcademyLessonViewerPage` prefers lesson segment bounds, falls back to
  the course-level columns so leftover 1:1 segment-courses still play
  until they are archived.
- Types: `academy_lessons.segment_*` and
  `fn_consolidate_compliance_lab_segments`.

## Decisions

- Create **new** parent courses rather than promoting a segment row, so the
  archived ids remain an audit trail and we do not rename a live published
  course 178 people are enrolled in.
- Do **not** copy `status='completed'` from a single-segment enrollment onto
  the parent. Completing 1 of 6 topics must not issue a workshop
  certificate or re-fire PDP.
- Combined quizzes land unpublished (`is_required_for_certificate=false`)
  so staff can trim before learners see a 40-question mega-quiz.
- One module per parent. The two "Template 1" Inclusive Practice titles
  stay consecutive lessons, not a second module.

## Open questions parked

- Angela confirms the five auto-merge titles (and the Outcome Standards
  keep-list) before anyone calls
  `fn_consolidate_compliance_lab_segments(false)`.
- Whether Quick Add should also guard against the same-Vimeo-URL
  double-submit that created the Diversity Inclusion duplicate (parked in
  `2026-08-13-diversity-inclusion-duplicate-course.md`).
