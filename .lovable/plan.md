

# Renewal Lifecycle: Task Recurrence and Capped Time Carry-Over

## Overview

Two capabilities added to the renewal workflow:

1. **Task recurrence flag** on `staff_tasks` -- marks tasks as once-off or recurring (reset on renewal)
2. **Unused time carry-over** with a hard cap: carry-over can never exceed the package's own `included_minutes`, regardless of any prior carry-over balance

---

## 1. Task Recurrence Flag

### Database

Add a boolean column to the task template table:

```sql
ALTER TABLE staff_tasks ADD COLUMN is_recurring boolean NOT NULL DEFAULT false;
```

All existing tasks default to once-off (safe default). SuperAdmins flag recurring tasks via the Package Builder.

### Renewal reset logic

When `handleRenewPackage` executes, after updating `next_renewal_date`:

1. Fetch all `staff_task_instances` linked to this package instance's stage instances
2. Join to `staff_tasks` to check `is_recurring`
3. For recurring tasks: reset `status` to `not_started`, clear `completion_date`
4. Log the reset to `client_audit_log`

### Package Builder UI

Add a "Recurring (reset on renewal)" toggle on each staff task row in `PackageBuilderDetail.tsx`. Writes to `staff_tasks.is_recurring`.

---

## 2. Unused Time Carry-Over (Capped)

### Business rule

At renewal, the system calculates remaining unused minutes from the current renewal year. The amount that can be carried over is capped:

```text
carry_over = min(remaining_minutes, included_minutes)
```

**Why the cap matters**: If a previous renewal already carried over time, the current balance could exceed the package's own allocation. Only the package's included allocation can ever be carried forward -- no compounding of carry-over on carry-over.

Example:
- Package includes 600 minutes
- Previous carry-over added 200 minutes (negative entry from last renewal)
- User consumed 0 minutes this year
- Remaining balance = 800 minutes
- Carry-over allowed = min(800, 600) = **600 minutes** (not 800)

### Mechanism

A negative `duration_minutes` entry in `time_entries`:
- `duration_minutes`: negative value (e.g. -600)
- `work_type`: `carry_over`
- `notes`: "Carry-over of Xh Ym from [old period start] - [old period end]. Capped at package inclusion of Xh Ym."
- `start_at`: new renewal start date (so it falls within the new window)
- `source`: `system`
- `is_billable`: true

No schema changes needed on `time_entries`.

### Renewal Confirmation Dialog

New component `RenewalConfirmDialog.tsx` replaces the current direct renewal call:

1. Queries `v_package_burndown` for remaining minutes
2. Fetches `included_minutes` from `package_instances`
3. Calculates capped carry-over amount
4. Shows dialog with:
   - Package name and current renewal period dates
   - Remaining unused time
   - Eligible carry-over amount (with explanation if capped)
   - Two options: "Carry Over" or "Forfeit"
   - Confirm button to proceed
5. On confirm: updates `next_renewal_date`, optionally inserts the negative time entry, resets recurring tasks, logs everything to audit

### Audit trail

Logged to `client_audit_log`:
- `action`: `renewal_time_carry_over` or `renewal_time_forfeit`
- `details`: JSON with `{ remaining_minutes, carried_minutes, included_minutes, cap_applied, from_period, to_period }`

---

## Files Changed

| File | Change |
|------|--------|
| New migration | Add `is_recurring` to `staff_tasks` |
| `src/components/client/RenewalConfirmDialog.tsx` | **New** -- carry-over prompt with cap logic |
| `src/components/client/ClientPackagesTab.tsx` | Wire renewal through dialog; add recurring task reset after renewal |
| `src/pages/PackageBuilderDetail.tsx` | Add "Recurring" toggle to staff task rows |
| `src/integrations/supabase/types.ts` | Auto-updated after migration |

## What Does NOT Change

- Time entry creation / timer logic
- Burndown view calculations (negative entries already sum correctly)
- Finalisation workflow
- RLS policies
- `included_minutes` source of truth

