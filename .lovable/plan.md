
# Fix Issues Queue to Show All Open Issues in Meeting

## Problem Summary

When you add an issue from the **Risks & Opportunities page**, it's not visible in the meeting's **Issues Queue**. The queue only displays issues explicitly linked to that specific meeting via `meeting_id`.

**Evidence from database:**
| Field | Value |
|-------|-------|
| title | "Client Expectation & Consultant Allocation Clarity" |
| meeting_id | `NULL` |
| source | `ad_hoc` |
| status | `Open` |

The `useMeetingIssues` hook filters by `meeting_id=eq.{meetingId}`, so issues without a meeting link never appear.

## Solution Options

### Option A: Show All Open Tenant Issues in Meeting Queue (Recommended)
Change the Issues Queue to display:
1. All issues linked to this specific meeting, AND
2. All open issues for the tenant that haven't been solved yet (regardless of where they were created)

This follows the EOS principle: the IDS section should tackle any unresolved issues, not just those raised during this specific meeting.

### Option B: Allow "Import" of Existing Issues
Add an "Import Issue" button that lets the facilitator search and pull in existing issues from the R&O list into the current meeting's queue.

**Recommendation:** Implement Option A - it's simpler and matches EOS methodology where all open issues should be available for discussion.

---

## Implementation Plan (Option A)

### 1. Update useMeetingIssues Hook

Modify the hook to fetch:
- Issues where `meeting_id` equals current meeting, OR
- Issues where `meeting_id` is NULL AND `status` is 'Open' AND tenant matches

```text
File: src/hooks/useMeetingIssues.tsx
```

**Current Logic:**
```typescript
.eq('meeting_id', meetingId!)
```

**New Logic:**
```typescript
.or(`meeting_id.eq.${meetingId},and(meeting_id.is.null,status.eq.Open)`)
.eq('tenant_id', tenantId)
```

### 2. Update Hook to Accept Tenant ID

The hook needs access to the tenant ID to filter properly:

```typescript
export const useMeetingIssues = (meetingId?: string, tenantId?: number) => {
  const { data: issues, isLoading, refetch } = useQuery({
    queryKey: ['meeting-issues', meetingId, tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_issues')
        .select('*')
        .eq('tenant_id', tenantId!)
        .or(`meeting_id.eq.${meetingId},and(meeting_id.is.null,status.eq.Open)`)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as EosIssue[];
    },
    enabled: !!meetingId && !!tenantId,
  });

  return { issues, isLoading, refetch };
};
```

### 3. Update LiveMeetingView to Pass Tenant ID

Pass the meeting's `tenant_id` to the hook:

```typescript
const { issues } = useMeetingIssues(meetingId, meeting?.tenant_id);
```

### 4. Visual Indicator for Issue Source

In the IssuesQueue component, add a visual indicator to distinguish:
- Issues created in this meeting (show meeting icon or "This Meeting" badge)
- Issues from the backlog (show "Backlog" badge or different style)

```typescript
{issue.meeting_id === meetingId ? (
  <Badge variant="outline" className="text-xs">This Meeting</Badge>
) : (
  <Badge variant="secondary" className="text-xs">Backlog</Badge>
)}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useMeetingIssues.tsx` | Update query to include tenant-wide open issues |
| `src/components/eos/LiveMeetingView.tsx` | Pass tenant_id to the hook |
| `src/components/eos/IssuesQueue.tsx` | Add source badge to distinguish origin |

---

## Expected Outcome

After implementation:
- Issues Queue will show your "Client Expectation & Consultant Allocation Clarity" issue
- All open issues from the tenant will be available for IDS discussion
- Issues created within the meeting will be visually distinguished from backlog issues
- Solving an issue in the meeting will remove it from future meeting queues

---

## Technical Details

### Query Pattern

The Supabase PostgREST `.or()` filter syntax:

```typescript
// This retrieves:
// 1. Issues linked to this meeting (any status)
// 2. Open issues not linked to any meeting (backlog)
.or(`meeting_id.eq.${meetingId},and(meeting_id.is.null,status.eq.Open)`)
```

### Cache Invalidation

The query key includes tenant_id to ensure proper cache separation:
```typescript
queryKey: ['meeting-issues', meetingId, tenantId]
```
