

## Plan: Academy Lesson Viewer — finish the spec

The viewer at `src/pages/client/AcademyLessonViewerPage.tsx` already covers ~70% of the spec (sidebar, prev/next, mark-complete, preview gating, breadcrumb, Vimeo iframe). This plan adds the missing pieces and hardens what's there.

**Route stays as the existing `/academy/course/:slug/lesson/:lessonId`** — not the spec's `/academy/courses/:courseSlug/lessons/:lessonId`. The existing route is wired into `App.tsx`, the course detail page, and any deep-links already in the system. Renaming would break links.

### 1. Install Vimeo Player SDK
- Add `@vimeo/player` (and `@types/vimeo__player` if needed).

### 2. Auto-progress tracking via Vimeo SDK
In `AcademyLessonViewerPage.tsx`, replace the static iframe with a ref-attached one and wire up the SDK:

- On `play` → upsert `started_at` (only if enrolled, not preview, not expired).
- On `timeupdate` (throttled to every 10s) → upsert `last_position_seconds`, `watch_seconds`, `completion_percentage`.
- Auto-complete when `completion_percentage >= lesson.completion_threshold` (default 90 if null) AND not yet completed.
- On `ended` → upsert `is_completed: true, completion_percentage: 100`.
- Append `?texttrack=en&autoplay=0&title=0&byline=0&portrait=0` to the embed URL.
- Resume from `last_position_seconds` on load via `player.setCurrentTime()`.

Keep the existing `markComplete` mutation logic for the manual button (it already cascades into course-completion + enrollment status flip).

### 3. Manual "Mark complete" — gate at 50%
Show the button only when enrolled, not already complete, AND `progress.completion_percentage >= 50`. Track local `completion_percentage` state from the SDK so the button enables live.

### 4. Course-completion celebration modal
- Add a `<Dialog>` (use `AppModal` from the unified modal system) shown when the enrollment status flips from `active` → `completed` during this session.
- Detect via `useEffect` watching `enrollment.enrollment_status` against a ref of the previous value.
- Modal: 🎉 "Course complete!" + body + two CTAs: "View certificates" → `/academy/certificates`, "Back to Academy" → `/academy`.

### 5. Expired enrollment banner
- Fetch `expires_at` and `revoked_at` directly from `academy_enrollments` (current viewer reads from `v_academy_course_progress` which omits these). Add a small parallel query.
- If `revoked_at` is set → redirect to course page with toast.
- If `expires_at < now()` → render a yellow banner: "Your access to this course has expired. Contact your admin." Disable mark-complete and progress writes. Preview lessons remain navigable.

### 6. Sidebar — preview lock for unenrolled users
The current sidebar lets unenrolled users click any lesson (which then redirects them). Update to:
- If unenrolled and `lesson.is_preview === false` → render a disabled row with a `Lock` icon + tooltip "Enrol to unlock".
- Preview lessons stay clickable.
- Also fetch `is_preview` in the modules sidebar query (currently missing from the select).

### 7. Preview banner for unenrolled users
Add a persistent banner above the video when `isPreview && !isEnrolled`:
"You're viewing a preview. Enrol in this course to track your progress and earn your certificate." + cyan "Enrol now" button → triggers the same enrol mutation pattern as `AcademyCourseDetailPage`.

### 8. Sanitize `content_markdown`
Current code uses raw `dangerouslySetInnerHTML` — XSS risk. Wrap with `sanitizeHtml` from `@/lib/sanitize`.

### 9. Save position before navigating
Hook prev/next button clicks to flush a final `upsertProgress({ last_position_seconds })` before `navigate()`.

### 10. Video unavailable placeholder
Wrap the iframe in an error boundary listener (`player.on('error', ...)`) → swap to a "Video unavailable. Please try again or contact support." card.

### 11. Database — completion_threshold column (verify + default)
- Verify `academy_lessons.completion_threshold` exists. If not, add a migration: `ALTER TABLE academy_lessons ADD COLUMN completion_threshold smallint NOT NULL DEFAULT 90;`
- The frontend reads this per-lesson; falls back to 90 if null.

### 12. RLS sanity
Already correct — `academy_lesson_progress` enforces `user_id = auth.uid()` for writes. No migration needed.

### Out of scope (per spec)
- Server-side trigger `trg_academy_complete_enrollment_on_progress` and `trg_issue_academy_certificate` — the spec says these are pre-applied. Current code handles course-completion client-side, which works. Will leave that intact as a fallback; if the triggers do exist server-side they'll just no-op the client logic harmlessly.
- Assessments, comments, notes, bookmarks, resource downloads.

### Files changed
- `src/pages/client/AcademyLessonViewerPage.tsx` — main refactor (Vimeo SDK, banners, modal, sanitization, sidebar locks, expired state).
- `package.json` — add `@vimeo/player`.
- (Conditional) Migration: `ALTER TABLE academy_lessons ADD COLUMN completion_threshold ...` if not present.

### Acceptance verification (post-build)
- Open an enrolled lesson → play 10s → confirm a row in `academy_lesson_progress` with `last_position_seconds > 0`.
- Watch past threshold → row flips `is_completed = true`, sidebar checkmark appears live.
- Finish last lesson → enrollment flips to `completed`, celebration modal renders, certificate row appears in `academy_certificates`.
- Hit a non-preview lesson while unenrolled → toast + redirect to course.
- Hit a preview lesson while unenrolled → preview banner shown, no progress writes occur.
- Set `expires_at` in the past on a test enrollment → expiry banner renders, mark-complete disabled.

