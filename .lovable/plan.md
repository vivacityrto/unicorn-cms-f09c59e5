# Fix false "Please enrol" redirect on Academy lesson viewer

## Problem

`src/pages/client/AcademyLessonViewerPage.tsx` decides "not enrolled → redirect" using only `courseLoading` and `lessonLoading`. The acting user (`useAcademyActingUserId`) and the two enrollment queries (`academy-enrollment-detail`, `academy-enrollment-raw`) can still be in flight, leaving `enrollment` momentarily null. Result: actively enrolled users (e.g. `khianbsismundo@gmail.com` on TAS Superhero) can be bounced back with the "Please enrol…" toast.

## Fix scope

Single file: `src/pages/client/AcademyLessonViewerPage.tsx`. No DB, RLS, edge function, migration, or Vimeo changes.

## Changes

1. **Capture loading state from `useAcademyActingUserId`**
   ```ts
   const { userId: actingUserId, isLoading: actingUserLoading } = useAcademyActingUserId();
   ```

2. **Capture loading/fetching from both enrollment queries** by destructuring `isLoading` and `isFetching` from each `useQuery` call:
   - `academy-enrollment-detail` → `enrollmentLoading`, `enrollmentFetching`
   - `academy-enrollment-raw` → `enrollmentRawLoading`, `enrollmentRawFetching`

   Also: their `enabled` currently only requires `course?.id`, which means they fire with `actingUserId == null` and resolve `null`. Tighten `enabled` to `!!course?.id && !!actingUserId && !actingUserLoading` so the queries don't prematurely "succeed" with null and so their loading flags remain true until the acting user is known.

3. **Rewrite the access gate `useEffect` (lines 424–436)** to wait for every dependency before redirecting:
   ```ts
   if (courseLoading || lessonLoading) return;
   if (!course || !lesson) return;
   if (isPreview) return;                       // preview lessons always allowed
   if (actingUserLoading) return;               // wait for impersonation/auth resolution
   if (enrollmentRawLoading || enrollmentRawFetching) return;
   if (isRevoked) {                             // revoked check first, after raw resolves
     toast.error("Your access to this course has been revoked.");
     navigate(`/academy/course/${slug}`, { replace: true });
     return;
   }
   if (enrollmentLoading || enrollmentFetching) return;
   if (isEnrolled) return;
   // Only now: acting user resolved, both enrollment queries settled, not enrolled.
   toast.error("Please enrol in this course to access this lesson.");
   navigate(`/academy/course/${slug}`, { replace: true });
   ```
   Update the dependency array accordingly.

4. **Extend the loading skeleton block** (line 438) to also cover `actingUserLoading` (and the enrollment loading flags for non-preview lessons) so the page doesn't briefly render the "no enrollment" UI before the gate decides. Keep the existing "Lesson not found" branch intact.

5. **Preserve everything else**: `isExpired` derivation, `canTrackProgress` (already requires `isEnrolled`), preview lesson rendering, sidebar nav, lesson progress upserts, auto-complete + course-complete flow, PDP quick-reflection drawer, celebration modal, `useReadOnlyGuard`.

## Behavioural matrix after fix

| State | Outcome |
|---|---|
| Loading (any of course/lesson/acting user/enrollment) | Skeleton, no toast, no redirect |
| Preview lesson, no enrollment | Renders (unchanged) |
| Active enrollment | Renders, progress tracked (unchanged) |
| Revoked | "Access revoked" toast + redirect (unchanged, fires once raw query settles) |
| Expired | Treated as not actively enrolled by `canTrackProgress`; gate behaviour unchanged |
| Truly unenrolled, non-preview | "Please enrol…" toast + redirect (only after all queries settle) |
| Staff impersonation in progress | Waits for `actingUserLoading` before evaluating |

## Verification

- Log in as `khianbsismundo@gmail.com`, open a TAS Superhero lesson directly via URL → no false toast, lesson renders.
- Unenrolled user on a non-preview lesson → still redirected with the enrol toast after queries finish.
- Preview lesson without enrollment → renders.
- Revoked enrollment → "Access revoked" toast + redirect.
- Expired enrollment → no progress writes (unchanged).
- Lesson progress, auto-complete, course-complete celebration, PDP reflection drawer → unchanged.
