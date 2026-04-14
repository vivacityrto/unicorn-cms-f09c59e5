

## Plan: Organisation Parent-Child Linking

### Overview
Add the ability to link organisations in parent-child relationships (informational only — no data sharing). A new `tenant_relationships` table stores the links, and the UI shows related organisations on the tenant detail page.

### Database Changes
Create a new `tenant_relationships` table:
- `id` (bigserial PK)
- `parent_tenant_id` (bigint, FK to tenants.id, NOT NULL)
- `child_tenant_id` (bigint, FK to tenants.id, NOT NULL)
- `notes` (text, nullable) — optional context for the relationship
- `created_by` (uuid, FK to auth.users) — audit trail
- `created_at` / `updated_at` — standard timestamps
- Unique constraint on `(parent_tenant_id, child_tenant_id)`
- Check constraint: `parent_tenant_id != child_tenant_id`
- RLS: Vivacity staff can read/write; tenant members can read relationships involving their tenant
- Indexes on both FK columns

### UI Changes

**1. "Related Organisations" section on Tenant Detail page**
- Add a small card/section (likely in the sidebar or below org details) titled "Related Organisations"
- Shows parent org (if any) with a link to navigate to it
- Shows child orgs (if any) as a list with links
- Each entry shows the org name and an optional note

**2. Add/Remove relationship dialog**
- A "Link Organisation" button (SuperAdmin/Vivacity only)
- Opens a dialog with:
  - Dropdown to select relationship direction (Parent / Child)
  - Searchable tenant selector to pick the other organisation
  - Optional notes field
- Remove link via a small delete button on each relationship row

### Files to Create/Modify
- **New migration**: `tenant_relationships` table + RLS policies
- **New component**: `src/components/tenant/TenantRelationships.tsx` — displays and manages links
- **Modified**: `src/pages/TenantDetail.tsx` — integrate the new component

### Security
- Only Vivacity staff (SuperAdmin, VivacityTeam) can create or delete relationships
- All tenant members can view relationships involving their tenant
- Audit via `created_by` and timestamps

