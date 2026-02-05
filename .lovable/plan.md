

# Fix Risks & Opportunities Default Status Filter

## Problem

Currently, the Risks & Opportunities page shows **all statuses** by default, displaying completed/closed items alongside open ones. The user wants to see only "Open" items by default, while still being able to change the filter to view other statuses.

---

## Solution

A single-line change to set the default status filter to `'Open'` instead of `'all'`.

---

## Implementation

### File: `src/pages/EosRisksOpportunities.tsx`

**Current code (line 42):**
```tsx
const [filterStatus, setFilterStatus] = useState<'all' | RiskOpportunityStatus>('all');
```

**Updated code:**
```tsx
const [filterStatus, setFilterStatus] = useState<'all' | RiskOpportunityStatus>('Open');
```

---

## Behaviour After Change

| Scenario | Result |
|----------|--------|
| Page loads | Only items with status "Open" are displayed |
| User selects "All Statuses" | All items are displayed (including Closed, Solved, etc.) |
| User selects specific status | Only items with that status are displayed |
| User clicks "Clear" filters | Filters reset to default (Open status) |

---

## Additional Consideration: Clear Button Behaviour

The "Clear" button currently resets all filters to `'all'`:

```tsx
onClick={() => { setFilterType('all'); setFilterCategory('all'); setFilterStatus('all'); }}
```

This should be updated to reset status back to `'Open'` to maintain consistency with the new default:

```tsx
onClick={() => { setFilterType('all'); setFilterCategory('all'); setFilterStatus('Open'); }}
```

The same applies to the "Critical Impact" stat card click handler (line 314) which also resets filters.

---

## Technical Details

### Files Changed
- `src/pages/EosRisksOpportunities.tsx` - 3 small changes:
  1. Line 42: Change default state from `'all'` to `'Open'`
  2. Line 314: Update Critical Impact card click to reset status to `'Open'`
  3. Line 375: Update Clear button to reset status to `'Open'`

### No Database Changes Required
This is purely a frontend filter change.

---

## Expected Outcome

1. When the page loads, users see only "Open" items
2. The status dropdown shows "Open" as selected by default
3. Users can still select "All Statuses" or any specific status
4. The "Clear" button returns the view to Open items only

