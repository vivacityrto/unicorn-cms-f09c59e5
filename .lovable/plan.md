

# Improve Issues Queue: Show Who Raised Each Issue and When

## Problem
The Issues Queue cards in the meeting IDS section don't show who raised the issue or when it was created, making it hard to understand context at a glance.

## Solution
Enhance each issue card in `IssuesQueue.tsx` to display:
- The **name and avatar** of the person who raised it (using `raised_by` field, falling back to `created_by`)
- The **relative date** it was created (e.g. "3 days ago")

## Changes

### 1. `src/components/eos/IssuesQueue.tsx`
- Import `useOwnerProfiles` hook to batch-resolve `raised_by` / `created_by` UUIDs into names and avatars
- Import `Avatar` and `AvatarFallback` from UI components
- Import `formatDistanceToNow` from `date-fns` for relative timestamps
- Extract unique raiser UUIDs from the issues list and pass to `useOwnerProfiles`
- Add a new row below each issue title showing:
  - Avatar with initials of the raiser
  - "Raised by [Name]" text
  - Relative timestamp (e.g. "3 days ago")

### Visual Layout (per issue card)

```text
+-------------------------------------------------------+
| [grip]  Issue Title          [Low] [Backlog]    [Open] |
|         Raised by Jane Smith - 3 days ago              |
|         Description preview text...                    |
+-------------------------------------------------------+
```

### No database or type changes required
The `raised_by`, `created_by`, and `created_at` fields already exist on the `eos_issues` table and the `EosIssue` TypeScript type.

