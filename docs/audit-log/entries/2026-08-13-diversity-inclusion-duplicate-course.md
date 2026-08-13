# Audit: 2026-08-13 — Duplicate "Diversity Inclusion Cultural Safety" course archived

**Trigger:** drift-surfaced
**Scope:** `academy_courses` and its dependent enrollment/completion data for this
one title. Not a broader sweep beyond confirming no other title in the catalog
had the same issue.

## Findings

- Surfaced by Carl noticing the same course title twice in the "Latest
  Recordings" dashboard widget, right after that widget was repointed to sort
  by `delivery_date` (see the academy course-card/date work landing the same
  day) — the duplication existed before that change but wasn't as visible
  under the old video-upload-time sort.
- Two `academy_courses` rows, both titled "Diversity Inclusion Cultural
  Safety": id 43 (slug `diversity-inclusion-cultural-safety`, created
  2026-08-07 09:53:26 UTC) and id 45 (slug
  `diversity-inclusion-cultural-safety-2`, created 2026-08-07 09:55:45 UTC —
  2 minutes 19 seconds later). Same `delivery_date` (2026-08-03), same
  `source_video_id`, same `webinar_series` ("Inside VET"), both `published`.
  The auto-deduped `-2` slug is the signature of "Quick Add Recording" run
  twice against the same Vimeo video in quick succession — most likely an
  accidental double-submit.
- Swept the full non-archived catalog for other title collisions — this was
  the only duplicate pair.
- Both courses had **178 enrollments each**, and it's the exact same 178
  users enrolled in both (confirmed via a join on `user_id`) — real clients
  had been auto-enrolled into both copies independently, not a display
  artefact. One enrollment on course 43 was `completed`; course 45 had zero
  completions and neither course had an issued certificate.

## Code changes (if this entry accompanies one)

- None — this entry is data-only, no schema or application code changed.

## Decisions

- Archived course 45 (`status = 'archived', archived_at = now()`) via the
  same mechanism the app's own Archive action uses, rather than a hard
  delete — permanent delete is blocked by `usePermanentDeleteCourse()` once
  a course has enrollments anyway, and archiving is the same treatment a
  prior duplicate-cleanup in this codebase used (`docs/audit-log/entries/
  2026-08-12-manage-documents-duplicate-cleanup.md`).
- Kept course 43 as the sole live copy since it carries the one real
  completion; archiving 45 leaves that learner's progress intact rather than
  orphaning it.
- Did not migrate or delete course 45's 178 enrollment rows — they remain in
  the database as harmless historical residue, invisible to clients since
  the course itself is archived.
- Live-verified post-archive: the duplicate no longer appears in the
  dashboard's Latest Recordings widget (which correctly backfilled the fifth
  slot with the next real course).

## Open questions parked

- Whether the "Quick Add Recording" flow should get an explicit
  same-Vimeo-URL-in-the-last-few-minutes guard to prevent a repeat of this
  specific double-submit pattern — not actioned here, parked as a possible
  small follow-up.
