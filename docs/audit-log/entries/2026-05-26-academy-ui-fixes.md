# Audit: 2026-05-26 — Academy UI Fixes (PDP duplicate heading, button label, lesson top bar, sidebar readability)

**Trigger:** Ad-hoc — four UI issues identified by visual inspection of the Academy PDP and course lesson viewer pages.  
**Author:** Khian (Brian)  
**Scope:** Academy UI only — no database changes, no migrations, no RLS changes. Four files edited via Lovable across two prompts.  
**Supabase project:** n/a — UI-only session.

---

## Findings

### Fix 1 — "My Professional Development Plan" heading appeared twice on the PDP page

**Problem:** The `AcademyPageWrapper` rendered a page-level `title` prop ("My Professional Development Plan" + subtitle + Target icon) at the same time as `PdpHeaderBand` rendered an identical `<h1>` inside the content area. Both were visible simultaneously.

**Root cause:** `PdpHeaderBand` was introduced as a richer, status-aware heading (with cycle status badge and audience label) but the `AcademyPageWrapper` title props were never removed.

**Fix — `src/pages/academy/pdp/index.tsx`:** Removed `title`, `subtitle`, and `icon` props from the `AcademyPageWrapper` call. Removed the now-unused `Target` import. `PdpHeaderBand` is now the sole heading source on the PDP page.

---

### Fix 2 — "Open my PDP cycle" button label

**Problem:** The action row button navigated to the full PDP cycle detail view but was labelled "Open my PDP cycle" — verbose and inconsistent with other button labels in the app.

**Fix — `src/components/academy/pdp/PdpActionRow.tsx`:** Label changed to "Open my PDP". All other behaviour, icon, and styling unchanged.

---

### Fix 3 — Academy top bar showed raw lesson ID ("2") on lesson pages

**Problem:** On lesson viewer URLs (`/academy/course/:slug/lesson/:id`), the `titleFromPath` function in `AcademyTopBar` derived the page title from the last URL segment — the numeric lesson ID — and rendered it as "2" (or similar) next to "Academy" in the top bar.

**Root cause:** `titleFromPath` had no guard for lesson routes. The lesson content area already renders a full breadcrumb (Academy → Course → Lesson title), so the top bar value was both wrong and redundant.

**Fix — `src/components/layout/AcademyTopBar.tsx`:** Added an early-return guard: any path matching `/academy/course/*/lesson/*` returns `""`, suppressing the top bar subtitle entirely for lesson pages.

---

### Fix 4 — Sidebar lesson list readability on course lesson viewer

**Problem:** Lesson titles in the sidebar followed the raw database format: "M1-L0-Outline of TAS-TAS Superhero". The course name suffix was redundant (the course title already appeared at the top of the sidebar) and the module/lesson code prefix was run together with the human-readable title, making the list hard to scan.

**Fix — `src/pages/client/AcademyLessonViewerPage.tsx`:**

1. Added `stripCourseSuffix` helper (inline, sidebar-only) that removes the trailing ` - {courseTitle}` suffix from lesson display titles using a regex with the course name escaped.
2. Code prefix matching `/^(M\d+-L?\d*)-?/i` is extracted and rendered as a small monospace badge (`text-[10px] font-mono bg-muted px-1 rounded`) alongside the human-readable remainder.

Lesson titles are unchanged everywhere else: breadcrumb, page heading, course overview.

---

## KB changes shipped

- None this session.

## Codebase observations

- `unicorn @ fbe741f8` — Issues 1–3 shipped: `AcademyPageWrapper` props removed, button label updated, `titleFromPath` lesson guard added.
- `unicorn @ 146a0960` — Issue 4 shipped: `stripCourseSuffix` helper + code prefix badge rendering in lesson sidebar.

## Decisions

- n/a

## Open questions parked

- The `AcademyPageWrapper` `title`/`subtitle`/`icon` props still exist on other Academy pages (My Courses, Certificates, etc.) — those pages do not have a competing `<h1>` inside the content area, so the duplication issue is PDP-specific. No action required on other pages unless a similar `<h1>` is introduced inside them.

## Tag

`audit-2026-05-26-academy-ui-fixes`
