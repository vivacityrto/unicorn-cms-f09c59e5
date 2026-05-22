## Problem

`src/components/layout/AcademyTopBar.tsx` contains a non-functional "Search courses..." input in the center of the header. The `searchQuery` state is declared but never consumed — it filters nothing. The search block is dead UI taking up center space.

## Changes

File: `src/components/layout/AcademyTopBar.tsx`

### 1. Remove search block (lines 117–128)
Delete the entire `{/* Center: Course Search */}` block containing the `<Search>` icon and `<Input>`.

### 2. Remove `searchQuery` state (line 64)
Delete `const [searchQuery, setSearchQuery] = useState("");`.

### 3. Remove unused imports
- Remove `useState` from the `react` import (line 1).
- Remove `Search` from the `lucide-react` import (line 7).
- Remove `Input` from `@/components/ui/input` (line 12).

All three symbols are used only by the search block; removing them leaves no orphan imports.

### 4. Preserved behaviour
- Brand label (`<span>Academy</span>`), page title block, back-link, notification bell, and avatar dropdown are untouched.
- Staff `TopBar.tsx` is not modified.
- The header will show left brand/title and right actions with empty padding between them.

## Verification

| Condition | Expected |
|---|---|
| Any Academy page | Center search input is gone |
| Wide viewport (≥1024px) | Layout remains balanced, no broken flex alignment |
| Narrow viewport (<1024px) | No change — search was already `hidden lg:flex` |
| Build | Passes with no unused-variable or orphan-import errors |

Stop after this fix.