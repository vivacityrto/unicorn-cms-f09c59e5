

## Reorganise Manage Stages Layout

### Current State
The page uses `grid-cols-[1fr_320px]` — a narrow 320px right column where Quality Check and Stage Impact are **stacked vertically**, creating excessive white space on the left.

### Proposed Layout (matching your diagram)

```text
┌──────────────────────────┬─────────────────────┬─────────────────────┐
│  Title, badges, desc     │   Quality Check     │   Stage Impact      │
│  Simulate / Export       │   (card)            │   (card)            │
│  Draft / Publish         │                     │   Sync to Packages  │
│                          │                     │   7 Packages Using  │
│                          │                     │   Package list...   │
├──────────────────────────┴─────────────────────┴─────────────────────┤
│  Warnings (if any)                                                   │
├──────────────────────────────────────────────────────────────────────┤
│  Main content tabs (full width)                                      │
└──────────────────────────────────────────────────────────────────────┘
```

Header info takes ~50% left, Quality Check and Stage Impact sit **side by side** in the remaining ~50% right.

### Changes

**`src/pages/AdminStageDetail.tsx`**
- Change grid from `grid-cols-[1fr_320px]` to `grid-cols-1 lg:grid-cols-[1fr_1fr]` — equal halves
- Inside the right column, change stacking from vertical (`space-y-4`) to a **side-by-side grid**: `grid grid-cols-2 gap-4`
- Both panels sit next to each other at the same level

**`src/components/package-builder/StageImpactPanel.tsx`**
- Increase ScrollArea from `h-[200px]` to `h-[300px]` for longer package lists

### Files Modified
| File | Change |
|------|--------|
| `src/pages/AdminStageDetail.tsx` | Change grid proportions + make right column a 2-col sub-grid |
| `src/components/package-builder/StageImpactPanel.tsx` | Taller scroll area |

