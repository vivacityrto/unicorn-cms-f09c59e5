

## Issue
When a user selects **Work Type = Meeting** in the Add Time Entry dialog, no Sub Type selector appears. The user wants to capture **what kind of meeting** was held, with these options:

1. Governance Meeting
2. General Meeting
3. Regulatory Support Meeting
4. Compliance Health Check
5. ASQA Audit/Meeting

## Current state
- `dd_work_sub_type` already supports categorisation (existing categories: `consultation`, `document`).
- `AddTimeDialog.tsx` (lines 463–488) only renders the Sub Type select when `workType` is `consultation`, `document_review`, or `document_development`.
- There is an existing `governance_meeting` sub-type, but it's miscategorised under `consultation` — it should live under the new `meeting` category instead.
- `EditTimeDialog.tsx` uses the same pattern and needs the same treatment for consistency.

## Plan

### 1. Database migration — seed `meeting` category in `dd_work_sub_type`
Insert (idempotent, ON CONFLICT DO NOTHING on `code`):

| code | label | category | sort_order |
|---|---|---|---|
| `governance_meeting_mt` | Governance Meeting | meeting | 1 |
| `general_meeting` | General Meeting | meeting | 2 |
| `regulatory_support_meeting` | Regulatory Support Meeting | meeting | 3 |
| `compliance_health_check_mt` | Compliance Health Check | meeting | 4 |
| `asqa_audit_meeting` | ASQA Audit/Meeting | meeting | 5 |

Note: codes are suffixed where they collide with existing consultation-category codes (`governance_meeting`, `compliance_health_check`) so we don't break historical entries. The existing consultation entries stay intact for audit history.

### 2. Frontend — extend sub-type filter logic
In **`src/components/client/AddTimeDialog.tsx`** (lines 464–467) and **`src/components/client/EditTimeDialog.tsx`** (same pattern), extend the category mapping:

```ts
const category = workType === 'consultation' ? 'consultation'
  : (workType === 'document_review' || workType === 'document_development') ? 'document'
  : workType === 'meeting' ? 'meeting'
  : null;
```

When Work Type = Meeting, the Sub Type select will populate with the 5 options above.

### 3. No changes to time entry persistence
`work_sub_type` (string code) already saves via existing logic. Reporting and audit trail continue to work unchanged because we're using the same `dd_work_sub_type` lookup.

## Files changed
- New migration: `supabase/migrations/<ts>_add_meeting_work_sub_types.sql`
- `src/components/client/AddTimeDialog.tsx` — extend category mapping
- `src/components/client/EditTimeDialog.tsx` — extend category mapping (parity)

