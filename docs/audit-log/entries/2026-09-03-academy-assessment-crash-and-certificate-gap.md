# Audit: 2026-09-03 — academy assessment submission crash + certificate retry gap

**Trigger:** ad-hoc (surfaced during Phase 2.5 lint-debt work on
`AcademyAssessmentPlayerPage.tsx` — a `react-hooks/exhaustive-deps` fix to
`handleSubmit` led to live-verifying the page, which revealed it crashes to
a full error screen on every load)
**Scope:** the academy assessment submission flow end to end — the crashing
page, the certificate-issuance trigger it feeds into, and whether any real
learners have been silently blocked. Did not touch course/lesson content,
enrollment progress tracking, or any other Academy surface.

## Findings

- **`AcademyAssessmentPlayerPage.tsx` has crashed on every load since the
  file's original commit** (`9ca446b42`, "Add Assessments UI scaffolding",
  2026-04-05) — roughly 5 months, predating this optimization program
  entirely. It called `useBlocker` (React Router), which requires a "data
  router" (`createBrowserRouter`/`RouterProvider`); the app runs a plain
  `<BrowserRouter>` (`App.tsx:110`, confirmed unchanged across the app's
  full git history — never a data router). `useBlocker` throws `useBlocker
  must be used within a data router` on every render, caught by
  `ChunkErrorBoundary` and rendered as "Something went wrong" instead of the
  assessment. Confirmed via `git diff origin/main` that no PR in this
  program (including the batch that added `useCallback` deps around the
  unrelated auto-submit timer) touched the `useBlocker` line itself.
- **Zero rows have ever existed in `academy_assessment_attempts`**, checked
  directly before any test data was added — no learner, on any course, has
  ever completed the submission flow. This isn't a regression; the button
  has never worked.
- **26 certificates have been issued to date, all legitimately** — none
  bypassed a working assessment gate. Cross-referencing `academy_courses`
  currently flagged with a required, published assessment against
  `academy_certificates.issued_at` shows every one of the 9 certificates
  for now-gated courses was issued *before* that course's assessment even
  existed (assessments were bulk-created 2026-08-07 through 2026-08-13;
  those 9 certs were issued 2026-06-12 through 2026-08-07). The
  crash therefore had no *visible* symptom until courses started requiring
  a passing assessment for certification.
- **A second, independent design gap**: `trg_issue_academy_certificate`
  (the trigger that issues a certificate) only fires on `academy_enrollments`
  `UPDATE` — i.e., once, at the moment all lessons are marked complete. If a
  required assessment can't be passed yet (as has always been true here),
  the function returns early with no retry path — no error, no queued job,
  no staff-visible log. Fixing only the frontend crash would not have
  retroactively certified anyone already stuck, since their enrollment had
  already transitioned to `completed` before the fix shipped.
- **7 real learners, 65 enrollments across 44 courses, are currently stuck**
  as of this audit — enrollment `completed`, course `certificate_enabled`,
  a required+published assessment exists, no certificate issued. Earliest
  since 2026-08-10. Breakdown: Sarah Jane Tayag (HPA Training, 41 courses),
  Mandrie Danwatta (Australian College, 15), Ines Van Butsel (TRAYN, 3),
  Cindilee Thompson (Advanced School Of Beauty Therapy, 2), David Arthur
  (Newcastle Rescue and Consultancy, 2), Michelle Southwell (Southern
  Education, 1), Piper Legge (HPA Training, 1).

## Code changes (if this entry accompanies one)

- `src/pages/client/AcademyAssessmentPlayerPage.tsx` (PR #542): removed
  `useBlocker` and its "Leave Assessment?" confirmation dialog (cannot work
  without a data router); replaced with a `window.beforeunload` guard that
  warns on tab close/refresh while there are unsaved answers. In-app
  navigation away mid-assessment is no longer intercepted with a confirm
  prompt — an accepted trade-off against a 100%-reproducing crash. A full
  router migration would restore that protection but is out of scope here.
- Migration `academy_certificate_retry_on_passed_assessment`: extracted the
  certificate-issuance body of `issue_academy_certificate()` into a shared
  `try_issue_academy_certificate(p_enrollment_id, p_issued_trigger)`
  function (identical logic, parameterised so the `metadata.issued_trigger`
  snapshot still records which path fired). `issue_academy_certificate()`
  (the existing enrollment-completion trigger) now delegates to it. Added a
  new trigger, `trg_issue_certificate_on_passed_attempt` (`AFTER INSERT ON
  academy_assessment_attempts`), that calls the same shared function
  whenever a `passed = true` attempt is recorded — covering exactly the
  case above, where the enrollment already completed before a passing
  attempt existed. No backfill migration needed: since zero attempts have
  ever existed, there is nothing to retroactively re-score — the 7 stuck
  learners will be certified automatically the next time they pass the
  (now-working) assessment.
- Verified live end-to-end as the real Demo RTO client persona (not
  SuperAdmin "View as Client"): loaded a real 20-question published
  assessment, answered all questions, submitted successfully, landed on
  the result page with correct score/pass-fail/per-question review — zero
  console errors, confirming the crash is fixed.
- Verified the new trigger directly against a throwaway scenario on the
  same demo account's existing enrollment (temporarily flipped to
  `completed`, confirmed cert issuance held off with no passing attempt,
  inserted a real passing attempt built from the assessment's actual
  correct answers, confirmed a certificate was issued immediately with
  `metadata.issued_trigger = 'late_assessment_pass'`, confirmed a second
  passing attempt did not create a duplicate). Test attempts, the test
  certificate, and the enrollment's status were all deleted/reverted
  afterward — confirmed 0 residual rows and the enrollment back to its
  original `active` state.

## Decisions

- Fixed the frontend crash and the certificate-retry gap as one PR/session
  rather than splitting them, since the retry gap is what turns "the crash
  is fixed" into "certificates actually get issued" — shipping only the
  frontend half would have left the 7 stuck learners silently stuck even
  after they could submit again.
- Did not build a backfill script. There is no case where a learner passed
  the assessment and got silently skipped — the pass has simply never been
  possible. The new trigger handles all current and future cases the moment
  a learner passes.
- Chose `window.beforeunload` over migrating the app to a data router. A
  full `createBrowserRouter` migration would restore in-app navigation
  blocking too, but touches the entire routing architecture — far outside
  the scope of an urgent certification-blocking fix.

## Open questions parked

- Whether to notify the 7 stuck learners directly (or their CSCs) that they
  can now go pass the assessment(s) they'd already unknocked via lesson
  completion — a comms/ops decision, not a code change.
- No automated alerting exists for "certificate issuance silently held off"
  in general (e.g., if `certificate_enabled` is toggled off mid-course, or a
  course is deleted). Not addressed here — flagged for whoever owns Academy
  data integrity going forward.
- Flag to Angela (feature owner): this went untested for ~5 months with no
  QA coverage on the submit action, and had no visible failure signal until
  a course was marked to require it — worth discussing whether new Academy
  features get even minimal Playwright smoke coverage before launch, since
  `npm run e2e:unauth`/`e2e:personas` don't currently include an Academy
  persona (see AGENTS.md → Playwright browser harness, "Coverage gap"
  note).
