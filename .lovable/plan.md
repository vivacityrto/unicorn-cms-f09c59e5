

## Plan: Wire Course Cards to Course Detail Page

### Problem
The "Start Course" and "Continue" buttons on all course cards do nothing — no `onStart`/`onContinue` callbacks are passed, and no course detail page exists.

### What will be built

1. **Course Detail Page** (`src/pages/client/AcademyCourseDetailPage.tsx`)
   - Route: `/academy/course/:slug`
   - Displays course title, description, modules and lessons list
   - Fetches course data by slug from `academy_courses`
   - Fetches modules/lessons from `academy_modules` and `academy_lessons`
   - Shows enrollment status and progress
   - "Enrol" button for unenrolled users (inserts into `academy_enrollments`)
   - Uses `AcademyPageWrapper` with dynamic breadcrumb
   - Wrapped in `AcademyAccessGate` via a wrapper component

2. **Route Registration** (`src/App.tsx`)
   - Add `/academy/course/:slug` route with lazy loading

3. **Wire Navigation on All 5 Role Pages**
   - Pass `onStart` / `onContinue` callbacks to every `CourseCard` that navigate to `/academy/course/${course.slug}`
   - Files: `TrainerHubPage`, `ComplianceManagerPage`, `GovernancePersonPage`, `StudentSupportOfficerPage`, `AdministrationAssistantPage`

4. **Make entire CourseCard clickable**
   - Wrap the card in a clickable container so users can click anywhere (not just the button)
   - Add an `onClick` prop to `CourseCard` for the card-level click
   - Keep `onStart`/`onContinue` buttons as they are (they'll navigate to the same place)

### Technical details

- Navigation uses `useNavigate()` from react-router-dom
- Course slug is already stored in `academy_courses.slug`
- Modules/lessons fetched using the existing `useModulesWithLessons` pattern from `src/hooks/academy/useAcademyModulesLessons.ts`
- The detail page will show a structured module/lesson outline (accordion-style) rather than video playback (no player built yet)

