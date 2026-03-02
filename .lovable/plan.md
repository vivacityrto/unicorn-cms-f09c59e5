

## Centralise Task/Stage Statuses from dd_status and Add Codes 4 + 5

### Problem

Status values are hardcoded across 6+ files, each with slightly different mappings. Some even contradict the database (e.g., `PackageStagesManager` maps code 2 to "Blocked" while `dd_status` has code 2 as "Completed"). None of them query `dd_status`.

### What Changes

**1. Database: Insert two new rows into dd_status**

| code | value | description |
|------|-------|-------------|
| 4 | core_complete | Core Complete |
| 5 | blocked | Blocked |

No schema migration needed -- these are data inserts into the existing table.

**2. New shared hook: `src/hooks/useTaskStatusOptions.ts`**

- Fetches from `dd_status` WHERE `code < 100`, ordered by `code`
- Returns `{ statuses, loading, getLabel(code), getIcon(code), getColor(code) }`
- Icon and colour mapping lives in this one file (a lookup by code), since `dd_status` doesn't store UI metadata:

```text
0 (Not Started)    -> Circle,       text-muted-foreground
1 (In Progress)    -> Clock,        text-blue-600
2 (Completed)      -> CheckCircle2, text-green-600
3 (N/A)            -> Ban,          text-muted-foreground
4 (Core Complete)  -> ShieldCheck,  text-emerald-500
5 (Blocked)        -> AlertCircle,  text-red-600
6-10 (future)      -> Circle,       text-muted-foreground
```

- Caches the query result so multiple components sharing it don't re-fetch

**3. Remove hardcoded STATUS arrays from these files:**

| File | What's removed/replaced |
|------|------------------------|
| `useStaffTaskInstances.ts` | Remove exported `STATUS_OPTIONS` constant; import shared hook for label lookups in toast messages |
| `useClientTaskInstances.ts` | Remove `CLIENT_TASK_STATUS_OPTIONS`; import shared hook |
| `useClientPackageInstances.tsx` | Remove `CLIENT_TASK_STATUS_OPTIONS`, `STAGE_STATUS_MAP`, `STAFF_TASK_STATUS_MAP`; import shared hook |
| `PackageStagesManager.tsx` | Remove local `STATUS_MAP` and `STATUS_OPTIONS` (lines 71-83); use shared hook for stage status dropdown and icons |
| `StageStaffTasks.tsx` | Remove local `STATUS_ICONS` and `STATUS_COLORS` (lines 24-36); use shared hook helpers |
| `StageClientTasks.tsx` | Remove local `STATUS_ICONS` and `STATUS_COLORS` (lines 23-35); use shared hook helpers |

**4. Fix the PackageStagesManager mismatch**

Currently code 2 is mapped to "Blocked" and code 3 to "Complete" in `PackageStagesManager` -- the opposite of what `dd_status` says. After this change, all mappings will be consistent with the database: 2 = Completed, 5 = Blocked.

Stage status dropdowns will show: Not Started (0), In Progress (1), Completed (2), N/A (3), Core Complete (4), Blocked (5).

**5. StageStatusControl.tsx -- left as-is**

This component uses text-based lifecycle statuses ('not_started', 'in_progress', 'blocked', 'waiting', 'complete', 'skipped') via an RPC. This is a different status domain and stays unchanged.

### Technical Notes

- The shared hook fetches once and caches. The `dd_status` table is tiny (under 20 rows) so performance is not a concern.
- Any future status additions only need: (1) insert into `dd_status`, (2) add one icon/colour entry in the shared hook.
- Components rendering status dropdowns will filter which codes to show based on context (e.g., stages might not show "N/A").

