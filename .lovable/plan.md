

## Plan: Academy Lesson Viewer — already built

This viewer was implemented earlier in this session at `src/pages/client/AcademyLessonViewerPage.tsx` (wrapped by `AcademyLessonViewerWrapper.tsx`). Every acceptance item in the spec is already in place.

| Acceptance item | Implementation |
|---|---|
| Progress saves every 10s | Vimeo SDK `timeupdate` listener throttled to 10,000 ms |
| Auto-complete at `completion_threshold` | `autoCompleteLesson()` fires when `pct >= completionThreshold` |
| Manual "Mark as complete" gated at 50% | `markComplete` mutation, gated by `effectivePercent >= 50` |
| Last lesson flips enrollment to completed | Server trigger `trg_academy_complete_enrollment_on_progress` + client refetch |
| Certificate row auto-appears | Existing `trg_issue_academy_certificate` trigger |
| Preview banner for unenrolled + preview lesson | Renders when `isPreview && !isEnrolled` with "Enrol now" CTA |
| Unenrolled + non-preview → toast + redirect | Access gate `useEffect` |
| Sidebar checkmarks + locks | `completedLessonIds` + `is_preview` gating |
| Prev/Next + position flush before navigate | `flushAndNavigate()` upserts `last_position_seconds` first |
| Expired enrollment banner | Yellow banner when `isExpired`; `canTrackProgress` disables writes |
| Revoked enrollment redirect | Access gate handles `isRevoked` |
| Completion celebration modal | `AppModal` triggered when status flips active → completed |
| Video error placeholder | `setVideoError(true)` swaps in fallback card |
| Mobile responsive (sidebar drawer + 16:9 video) | Already in place |

### One deliberate deviation

The route is `/academy/course/:slug/lesson/:lessonId` (singular), not the spec's `/academy/courses/:courseSlug/lessons/:lessonId` (plural). This was a prior decision because `App.tsx`, the course detail page, and existing deep links all use the singular form. Renaming would break in-flight notification/email links.

If you need the plural pattern (e.g. for a marketing email already in flight), say the word and I'll add the plural route as an alias alongside the existing one — both will resolve to the same component, no breakage.

### What I recommend

Rather than rebuild, please test the live viewer. Likely targets to verify:

1. Open an enrolled lesson → play 10s → confirm a row appears in `academy_lesson_progress` with `last_position_seconds > 0`.
2. Watch past `completion_threshold` (default 90%) → confirm `is_completed = true` and the sidebar checkmark appears.
3. Finish the last lesson → confirm enrollment flips to `completed`, modal renders, certificate row appears in `academy_certificates`.
4. Unenrolled hit on a non-preview lesson → toast + redirect.
5. Unenrolled hit on a preview lesson → preview banner shown, no progress writes.
6. Set `expires_at` in the past on a test enrolment → yellow banner, mark-complete disabled.

If any item misbehaves, share the observed vs expected behaviour and I'll target a fix. If you want the plural route alias added, confirm and I'll do that as a one-line `App.tsx` edit.

