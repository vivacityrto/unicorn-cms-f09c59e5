## Problem

On `/audits`, clicking **Create Audit** in Step 3 of the New Audit modal does nothing — no network request fires, no toast appears, no error logs.

## Root cause

In `src/components/audit/NewAuditModal.tsx`:

1. The modal opens with `tenants` empty, so `registrationType` is `null` and `auditTypeCards = ALL_CARDS`.
2. User picks a card on Step 1 (e.g. "Due Diligence" from `ALL_CARDS`) and advances to Step 2 / Step 3.
3. Tenants finish loading. For the chosen tenant (e.g. Smart Nation Education, `org_type='rto'`), `registrationType` resolves to `'rto_only'`, and `auditTypeCards` switches to `RTO_ONLY_CARDS`.
4. The cleanup effect at lines 314–322 then runs:

```ts
const stillValid = auditTypeCards.some(
  c => c.value === selectedCard.value
    && c.is_rto === selectedCard.is_rto
    && c.is_cricos === selectedCard.is_cricos
);
if (!stillValid) setSelectedCard(null);
```

The `ALL_CARDS` "Due Diligence" entry has different `is_rto`/`is_cricos` flags from the `RTO_ONLY_CARDS` "Due Diligence" entry, so `stillValid` is false. **`selectedCard` is silently set to `null` while the user is still on Step 3.**

5. `handleSave` immediately returns:

```ts
if (!selectedCard || !tenantId) return;
```

No mutation, no toast, no log. Button looks broken.

The same scenario can also be reached when tenantId changes after a card is selected, or when stage-preselection feeds a card that doesn't match the resolved `auditTypeCards` shape.

## Fix

Two small, isolated changes in `src/components/audit/NewAuditModal.tsx`. No other files touched.

### 1. Don't silently null `selectedCard` once the user has advanced past Step 1

Change the cleanup effect (lines 314–322) so it only clears the selection while the user is still on Step 1. Once they're on Step 2 or 3, keep the card they chose — the user already passed the type-selection gate.

```ts
useEffect(() => {
  if (step !== 1) return; // don't yank the card out from under the user mid-flow
  if (!selectedCard) return;
  const stillValid = auditTypeCards.some(
    c => c.value === selectedCard.value
      && c.is_rto === selectedCard.is_rto
      && c.is_cricos === selectedCard.is_cricos
  );
  if (!stillValid) setSelectedCard(null);
}, [registrationType, auditTypeCards, step]);
```

### 2. Surface a toast if `handleSave` is called without the required state

Replace the silent `return` in `handleSave` (line 380) so the user sees why nothing happened, and we get a console signal:

```ts
const handleSave = () => {
  if (!selectedCard || !tenantId) {
    console.warn('[NewAuditModal] Create blocked', { hasCard: !!selectedCard, tenantId });
    toast.error('Please select an audit type and client before creating.');
    return;
  }
  createAudit.mutate({ /* unchanged */ });
};
```

This is a defence-in-depth guard — fix #1 prevents the state from being cleared in the first place; fix #2 ensures any future regression is loud, not silent.

## Out of scope

- No changes to `useCreateAudit`, `client_audits` schema, RLS, or any other component.
- No restructure of the modal or its step flow.
- No change to the card selection UI on Step 1 — switching tenant on Step 1 still correctly clears an invalid card.
