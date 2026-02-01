
# Fix Missing EOS Dropdown Options

## Problem Identified

The "Add Risk or Opportunity" form fields are empty because the database views that power the dropdown options do not exist in the production database:

| Missing Database Object | Purpose |
|------------------------|---------|
| `eos_issue_type_options` (view) | Type dropdown (Risk/Opportunity) |
| `eos_issue_category_options` (view) | Category dropdown (Delivery, Compliance, etc.) |
| `eos_issue_impact_options` (view) | Impact dropdown (Low, Medium, High, Critical) |
| `eos_issue_status_options` (view) | Status dropdown (Open, Discussing, etc.) |
| `eos_quarter_options` (view) | Quarter dropdown (Q1-Q4) |
| `eos_issue_status_transitions` (table) | Controls allowed status changes |

The network requests are returning **404 errors** with the message "relation does not exist" for each of these objects.

## Root Cause

The migrations that create these views and tables exist in the codebase but were not applied to the database, or they were inadvertently dropped.

## Solution

Create a migration that recreates all missing EOS option views and the status transitions table.

### Step 1: Create migration to restore EOS option views

```sql
-- Recreate EOS option views with security invoker

-- Type options (risk/opportunity)
CREATE VIEW public.eos_issue_type_options 
WITH (security_invoker = true) AS
SELECT unnest(ARRAY['risk', 'opportunity']) AS value;

-- Category options
CREATE VIEW public.eos_issue_category_options 
WITH (security_invoker = true) AS
SELECT unnest(ARRAY[
  'Delivery', 'Compliance', 'Financial', 'Capacity',
  'Systems', 'Client', 'Strategic', 'Growth'
]) AS value;

-- Impact options
CREATE VIEW public.eos_issue_impact_options 
WITH (security_invoker = true) AS
SELECT unnest(ARRAY['Low', 'Medium', 'High', 'Critical']) AS value;

-- Status options (from enum)
CREATE VIEW public.eos_issue_status_options 
WITH (security_invoker = true) AS
SELECT unnest(enum_range(NULL::eos_issue_status))::text AS value;

-- Quarter options (1-4)
CREATE VIEW public.eos_quarter_options 
WITH (security_invoker = true) AS
SELECT generate_series(1, 4) AS value;

-- Grant permissions
GRANT SELECT ON public.eos_issue_type_options TO authenticated, anon;
GRANT SELECT ON public.eos_issue_category_options TO authenticated, anon;
GRANT SELECT ON public.eos_issue_impact_options TO authenticated, anon;
GRANT SELECT ON public.eos_issue_status_options TO authenticated, anon;
GRANT SELECT ON public.eos_quarter_options TO authenticated, anon;
```

### Step 2: Create status transitions table

```sql
CREATE TABLE public.eos_issue_status_transitions (
  from_status eos_issue_status NOT NULL,
  to_status eos_issue_status NOT NULL,
  PRIMARY KEY (from_status, to_status)
);

-- Enable RLS and grant read access
ALTER TABLE public.eos_issue_status_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read transitions"
  ON public.eos_issue_status_transitions FOR SELECT
  TO authenticated USING (true);

-- Insert allowed transitions
INSERT INTO public.eos_issue_status_transitions (from_status, to_status) VALUES
  ('Open', 'Discussing'), ('Open', 'In Review'), ('Open', 'Archived'),
  ('Discussing', 'Actioning'), ('Discussing', 'Solved'), ('Discussing', 'Open'),
  ('In Review', 'Actioning'), ('In Review', 'Escalated'), ('In Review', 'Open'),
  ('Actioning', 'Solved'), ('Actioning', 'Escalated'), ('Actioning', 'Discussing'),
  ('Escalated', 'Actioning'), ('Escalated', 'Closed'), ('Escalated', 'Archived'),
  ('Solved', 'Closed'), ('Solved', 'Archived'),
  ('Closed', 'Archived'), ('Archived', 'Open');
```

## Expected Result

After the migration runs:
- The Type dropdown will show "Risk" and "Opportunity"
- The Category dropdown will show all 8 categories
- The Impact dropdown will show Low, Medium, High, Critical
- The Quarter dropdown will show Q1, Q2, Q3, Q4
- Status transitions will be enforced for edit operations

---

## Technical Details

### Files to be created

| File | Purpose |
|------|---------|
| `supabase/migrations/[timestamp]_restore_eos_option_views.sql` | Database migration to recreate all missing views and tables |

### No frontend changes required

The frontend code in `useEosOptions.ts` is correct and will work once the database objects are restored.
