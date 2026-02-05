

# Fix: Database Constraint Mismatch for Process Categories

## Problem Summary

The error occurs because the database has a **check constraint** that only allows 5 category values, but the frontend form offers 10 categories:

| Database Allows | Frontend Uses |
|-----------------|---------------|
| operations      | operations |
| compliance      | compliance |
| eos             | eos |
| hr              | hr_people (mismatch!) |
| client_delivery | client_delivery |
| (none)          | sales_marketing |
| (none)          | finance |
| (none)          | it_systems |
| (none)          | governance |
| (none)          | risk_management |

When you selected "Sales & Marketing", it tried to insert `sales_marketing` which violates the constraint.

---

## Solution

Update the database constraint to include all the categories the application needs.

### Step 1: Database Migration

Create a migration to:

1. Drop the existing `processes_category_check` constraint
2. Add a new constraint with all 10 categories
3. Also update the `applies_to` constraint to align with frontend values

```text
SQL Changes:

-- Drop old constraint
ALTER TABLE public.processes 
DROP CONSTRAINT processes_category_check;

-- Add new constraint with all categories
ALTER TABLE public.processes 
ADD CONSTRAINT processes_category_check 
CHECK (category IN (
  'eos',
  'operations', 
  'compliance', 
  'client_delivery',
  'sales_marketing',
  'finance',
  'hr_people',
  'it_systems',
  'governance',
  'risk_management'
));

-- Also fix applies_to constraint if needed
ALTER TABLE public.processes 
DROP CONSTRAINT processes_applies_to_check;

ALTER TABLE public.processes 
ADD CONSTRAINT processes_applies_to_check 
CHECK (applies_to IN (
  'vivacity_internal', 
  'all_clients', 
  'specific_client'
));
```

### Step 2: No Frontend Changes Required

The frontend code in `src/hooks/useProcesses.tsx` and `src/pages/ProcessForm.tsx` already has the correct category list. Once the database constraint is updated, the form will work correctly.

---

## Technical Details

**Files to modify:**
- New migration file (database schema change only)

**Risk assessment:**
- Low risk: This is an additive change (allowing more values)
- No data migration needed (no existing data uses the new categories yet)
- Constraint is on the main `processes` table only

**Testing:**
After applying the migration, verify that creating a process with any of the 10 categories succeeds.

