## Problem

In `src/components/layout/AcademyTopBar.tsx`, the page title falls back to the string `"Academy"` when `location.pathname` is absent from the `academyRouteTitles` lookup. On dynamic sub-pages (e.g. `/academy/audience/student-support-officer`, `/client/academy/audience/administration-assistant`, etc.) this produces `[icon] Academy | Academy`.

## Changes

File: `src/components/layout/AcademyTopBar.tsx`

### 1. Replace pageTitle resolution (line 57)

Introduce a `titleFromPath(pathname: string)` helper:

1. Return the lookup value if present.
2. Otherwise split the path, take the last non-empty segment, replace dashes with spaces, and title-case it.
3. If the derived title is `"academy"` (case-insensitive) — meaning the user is on the root `/academy` path — return an empty string so the brand label stands alone.
4. Keep the lookup table itself unchanged.

### 2. Conditionally render divider + title block (lines 94-100)

Wrap the existing `<div className="h-8 w-px ..." />` divider and the following `<h1>{pageTitle}</h1>` block in `{pageTitle && (...)}` so neither element renders when the title is empty.

### 3. Preserved behaviour

- The static brand label `<span>Academy</span>` stays.
- The avatar dropdown, notification bell condition, back-link, search bar, and all other markup are untouched.
- Staff `TopBar.tsx` is not modified.

## Verification

| Route | Expected top bar |
|---|---|
| `/academy` | `[icon] Academy` only — no divider, no duplicate |
| `/academy/courses` | `[icon] Academy \| My Courses` |
| `/academy/audience/student-support-officer` | `[icon] Academy \| Student Support Officer` |
| `/academy/audience/administration-assistant` | `[icon] Academy \| Administration Assistant` |
| `/settings?tab=profile` | `[icon] Academy \| Profile Settings` |

Build must pass with no orphan imports or unused variables.
