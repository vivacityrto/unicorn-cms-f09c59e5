

# Auto-Derive `org_type` from Package History

## Problem
Most active tenants have `org_type = NULL` in `tenant_profile`, despite having packages that clearly indicate their organisation type (RTO, CRICOS, GTO, or combinations).

## Package-to-Org-Type Mapping

Based on the packages table, the derivation logic:

| Indicator | Packages |
|-----------|----------|
| **RTO** | KS-RTO, M-AM, M-DR, M-GR, M-RR, M-SAR, DOC-R, CHC, AV, ACC, FT-St, DD, GC, AO>2, PP, SH-AR, SK-EC, KS (legacy) |
| **CRICOS** | KS-CRI, M-BC, M-DC, M-GC, M-RC, M-SAC, DOC-C |
| **GTO** | KS-GTO, KS-GTO-N, M-GTO |

Combined logic:
- Has both RTO + CRICOS packages → `rto_cricos`
- Has only RTO packages → `rto`
- Has only CRICOS packages → `cricos`
- Has only GTO packages → `gto`
- Has none of the above → leave unchanged

## Implementation

### 1. Database function: `derive_org_type_for_tenant(p_tenant_id integer)`

A `SECURITY DEFINER` function that:
- Queries all `package_instances` for the tenant, joining to `packages` to get package names
- Determines if the tenant has RTO-indicator packages, CRICOS-indicator packages, or GTO-indicator packages
- Updates `tenant_profile.org_type` accordingly
- Only updates if `org_type` is currently NULL (does not override manual overrides)

### 2. Trigger on `package_instances` (AFTER INSERT)

Calls `derive_org_type_for_tenant` with the new row's `tenant_id` whenever a package instance is created. This ensures org_type stays current as packages are assigned.

### 3. One-time backfill

A single SQL statement that runs the derivation for all active tenants where `org_type IS NULL`.

### 4. Organisation Type Badge (from previous request)

Add a coloured badge to the tenant detail header showing the org_type:
- **RTO** → Vivacity Purple solid (`#7130A0`)
- **CRICOS** → Purple-to-Fuchsia gradient
- **RTO + CRICOS** → Purple-to-Fuchsia gradient (same, labelled "RTO + CRICOS")
- **GTO** → Aqua (`#23C0DD`)
- **Other** → Light Purple (`#DFD8E8`)

This badge component will read from `tenant_profile.org_type` and render next to the tenant name/status area on the tenant detail page.

## Files Changed

- **New SQL migration**: Creates `derive_org_type_for_tenant` function, trigger on `package_instances`, and runs backfill
- **New component**: `src/components/tenant/OrgTypeBadge.tsx` — renders the coloured badge
- **Modified**: Tenant detail header component — adds `OrgTypeBadge` next to existing badges

