## Fix "0 lessons" on unenrolled Academy course cards

**File:** `src/hooks/useAcademyCourses.ts` — `useAcademyCourses` query function only.

**Problem:** `total_lessons` is read from `v_academy_course_progress`, which only has rows for enrolled users. Unenrolled courses fall through to `?? 0`, so every card shows "0 lessons".

**Change:** After fetching `courses`, run a second query in parallel with the progress query to count published lessons per course directly from `academy_lessons`, then use it as a fallback.

```ts
const courseIds = courses.map((c) => c.id);

const [progressRes, lessonsRes] = await Promise.all([
  user
    ? supabase
        .from("v_academy_course_progress")
        .select("course_id, enrollment_status, progress_percentage, completed_lessons, total_lessons, has_certificate, certificate_number")
        .eq("user_id", user.id)
    : Promise.resolve({ data: null }),
  supabase
    .from("academy_lessons")
    .select("course_id")
    .eq("is_published", true)
    .in("course_id", courseIds),
]);

const lessonCountMap = new Map<number, number>();
for (const l of (lessonsRes.data ?? []) as { course_id: number | null }[]) {
  if (l.course_id == null) continue;
  lessonCountMap.set(l.course_id, (lessonCountMap.get(l.course_id) ?? 0) + 1);
}
```

Then in the final `courses.map(...)`:

```ts
total_lessons: p?.total_lessons ?? lessonCountMap.get(c.id) ?? 0,
```

All other resolved fields (`enrollment_status`, `progress_percentage`, `completed_lessons`, `has_certificate`, `certificate_number`) and the rest of the file (dashboard stats, my-courses, helpers) remain unchanged.

### Risk
Negligible. One extra `.in()` query against `academy_lessons` per courses fetch; runs in parallel with the existing progress query. No schema, RLS, or interface changes. Enrolled users keep their progress-view count (which reflects what's counted toward completion); unenrolled users now see the real published-lesson count instead of 0.
