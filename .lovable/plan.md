## Problem

On Smart Nation Education Pty Ltd (badge shows **RTO + CRICOS**), the New Audit modal Step 1 only shows **3 RTO-only cards** (SRTO 2025 CHC, Mock ASQA Audit, RTO Due Diligence) — the CRICOS and Combined options are missing. Compare to the unfiltered list (image 2) which shows 6 cards.

## Root cause

The tenant has both `rto_id` and `cricos_id` set, but its `tenant_profile.org_type = 'rto'` (not `'rto_cricos'`). Two parts of the codebase disagree:

- `useClientManagement.tsx` (lines 324-327) overrides the badge to `rto_cricos` whenever the tenant has both `rto_id` and `cricos_id` — that's why the page badge correctly says "RTO + CRICOS".
- `NewAuditModal.tsx` (lines 220-229) trusts `tenant_profile.org_type` strictly. With `org_type='rto'` it picks `RTO_ONLY_CARDS` and hides the CRICOS / Combined options.

So the modal's filter is stricter than the badge's classification, and the user loses access to the audit types they should see.

## Fix

One change in `src/components/audit/NewAuditModal.tsx` — make `registrationType` mirror the badge logic by deriving from the actual registration fields first, and only fall back to the stored `org_type` when those fields are empty.

```ts
const registrationType = useMemo(() => {
  if (!selectedTenant) return null;

  // Match OrgTypeBadge: a tenant with both rto_id and cricos_id is dual-registered,
  // even when tenant_profile.org_type only says 'rto'.
  const hasRto = !!selectedTenant.rto_id;
  const cricosVal = selectedTenant.profile_cricos_number || selectedTenant.cricos_id;
  const hasCricos = !!cricosVal;
  if (hasRto && hasCricos) return 'both' as const;
  if (hasCricos && !hasRto) return 'cricos_only' as const;
  if (hasRto && !hasCricos) return 'rto_only' as const;

  // Fallback to stored org_type only when registration fields are absent
  const ot = selectedTenant.org_type;
  if (ot === 'rto_cricos') return 'both' as const;
  if (ot === 'cricos') return 'cricos_only' as const;
  if (ot === 'rto') return 'rto_only' as const;

  return detectRegistrationType(selectedTenant.rto_id, cricosVal);
}, [selectedTenant]);
```

After this fix, Smart Nation Education will resolve to `'both'` → `BOTH_CARDS` → 5 cards including Combined RTO + CRICOS CHC, CRICOS-only CHC, and Combined Due Diligence.

## Out of scope

- No changes to `useCreateAudit`, `tenant_profile.org_type` data, the badge component, RLS, or the card definitions themselves.
- Card filtering for `rto_only` and `cricos_only` tenants remains unchanged — they still see the curated short list.
