## Wording-only correction for `parent_defined`

No behavioural changes. The auto-fill still consumes the full child package budget (zeroing the child) and the lock trigger stays as-is. The parent tenant's time is never touched — the package is simply shared across the two tenants.

### Files to update

**1. `src/components/client/AddTimeDialog.tsx`**

- `buildParentDefinedNote()` (line 84) — change the inserted note to:
  > `Time entry is locked for Child packages. All time is administered/allocated/entered against parent: {rto_id} - {rto_name}`
  
  (Keep the user-approved wording from the previous round — this is already correct.)

- Helper text under the work type selector (line 556) — replace:
  > "Locks the package and allocates its full consult time against parent: …"
  
  with:
  > "Shared package — locks this child's time entry. The parent organisation's time is not affected. Parent: {rto_id} - {rto_name}"

- Toast at line 321 — change description from `"Select a package to allocate to the parent organisation."` to `"Select a package to mark as parent-shared."`

- Toast at line 325 — keep ("No parent organisation … Set a parent relationship before using Parent Defined.").

**2. `src/components/client/EditTimeDialog.tsx`**

- Amber banner (line 326) — replace:
  > "This entry locks the package — all consult time is allocated against the parent organisation."
  
  with:
  > "This entry locks the package as parent-shared. The parent organisation's time is not affected — delete this entry to allow normal time entry on the child."

**3. `.lovable/plan.md`** — update the summary line so it doesn't say "consumes the entire package's consult budget … allocated to parent". Reword to: "zeros the child package's remaining time and marks it as shared with the parent — the parent's time is not debited."

### Out of scope
- DB trigger `trg_parent_defined_lock` (unchanged)
- `dd_work_types` (unchanged)
- Duration / date / billable auto-fill logic (unchanged)
- Any parent-side time entry creation (never existed, never will under this work type)