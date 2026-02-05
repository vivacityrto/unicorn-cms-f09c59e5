
# Add Processes Summary Widget to Dashboard

## Summary
Add a new widget to the Membership Dashboard that displays recent and key processes, allowing Super Admin and Team Leader users to quickly see process activity without navigating to the full Processes page.

## What the Widget Will Show
- Recent processes (sorted by last updated)
- Process title, category, status, and owner
- Quick status indicators (Draft, Under Review, Approved)
- Click-through navigation to view/edit individual processes
- "View all" link to the full /processes page

## Visual Layout

```text
+--------------------------------------------------+
| Process Documents                   [View all >] |
+--------------------------------------------------+
| [Draft] test                        Operations   |
|         Angela Connell-Richards   Updated 2h ago |
+--------------------------------------------------+
| [Draft] Prospect Background      Sales & Mktg   |
|         Team Member               Updated 3h ago |
+--------------------------------------------------+
| [Approved] Onboarding Flow         Compliance   |
|            John Smith             Updated 1d ago |
+--------------------------------------------------+
|                No more processes                 |
+--------------------------------------------------+
```

## Technical Approach

### File Changes

1. **New file: `src/components/dashboard/ProcessesWidget.tsx`**
   - Create a new widget component following the existing patterns from MyWorkWidget and TimeInboxWidget
   - Query processes from Supabase using a dedicated hook
   - Display up to 5 most recently updated non-archived processes
   - Include status badges with colour coding (draft=secondary, under_review=yellow, approved=green)
   - Link each row to `/processes/{id}` for quick access
   - Include "View all" button linking to `/processes`

2. **New file: `src/hooks/useDashboardProcesses.ts`**
   - Lightweight hook specifically for the dashboard widget
   - Fetch only essential fields: id, title, category, status, owner info, updated_at
   - Limit to 5 records, ordered by updated_at descending
   - Filter out archived processes

3. **Update: `src/pages/MembershipDashboard.tsx`**
   - Import and add the ProcessesWidget after the TimeInboxWidget
   - Position in the left panel alongside other dashboard widgets

### Data Query
The widget will query processes with:
- Non-archived status only
- Join to users table for owner name
- Order by updated_at DESC
- Limit 5 results

### Component Structure
```
ProcessesWidget
  - Card container with header
  - Skeleton loading state
  - Empty state if no processes exist
  - List of ProcessRow items (max 5)
  - "View all" navigation button
```

### Status Badge Colours
- Draft: `variant="secondary"` (grey)
- Under Review: `bg-yellow-500/10 text-yellow-600` 
- Approved: `bg-green-500/10 text-green-600`

## No Database Changes Required
The widget uses the existing `processes` table with existing RLS policies. No schema modifications needed.

