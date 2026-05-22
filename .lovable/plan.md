## Academy Breadcrumb Bug Fixes

### Bug 1 — Remove redundant breadcrumb from AcademyTopBar

`AcademyTopBar.tsx` currently renders a URL-derived breadcrumb (e.g. "Academy Dashboard > Academy") in the header bar. Every Academy page also renders its own hand-crafted breadcrumb below (via `AcademyPageWrapper` or inline). This produces two breadcrumb trails on the same page.

**File:** `src/components/layout/AcademyTopBar.tsx`

**Changes:**
1. Remove the breadcrumb `<nav>` block (lines 119–133) inside the `showBreadcrumbs && (...)` conditional.
2. Remove the `getBreadcrumbs` function (lines 50–67).
3. Remove the `breadcrumbs` variable (line 78) and `showBreadcrumbs` variable (line 79).
4. Remove the now-unused `ChevronRight` import from `lucide-react` (verify it is unused in this file after the above removals).

**Keep:** `academyRouteTitles` constant — it is still used for the `pageTitle` heading (`<h1>` at line 135).

### Bug 2 — Prevent "Vivacity Academy > Vivacity Academy"

`AcademyPageWrapper.tsx` always renders `Vivacity Academy > {title}`. The dashboard page (`AcademyDashboardPage.tsx`) passes `title="Vivacity Academy"`, producing a duplicate label.

**File:** `src/components/academy/AcademyPageWrapper.tsx`

**Changes:**
1. Conditionally render the `<ChevronRight />` and trailing `<span>{title}</span>` only when `title !== "Vivacity Academy"`.
2. On the dashboard, the breadcrumb shows only the "Vivacity Academy" link with no chevron and no trailing label. On sub-pages, the full path is preserved.

**No change needed for:** `src/pages/client/AcademyCourseDetailPage.tsx` — its inline breadcrumb uses `course.title`, which can never equal "Vivacity Academy".

### Verification

- `/academy` (dashboard): exactly one breadcrumb reading "Vivacity Academy" (no chevron, no duplicate).
- `/academy/courses`, `/academy/events`, etc.: exactly one breadcrumb reading "Vivacity Academy > <Page Title>".
- Staff top bar (`TopBar.tsx`) is untouched — no regression.
- Build passes with no orphaned imports.
