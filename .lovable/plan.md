

## Fix: CRICOS-Aware Audit Type Cards Not Updating

### Root Cause Analysis

The detection logic and card arrays are correctly defined, but there are two issues:

1. **`CRICOS_INVALID_VALUES` is not comprehensive enough** — values like `'NA'` (no slash), `'none'`, `'None'`, or whitespace-only strings would pass through as valid CRICOS IDs, while others like `'N/A'` are correctly filtered. The `.includes()` check also uses exact match on trimmed input but the array doesn't cover all edge cases.

2. **Potential timing/state issue** — When the modal opens with `preselectedTenantId`, `tenantId` is set immediately but the `tenants` array loads asynchronously. If the async query returns data where `cricos_id` is technically non-null but an invalid placeholder (not in the filter list), or if there's a brief period where `selectedTenant` is undefined, the cards may render incorrectly.

3. **Selected card not re-evaluated when registration type changes** — When a user selects a card in Step 1 (from the wrong list), then selects a client in Step 2, then goes back to Step 1, the `selectedCard` state may still reference a card from the previous list. The card selection should be cleared when the registration type changes.

### Changes

**1. `src/types/clientAudits.ts`** — Make CRICOS detection more robust:
- Use case-insensitive comparison for invalid values
- Add `'NA'`, `'None'`, `'none'`, `'nil'` to the invalid list
- Use a helper function with `.toLowerCase().trim()` matching instead of exact `.includes()`

**2. `src/components/audit/NewAuditModal.tsx`** — Fix state management:
- Add a `useEffect` that clears `selectedCard` when `registrationType` changes (so going back to Step 1 after selecting a client shows the correct cards with no stale selection)
- Update the note text when no client is selected to: "Select a client to see recommended audit types."
- Ensure the registration type banner renders correctly with the tenant data

### Technical Details

```typescript
// Updated CRICOS detection (case-insensitive, broader coverage)
const CRICOS_INVALID_LOWER = ['', 'n/a', 'na', '-', 'tbc', 'tba', 'none', 'nil'];

export function detectRegistrationType(rtoId, cricosId) {
  const isRto = !!rtoId && rtoId.trim() !== '';
  const isCricos = !!cricosId && !CRICOS_INVALID_LOWER.includes(cricosId.trim().toLowerCase());
  ...
}

// Clear selected card when registration type changes
useEffect(() => {
  if (registrationType && selectedCard) {
    const stillValid = auditTypeCards.some(
      c => c.value === selectedCard.value && c.is_rto === selectedCard.is_rto && c.is_cricos === selectedCard.is_cricos
    );
    if (!stillValid) setSelectedCard(null);
  }
}, [registrationType, auditTypeCards]);
```

| Action | File |
|--------|------|
| Modify | `src/types/clientAudits.ts` — case-insensitive CRICOS detection |
| Modify | `src/components/audit/NewAuditModal.tsx` — clear stale card selection on registration type change, update note text |

