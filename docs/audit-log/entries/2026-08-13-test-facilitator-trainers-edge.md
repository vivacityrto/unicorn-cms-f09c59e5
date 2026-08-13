# Audit: 2026-08-13 — "Test CSC" facilitator corrected on 6 Trainers Edge courses

**Trigger:** drift-surfaced
**Scope:** `academy_courses.facilitator_id` across the published catalog. Not a
broader review of other facilitator fields (e.g. `created_by`).

## Findings

- Surfaced by Carl noticing "Test CSC" as the shown facilitator on courses in
  the Compliance Manager pathway grid, immediately after the course-card
  date/facilitator work (see the same day's academy course-card PRs) made
  facilitator names visible to learners for the first time.
- "Test CSC" is a real `users` row (`carl+csc@vivacity.com.au`,
  `is_vivacity_internal = true`) — a test/demo account, not a real trainer.
- Of 62 published courses with a facilitator set, 56 show Angela
  Connell-Richards and exactly 6 showed "Test CSC" — the entire "Trainers
  Edge" webinar series (course ids 48, 50, 51, 52, 53, 54), all created in
  the same 8-minute window on 2026-08-07. Classic signature of someone
  batch-creating that series while logged in as their own test account, with
  the facilitator field never corrected afterwards.
- No other facilitator besides these two existed anywhere in the published
  catalog, so there was no ambiguity about who the real presenter should be.

## Code changes (if this entry accompanies one)

- None — data-only.

## Decisions

- Updated `facilitator_id` on the 6 affected courses to Angela
  Connell-Richards's `user_uuid`, matching the pattern on all other courses.
  Carl confirmed before applying.
- Live-verified: "Test CSC" no longer appears anywhere in the published
  catalog (`select count(*) ... = 0`), and the Trainer Hub pathway page (home
  of the Trainers Edge series) no longer shows it.

## Open questions parked

- Whether the course-builder's facilitator picker should default to nothing
  / require explicit selection, rather than silently carrying over whichever
  user is currently logged in — not actioned here, parked as a possible
  small follow-up alongside the same-Vimeo-URL double-submit guard noted in
  the duplicate-course entry above.

## Correction (2026-08-13, same day)

- Carl confirmed the real presenter for the Trainers Edge series was Samantha
  Holtham, not Angela Connell-Richards — the initial decision above assumed
  Angela because she was the only *other* facilitator anywhere in the
  catalog, but that assumption was wrong for this series specifically.
- No `users` row exists for Samantha Holtham yet (checked by name and email),
  so she isn't currently selectable in the facilitator picker — likely how
  "Test CSC" leaked in during the original batch import in the first place.
- Reverted `facilitator_id` to `null` on all 6 courses (48, 50, 51, 52, 53,
  54) rather than guess again. Once Samantha has a `users` row, assign her
  via Course Cleanup (`/superadmin/academy/course-cleanup` → "Missing
  facilitator" filter).
