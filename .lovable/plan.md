

## Fix: Show All Clients in Client Commitments Tenant Selector

### Problem
The tenant dropdown in the Client Commitments form currently filters to only Diamond-tier tenants (`.eq('tier', 'diamond')`). The dropdown appears empty because no tenants match that filter, and commitments should be assignable to any client.

### Changes

**File: `src/pages/ExecutiveClientCommitments.tsx`**

1. **Remove the Diamond-tier filter** from `fetchTenants` (line 78) -- load all non-system tenants instead of filtering by `tier = 'diamond'`
2. **Update description text** on line 250 from "Manage diamond-tier client commitments" to "Manage client commitments and deliverables"
3. **Update dialog description** on line 328 from "Add a new commitment for a diamond-tier client" to "Add a new commitment for a client"

### Technical Detail
The `fetchTenants` function will query `tenants` excluding system tenants (`.neq('is_system_tenant', true)`) and order by name, consistent with how other parts of the app load client lists (e.g., `useAddinLookups`).

