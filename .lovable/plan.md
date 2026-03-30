

## Fix: Members Count Using Wrong Table

### Problem
All member count queries fetch from `users.tenant_id`, but the authoritative user-tenant relationship lives in the `tenant_users` junction table. Users linked via `tenant_users` who don't have `tenant_id` set on their `users` row will not be counted — resulting in tenants showing 0 members even though they have users.

### Fix
Switch all member count queries from `users` table to `tenant_users` table across 4 locations:

### Files to Change

1. **`src/pages/ManageTenants.tsx`** (~line 231)
   - Change: `supabase.from("users").select("tenant_id").in("tenant_id", tenantIds)`
   - To: `supabase.from("tenant_users").select("tenant_id").in("tenant_id", tenantIds)`

2. **`src/hooks/useClientManagement.tsx`** (~line 143)
   - Same change: query `tenant_users` instead of `users`

3. **`src/pages/PackageDetail.tsx`** (~line 711)
   - Same change: query `tenant_users` instead of `users`

4. **`src/pages/TenantDetail.tsx`** (~line 287)
   - Change: `supabase.from("users").select("*", { count: 'exact', head: true }).eq("tenant_id", ...)`
   - To: `supabase.from("tenant_users").select("*", { count: 'exact', head: true }).eq("tenant_id", ...)`

### Why This Fixes It
The `tenant_users` table is the canonical source of tenant membership. The `users.tenant_id` field is not reliably populated for all users, causing undercounts.

