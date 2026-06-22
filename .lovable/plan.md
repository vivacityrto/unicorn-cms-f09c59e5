## Overview
Add a "Latest Recordings" section to the Academy Dashboard that displays the 5 most recently uploaded training videos as a vertical stacked list. Each card links directly to its associated lesson.

## Files to Change

### 1. Create `src/hooks/academy/useLatestRecordings.ts`
New TanStack Query hook that fetches the 5 latest `training_videos` records, joins to `academy_lessons` (via `video_id`) and `academy_courses` (via `course_id`), filters for published video lessons, and returns flattened metadata including `lessonId` and `courseSlug` for routing.

### 2. Edit `src/pages/client/AcademyDashboardPage.tsx`
- Import `PlayCircle` from `lucide-react` and `useLatestRecordings` from the new hook.
- Call the hook inside the component body.
- Insert the "Latest Recordings" `<Card>` block between the existing "My Courses" `</Card>` (line 223) and the "Team Progress" `<Card>` (line 225).
- The section uses a stacked list layout matching "My Courses": rows rendered inside `CardContent` with `space-y-3`, each row as a full-width `Link` with `flex items-center gap-4 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors`.
- Loading state shows 3 skeleton rows (matching the My Courses skeleton style).
- Empty state shows the same centered muted style as My Courses.
- Each row displays: thumbnail image (or a `PlayCircle` fallback in a coloured square), video name, folder name dot-duration meta line, and a `ChevronRight` arrow.

## Notes
- `Link`, `ChevronRight`, `Skeleton`, and `formatDuration` are already imported — no new dependencies.
- No database schema or RLS changes required.
- Cards link to `/academy/course/{courseSlug}/lesson/{lessonId}`.