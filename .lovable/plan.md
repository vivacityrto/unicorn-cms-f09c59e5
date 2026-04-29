# Fix: Compliance mode "Tenant Required" for Super Admins

## Problem
`loadTenantContext()` in `AskVivPanel.tsx` only queries `tenant_members`. Super Admins have no rows there, so context never loads and compliance mode shows "Tenant Required".

## Change (single file: `src/components/ask-viv/AskVivPanel.tsx`)

1. **Line 46** — extend the existing `react-router-dom` import to also bring in `useLocation`:
   ```ts
   import { Link, useLocation } from "react-router-dom";
   ```

2. **Around line 99** — call `useLocation()` alongside the other hooks at the top of `AskVivPanel`:
   ```ts
   const location = useLocation();
   ```

3. **Inside `loadTenantContext()` (lines 167–189)** — after the `tenant_members` query block, add a fallback that parses `/tenant/:id` from the URL and fetches the tenant name:
   ```ts
   if (!tenantMember) {
     const match = location.pathname.match(/\/tenant\/(\d+)/);
     if (match) {
       const urlTenantId = parseInt(match[1], 10);
       const { data: tenantData } = await supabase
         .from("tenants")
         .select("id, name")
         .eq("id", urlTenantId)
         .single();
       if (tenantData) {
         setContext({
           tenant_id: tenantData.id,
           tenant_name: tenantData.name,
         });
       }
     }
   }
   ```

4. **Line 192** — add `location` to the `useEffect` dependency array:
   ```ts
   }, [user?.id, selectedMode, location]);
   ```

## Out of scope
- No other files touched.
- No schema, RLS, or migration changes.
- Existing `tenant_members` path is unchanged for users who have a row.

## Risk
Low. Fallback only runs when `tenantMember` is null and the URL matches `/tenant/<digits>`. `tenants` is readable for staff via existing RLS.
