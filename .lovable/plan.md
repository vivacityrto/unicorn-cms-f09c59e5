## Fix registrationType useMemo in NewAuditModal.tsx

Update `src/components/audit/NewAuditModal.tsx` (lines ~220–237) so `org_type` supplements missing registration fields instead of only acting as a final fallback.

### Change

Replace the current logic with:

```ts
const registrationType = useMemo(() => {
  if (!selectedTenant) return null;
  const hasRto = !!selectedTenant.rto_id;
  const cricosVal = selectedTenant.profile_cricos_number || selectedTenant.cricos_id;
  const hasCricos = !!cricosVal;
  const ot = selectedTenant.org_type; // org_type supplements missing registration fields
  if (hasRto && hasCricos) return 'both' as const;
  if (hasCricos && !hasRto) {
    if (ot === 'rto_cricos') return 'both' as const;
    return 'cricos_only' as const;
  }
  if (hasRto && !hasCricos) {
    if (ot === 'rto_cricos' || ot === 'cricos') return 'both' as const;
    return 'rto_only' as const;
  }
  if (ot === 'rto_cricos') return 'both' as const;
  if (ot === 'cricos') return 'cricos_only' as const;
  if (ot === 'rto') return 'rto_only' as const;
  return detectRegistrationType(selectedTenant.rto_id, cricosVal);
}, [selectedTenant]);
```

The "neither field set" fallback chain remains unchanged. No other files modified.