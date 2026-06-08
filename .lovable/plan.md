# Fix v_client_governance_documents view filter

## Overview
Replace the `v_client_governance_documents` view to tighten its package instance filter from `membership_state <> 'cancelled'` to `membership_state = 'active'`. This ensures the view only surfaces documents tied to currently active packages.

## Change Detail
- **File**: New Supabase migration
- **SQL**: `CREATE OR REPLACE VIEW public.v_client_governance_documents AS ...`
- **Edit**: In the `ranked` CTE, change the `LEFT JOIN` condition on `package_instances` from:
  `pi.membership_state <> 'cancelled'::text`
  to:
  `pi.membership_state = 'active'::text`
- **Impact**: No other view columns, joins, or window functions are modified. The view structure and `rn = 1` deduplication logic remain identical.

## Rollback
Re-running the previous view definition (with `<>`) restores the prior behavior if needed.

## Verification
After deployment, query `public.v_client_governance_documents` for a tenant with both active and cancelled package instances; only documents linked to active packages should appear.