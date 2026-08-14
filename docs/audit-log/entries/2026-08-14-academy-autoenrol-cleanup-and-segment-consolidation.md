# Audit: 2026-08-14 — Academy mass-autoenrol data cleanup, segment-course consolidation, and Quick Add tag catalog integration

**Trigger:** ad-hoc — direct follow-on to the same day's earlier
`academy-mandatory-autoenrol-toggle` and `compliance-lab-segment-consolidation`
work. Carl asked to (1) actually clean up the enrolment/timeline data left by
the retired mass-autoenrol trigger and (2) resolve the 40 pre-fix Quick Add
segment-courses that a prior session had only dry-run-planned, not applied.
**Scope:** `academy_enrollments`/`client_timeline_events` data cleanup, applying
`fn_consolidate_compliance_lab_segments`, redoing one recording through Quick
Add, and a tagging-quality fix surfaced along the way. Did not touch the
sibling `fn_academy_autoenrol_on_package_instance` trigger's identical
`academy_access_enabled` gap, `academy_max_users` seat caps, or the "New
Course" button — all still parked from the earlier entry.

## Findings

- All 9,674 `academy_enrollments` rows with `source = 'auto_all_clients'`
  predate the 14 Aug entitlement-aware-toggle migration (`enrolled_at` ranged
  2026-08-07 to 2026-08-13) — confirms zero came from the new toggle-gated
  trigger, which reuses the same source label but requires an explicit
  per-course opt-in that was never turned on.
- Of those 9,674: **9,641 had zero engagement whatsoever** (no lesson
  progress, no assessment attempt, no certificate, not completed) — pure
  noise. **33 were real**: 21 completed, 12 mid-progress, spread across 25
  courses and several tenants.
- 3,027 of the 9,674 sat on the 40 pre-fix Quick-Add segment-courses (the
  same population the earlier `fn_consolidate_compliance_lab_segments`
  dry-run reported as "3,027 enrollments → 713 keepers"). 3,022 of those were
  the same zero-engagement junk — meaning the dry-run's "713 keepers" number
  was almost entirely bug residue, not real learners. Only 5 of the 3,027
  were real (across 2 of the 6 recordings).
- Applying the consolidation function for real (first attempt) failed:
  `record "r" has no field "package_id"`. Root cause — a genuine bug never
  caught by the prior session's dry-run-only testing: the lesson-insert loop
  declares `r record` and keeps it in scope after the loop ends; a later
  `academy_package_course_rules r` table alias in the same function collided
  with it, so plpgsql resolved `r.package_id` against the stale lesson record.
  The failed call was a single statement/transaction — verified nothing was
  partially committed before fixing it.
- Live-testing the *fixed* Quick Add flow against the "Outcome Standards"
  recording (previously segmented twice, producing 12 overlapping duplicate
  courses with no clean keep-list) surfaced a separate, real tagging-quality
  bug: `TagChipInput` force-kebab-cased every typed/clicked tag
  (`toKebab`), while the actual 162-tag catalog convention is lowercase
  **with spaces** (`normalizeTagValue` in `useAcademyTagManagement.ts`).
  Clicking an existing "rto compliance" suggestion silently created a
  near-duplicate "rto-compliance" instead of reusing it. Quick Add also never
  wired `TagChipInput`'s `suggestions` prop at all (unlike the course
  builder, which already does), and its AI classification prompt had zero
  awareness of the existing tag catalog — each of a workshop's 8 segments
  called `generate_classification` independently, blind to what the other 7
  segments picked, producing e.g. "quality assurance" / "quality_assurance" /
  "quality" as three separate tags on one course (confirmed live: the
  freshly-created course landed with 32 tags across 8 segments).

## Code changes (this entry accompanies these)

- Migration `fix_consolidate_compliance_lab_segments_alias_collision` (applied
  via `apply_migration`): renamed the colliding table alias
  (`academy_package_course_rules r` → `pcr`) in
  `fn_consolidate_compliance_lab_segments`. No other logic changed.
- `src/components/academy/TagChipInput.tsx`: replaced `toKebab` with
  `normalizeTag` (lowercase + collapsed whitespace, no forced hyphenation) —
  matches the real catalog convention; affects both Quick Add and the course
  builder's tag input.
- `src/pages/superadmin/AcademyQuickAddPage.tsx`: added a
  `fetchDistinctAcademyTags` query (same source Tag Management and the course
  builder use) and wired it into `TagChipInput`'s `suggestions` prop; both
  `generate_classification` call sites now pass `existing_tags`, seeded from
  the platform catalog and grown with each segment's own chosen tags as the
  workshop-split loop runs, so segment 2 onward reuses segment 1's phrasing
  instead of coining a variant.
- `supabase/functions/academy-ai-generate/index.ts` (`generate_classification`
  action, deployed): accepts `existing_tags`, injects up to 300 into the
  prompt with instructions to reuse a cataloged tag when it genuinely fits.

## Data cleanup (no code, applied directly)

- Deleted the 9,641 zero-engagement `auto_all_clients` enrolment rows and
  their 9,641 matching `academy_enrolled` timeline events (hard delete, not
  the product's soft-revoke RPC — the soft-revoke path doesn't touch timeline
  events and the consolidation function doesn't filter on `status`, so a
  revoke-only cleanup would have been silently re-migrated as fresh "active"
  enrolments by the very next step). The 33 real rows were left untouched.
- Applied `fn_consolidate_compliance_lab_segments(false)` for the 5 clean
  recordings: 28 source courses archived, 5 new parent courses created (ids
  137–141), 5 genuinely-real enrolments carried over (matches the pre-cleanup
  count exactly — the cleanup above is what made this number accurate instead
  of 713). 3 of the 5 parents auto-published (matching source-course publish
  state), correctly firing the same-day `academy_course_published` timeline
  event with the "A staff member" fallback attribution (the consolidation
  never set `published_by`, expected since this was a backend operation, not
  a real staff publish click).
- Archived the 12 duplicate-segmented "Outcome Standards" courses (ids
  83–94) — verified zero real enrolments remained on them.
- Redid that recording (`vimeo.com/1154916086`) through the live, fixed Quick
  Add flow end-to-end (real browser session, not a script): 8
  non-overlapping AI-generated segments, one draft course (id 142, "The
  Compliance Lab", facilitator Angela Connell-Richards, delivery date
  2026-01-15 matching the source recording), 8 lessons, one 64-question
  combined quiz. Left in `draft` status for normal review before publish —
  not auto-published.

## Verification

- Confirmed the failed consolidation attempt left zero partial state (28
  courses still non-archived, 0 new parent courses) before applying the fix.
- Post-cleanup dry-run of the consolidation function showed exactly 5 unique
  users kept (down from the pre-cleanup 713), matching the 5 real engaged
  rows identified independently.
- Spot-checked all 5 new parent courses: correct lesson counts, correct
  `parent_enrollments_after`, correct publish state.
- Live-verified the tag fix in the browser: typing/adding "training delivery"
  via the course builder's `TagChipInput` (same component, already wired with
  suggestions) landed as `training delivery`, not `training-delivery`; test
  tag removed immediately after.
- `npx tsc --noEmit` clean on both edited frontend files.

## Decisions

- Hard-delete over soft-revoke for the enrolment cleanup, specifically
  because the consolidation function migrates by `user_id` regardless of
  `status` — a revoke-only cleanup would have been invisibly undone by the
  very next step in this same session.
- Left course 142's 32 unioned tags as-is rather than retroactively cleaning
  them — the course is still in draft and goes through the same human review
  every Quick Add course already requires; the fix here is preventing this
  going forward, not backfilling one course's tags.

## Open questions parked

- Course 142's own tags could still use a manual trim/merge pass before
  publish (same kind of near-duplicates the tag-catalog fix now prevents
  going forward).
- Sibling trigger `fn_academy_autoenrol_on_package_instance` has the same
  missing `academy_access_enabled` check as the retired all-clients trigger —
  not touched this session.
