## Academy: Estimated Minutes Auto-Calc UI

Backend (DB view `v_academy_course_total_minutes`, triggers, edge function `backfill-vimeo-durations`) is already in place. This plan is frontend-only.

### Part A — Course Builder helper text + "Use this value"

File: `src/pages/superadmin/AcademyBuilderCourse.tsx`

1. Add a second `useQuery` next to the existing course query, keyed `["academy-course-total-minutes", courseId]`, that selects `total_lesson_minutes, lesson_count, video_lesson_count` from `v_academy_course_total_minutes` where `course_id = courseId` (`.maybeSingle()`).
2. Invalidate this query inside `useCreateLesson` / `useUpdateLesson` / `useDeleteLesson` / `useCreateModule` / `useDeleteModule` mutations OR add it to the existing invalidations in `useAcademyModulesLessons.ts` so it refreshes when lessons change. Simplest: invalidate it from `handleSaveSettings.onSuccess` and from the modules-with-lessons hook's mutation `onSuccess` callbacks.
3. Under the "Estimated Minutes" `<Field>` (lines ~371-377), render helper text with three states based on the totals row:
   - `total_lesson_minutes > 0`: muted text `Auto-calculated from lessons: {n} min ({lesson_count} lessons, {video_lesson_count} with video).` followed by an inline link/button "Use this value" that sets `formState.estimated_minutes = total_lesson_minutes` (does NOT auto-save; user still clicks Save Changes).
   - `lesson_count > 0 && total_lesson_minutes === 0`: `Lessons have no durations yet. Run "Backfill video durations" from Academy admin tools, or set lesson minutes manually.`
   - `lesson_count === 0`: `Add modules and lessons to see an auto-calculated total.`
4. Hide "Use this value" if the current `formState.estimated_minutes` already equals `total_lesson_minutes`.

The course-level `estimated_minutes` remains a manual field; no auto-overwrite.

### Part B — Backfill Video Durations button

File: `src/pages/superadmin/AcademyBuilderLibrary.tsx` (the SuperAdmin Academy admin entry page; same place where new courses are created — the natural admin tools home)

1. Add a secondary outline button in the header next to "New Course": `Backfill Video Durations from Vimeo`.
2. On click, open an `AlertDialog` with body "This will fetch durations from Vimeo for all videos missing duration data. It runs in batches and can be re-clicked safely. Continue?" and Continue/Cancel actions.
3. On confirm, call:
   ```ts
   const { data, error } = await supabase.functions.invoke('backfill-vimeo-durations', { body: { batchSize: 200 } });
   ```
   Show a sonner toast while in flight, then a result toast: `Updated {updated}, skipped {skipped}, errors {errors}. Remaining: {remaining_null}.`
4. Disable the button while pending. If `remaining_null > 0`, surface a follow-up toast/dialog with a "Run again" action that re-invokes the function. After completion, invalidate `["video-library"]` and `["academy-course-total-minutes"]` queries.

### Part C — Lesson editor video duration badge

File: `src/components/academy/builder/LessonEditorPanel.tsx`

1. The video picker already lists `useVideoLibraryPicker` results. Extend that picker hook (`src/hooks/academy/useAcademyBuilderPickers.ts`) to also select `duration_seconds` (it likely already selects basic fields — confirm and add `duration_seconds` to the select list if missing).
2. When a `videoId` is selected, find the matching video in the picker results and compute `~{ceil(duration_seconds/60)} min`. Render a small badge next to the "Video" section heading: `🎬 ~{n} min from video` (or "duration unknown" if null).
3. When `lessonType === "video"` and a `videoId` is selected, render the `Estimated Minutes` input as `readOnly` with a muted helper line: "Auto-set from video duration on save." For `lessonType === "video"` with no video selected yet, leave it editable so users can preview.
4. For `text` and `resource` lesson types, behaviour is unchanged (manual input).

No mutation logic changes — the DB trigger `trg_academy_lesson_set_minutes_from_video` overrides whatever value is sent for video lessons.

### Out of scope (per the prompt)

- No change to `import-vimeo-training` import path.
- No trigger to auto-overwrite `academy_courses.estimated_minutes`.
- No per-course backfill button.
- No new tables, columns, or RLS changes.

### Acceptance walk-through

- Open course id 18 → Estimated Minutes editable (from prior fix), helper text shows totals or empty-state message.
- Click "Backfill Video Durations" in Academy Builder library → toast reports progress; helper text on courses with video lessons updates after invalidation.
- Click "Use this value" → input pre-fills; Save Changes → persists; refresh confirms.
- Manually type a buffered value → Save → persists; helper text still shows auto-calc separately.
- In LessonEditorPanel, picking a video shows the `🎬 ~N min from video` badge and locks the minutes input for video lessons.
