
# Fix EOS Issues Table - Missing Columns for Meetings

## Problem Identified

The "Add Risk or Opportunity" form fails with error: "Could not find the 'source' column of 'eos_issues' in the schema cache"

The `eos_issues` table is missing two columns that the frontend code requires for both the Risks & Opportunities page and EOS Meeting IDS functionality:

| Missing Column | Purpose | Used By |
|---------------|---------|---------|
| `source` | Tracks where issue was created (ad_hoc, meeting_ids, ro_page) | RiskOpportunityForm, CreateIssueDialog, useRisksOpportunities |
| `meeting_segment_id` | Links issues to specific meeting segments (IDS phase tracking) | CreateIssueDialog, RiskOpportunityForm |

## Additional Issues Found

The `create_issue` RPC function also has problems:
- References non-existent columns (`owner_id`, `rock_id` instead of `assigned_to`, `linked_rock_id`)
- Uses incorrect status value (`'open'` instead of `'Open'` - case-sensitive enum)

## Solution

### Step 1: Add Missing Columns to `eos_issues`

```sql
-- Add source column with constraint
ALTER TABLE public.eos_issues
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ad_hoc';

ALTER TABLE public.eos_issues
  ADD CONSTRAINT eos_issues_source_check 
  CHECK (source IN ('ad_hoc', 'meeting_ids', 'ro_page'));

-- Add meeting_segment_id with foreign key
ALTER TABLE public.eos_issues
  ADD COLUMN IF NOT EXISTS meeting_segment_id UUID 
  REFERENCES public.eos_meeting_segments(id) ON DELETE SET NULL;
```

### Step 2: Fix the `create_issue` RPC Function

The existing RPC function references incorrect column names. It needs to be updated to:
- Use `assigned_to` instead of `owner_id`
- Use `linked_rock_id` instead of `rock_id`
- Use proper enum default for `status` (first enum value from database)
- Include the new `source` and `meeting_segment_id` parameters

```sql
CREATE OR REPLACE FUNCTION public.create_issue(
  p_tenant_id bigint,
  p_title text,
  p_description text DEFAULT NULL,
  p_priority text DEFAULT 'medium',
  p_assigned_to uuid DEFAULT NULL,
  p_meeting_id uuid DEFAULT NULL,
  p_linked_rock_id uuid DEFAULT NULL,
  p_meeting_segment_id uuid DEFAULT NULL,
  p_source text DEFAULT 'ad_hoc'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_issue_id UUID;
  v_priority_int INTEGER;
BEGIN
  -- Convert text priority to integer
  v_priority_int := CASE LOWER(p_priority)
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    ELSE 2
  END;

  INSERT INTO eos_issues (
    tenant_id,
    title,
    description,
    priority,
    assigned_to,
    meeting_id,
    linked_rock_id,
    meeting_segment_id,
    source,
    created_by
  ) VALUES (
    p_tenant_id,
    p_title,
    p_description,
    v_priority_int,
    COALESCE(p_assigned_to, auth.uid()),
    p_meeting_id,
    p_linked_rock_id,
    p_meeting_segment_id,
    p_source,
    auth.uid()
  )
  -- Status defaults to 'Open' from column default
  RETURNING id INTO v_issue_id;

  RETURN v_issue_id;
END;
$$;
```

## Expected Result

After the migration:
- The "Add Risk or Opportunity" form will successfully create items
- Issues created from EOS meetings will track which segment they came from
- The `source` field will correctly identify where issues originated:
  - `ad_hoc` - Quick add or unspecified
  - `meeting_ids` - Created during IDS segment of a meeting
  - `ro_page` - Created from the Risks & Opportunities page

## Technical Details

### Files to be created

| File | Purpose |
|------|---------|
| `supabase/migrations/[timestamp]_add_eos_issues_meeting_fields.sql` | Database migration for new columns and RPC fix |

### No frontend changes required

The frontend code already handles these fields correctly - only the database schema needs updating.

### Audit Considerations

The existing audit system captures changes via the `set_issue_status` RPC and stores details in `audit_eos_events` as JSONB. The new columns will automatically be included when issues are created or modified.
